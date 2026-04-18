import { readFile, writeFile, readdir, unlink, stat, mkdir } from 'fs/promises';
import { join, extname, parse as parsePath } from 'path';
import { existsSync } from 'fs';

// 지원 포맷 및 MIME 타입
const MIME_TYPES = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.markdown': 'text/markdown',
  '.text': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.hwp': 'application/x-hwp',
  '.hwpx': 'application/x-hwpx',
};

// 직접 텍스트로 읽을 수 있는 확장자
const TEXT_READABLE_EXTS = ['.txt', '.md', '.markdown', '.text', '.csv', '.json'];

// readFileContent()에서 파싱 가능한 모든 확장자
const PARSEABLE_EXTS = [
  ...TEXT_READABLE_EXTS,
  '.pdf', '.docx', '.xlsx', '.xls', '.html', '.htm', '.hwp', '.hwpx',
];

function getMimeType(filename) {
  const ext = extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export class ReferenceManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.referencesPath = join(projectPath, 'references');
  }

  async ensureDir() {
    if (!existsSync(this.referencesPath)) {
      await mkdir(this.referencesPath, { recursive: true });
    }
  }

  async saveFile(buffer, filename) {
    await this.ensureDir();
    let filePath = join(this.referencesPath, filename);

    // 중복 파일명 처리
    if (existsSync(filePath)) {
      const { name, ext } = parsePath(filename);
      let counter = 1;
      while (existsSync(filePath)) {
        filePath = join(this.referencesPath, `${name}_${counter}${ext}`);
        counter++;
      }
    }

    await writeFile(filePath, buffer);
    return filePath;
  }

  async listFiles() {
    await this.ensureDir();
    const entries = await readdir(this.referencesPath);
    const files = [];

    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const filePath = join(this.referencesPath, name);
      try {
        const stats = await stat(filePath);
        if (!stats.isFile()) continue;
        const ext = extname(name).toLowerCase();
        files.push({
          name,
          path: filePath,
          size: stats.size,
          type: getMimeType(name),
          parseable: PARSEABLE_EXTS.includes(ext),
          format: ext.replace('.', ''),
        });
      } catch {
        continue;
      }
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 모든 지원 포맷에서 텍스트를 추출하는 통합 메서드
   * @returns {{ content: string|null, status: 'ok'|'parse_error'|'unsupported'|'not_found', format: string, error?: string }}
   */
  async readFileContent(filename) {
    const filePath = join(this.referencesPath, filename);
    if (!existsSync(filePath)) {
      return { content: null, status: 'not_found', format: '' };
    }

    const ext = extname(filename).toLowerCase();

    try {
      // 텍스트 파일 — 직접 읽기
      if (TEXT_READABLE_EXTS.includes(ext)) {
        const content = await readFile(filePath, 'utf-8');
        return { content, status: 'ok', format: 'text' };
      }

      // PDF
      if (ext === '.pdf') {
        const pdfParse = (await import('pdf-parse')).default;
        const buffer = await readFile(filePath);
        const data = await pdfParse(buffer);
        if (!data.text || data.text.trim().length === 0) {
          return { content: null, status: 'parse_error', format: 'pdf', error: '텍스트를 추출할 수 없습니다 (이미지 PDF일 수 있음)' };
        }
        return { content: data.text, status: 'ok', format: 'pdf', pages: data.numpages };
      }

      // DOCX
      if (ext === '.docx') {
        const mammoth = await import('mammoth');
        const buffer = await readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        return { content: result.value, status: 'ok', format: 'docx' };
      }

      // XLSX / XLS
      if (ext === '.xlsx' || ext === '.xls') {
        const XLSX = (await import('xlsx')).default || (await import('xlsx'));
        const buffer = await readFile(filePath);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        let text = '';
        for (const sheetName of workbook.SheetNames) {
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          text += `[시트: ${sheetName}]\n${csv}\n\n`;
        }
        return { content: text.trim(), status: 'ok', format: 'spreadsheet' };
      }

      // HTML / HTM
      if (ext === '.html' || ext === '.htm') {
        const TurndownService = (await import('turndown')).default;
        const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
        const html = await readFile(filePath, 'utf-8');
        const markdown = td.turndown(html);
        return { content: markdown, status: 'ok', format: 'html' };
      }

      // HWP (한글 문서)
      if (ext === '.hwp') {
        try {
          const hwpjs = await import('@ohah/hwpjs');
          const buffer = await readFile(filePath);
          // @ohah/hwpjs API — toMarkdown 또는 toJSON 사용
          const result = hwpjs.toMarkdown ? hwpjs.toMarkdown(buffer) : null;
          if (result) {
            return { content: result, status: 'ok', format: 'hwp' };
          }
          // fallback: toJSON에서 텍스트 추출
          if (hwpjs.toJSON) {
            const json = hwpjs.toJSON(buffer);
            const text = JSON.stringify(json, null, 2);
            return { content: text, status: 'ok', format: 'hwp' };
          }
          return { content: null, status: 'parse_error', format: 'hwp', error: 'HWP 파서가 이 파일을 처리할 수 없습니다' };
        } catch (e) {
          return { content: null, status: 'parse_error', format: 'hwp', error: `HWP 파싱 실패: ${e.message}` };
        }
      }

      // HWPX (XML 기반 한글 문서 — ZIP 컨테이너)
      if (ext === '.hwpx') {
        try {
          const { createReadStream } = await import('fs');
          const { default: unzipper } = await import('unzipper').catch(() => ({ default: null }));

          // unzipper가 없으면 Node.js 내장 zlib 대안 사용
          if (!unzipper) {
            // 간단한 대안: HWPX 내부의 XML에서 텍스트 추출 시도
            return { content: null, status: 'parse_error', format: 'hwpx', error: 'HWPX 파서를 사용할 수 없습니다 (unzipper 미설치)' };
          }

          const buffer = await readFile(filePath);
          const directory = await unzipper.Open.buffer(buffer);
          let text = '';
          for (const entry of directory.files) {
            // HWPX 구조: Contents/section0.xml, section1.xml, ...
            if (entry.path.match(/Contents\/section\d+\.xml/i)) {
              const xml = (await entry.buffer()).toString('utf-8');
              // XML 태그 제거하여 텍스트만 추출
              const cleaned = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              text += cleaned + '\n\n';
            }
          }
          if (text.trim()) {
            return { content: text.trim(), status: 'ok', format: 'hwpx' };
          }
          return { content: null, status: 'parse_error', format: 'hwpx', error: 'HWPX에서 텍스트를 추출할 수 없습니다' };
        } catch (e) {
          return { content: null, status: 'parse_error', format: 'hwpx', error: `HWPX 파싱 실패: ${e.message}` };
        }
      }

      // 지원하지 않는 형식
      return { content: null, status: 'unsupported', format: ext };
    } catch (e) {
      return { content: null, status: 'parse_error', format: ext, error: e.message };
    }
  }

  /**
   * 기존 호환 메서드 — 텍스트 파일만 읽기 (v1 호환)
   */
  async readFile(filename) {
    const filePath = join(this.referencesPath, filename);
    if (!existsSync(filePath)) return null;

    if (!TEXT_READABLE_EXTS.includes(extname(filename).toLowerCase())) return null;

    try {
      return await readFile(filePath, 'utf-8');
    } catch (e) {
      console.error('파일 읽기 오류:', e.message);
      return null;
    }
  }

  async deleteFile(filename) {
    const filePath = join(this.referencesPath, filename);
    if (!existsSync(filePath)) return false;
    try {
      await unlink(filePath);
      return true;
    } catch (e) {
      console.error('파일 삭제 오류:', e.message);
      return false;
    }
  }

  async searchFiles(keyword) {
    const all = await this.listFiles();
    const lower = keyword.toLowerCase();
    return all.filter((f) => f.name.toLowerCase().includes(lower));
  }

  async getTotalSize() {
    const files = await this.listFiles();
    return files.reduce((sum, f) => sum + f.size, 0);
  }
}
