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

// 확장자별 최대 파싱 크기 (바이트). 이 한도 초과 시 parse_error 반환 — 서버 OOM 방지.
// multer 업로드 한도(50MB)와 별개로, 파서가 메모리에 전부 올릴 때 실제 안전선.
export const MAX_PARSE_SIZE = {
  '.pdf': 50 * 1024 * 1024,   // 50MB
  '.docx': 20 * 1024 * 1024,  // 20MB
  '.xlsx': 20 * 1024 * 1024,
  '.xls': 20 * 1024 * 1024,
  '.hwp': 20 * 1024 * 1024,
  '.hwpx': 20 * 1024 * 1024,
  '.html': 10 * 1024 * 1024,
  '.htm': 10 * 1024 * 1024,
  default: 10 * 1024 * 1024,  // 텍스트 계열
};

function getMaxParseSize(ext) {
  return MAX_PARSE_SIZE[ext] ?? MAX_PARSE_SIZE.default;
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

/**
 * HTML을 Turndown으로 변환하기 전 사전 정리.
 * - <style>, <script>, <noscript>, <!-- --> 블록 제거 → CSS/JS 코드가 본문에 섞이는 것 방지
 * - data:image/...;base64,... 속성 값은 빈 src로 치환 → 수십KB 잡음 제거
 */
function preCleanHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    // data: URL (base64 이미지 등) — 속성 값 안쪽 통째 제거
    .replace(/(src|href)\s*=\s*(["'])\s*data:[^"']*\2/gi, '$1=""')
    .replace(/url\(\s*["']?\s*data:[^)]*\)/gi, 'url("")');
}

/**
 * 모든 포맷의 파싱 결과에 공통 적용되는 텍스트 정규화.
 * - 남아있는 data: URL 토큰 제거 (DOCX/PDF에도 드물게 등장)
 * - 과도한 공백/빈 줄 압축 (연속 3개 이상 빈 줄 → 2개)
 * - 탭 → 공백 1, NBSP → 공백
 * - 줄 양끝 공백 트림
 */
function normalizeText(text) {
  if (!text) return text;
  return text
    // data: URL 잔여 토큰 (CSS·DOCX·HTML 공통)
    .replace(/data:[a-z0-9+/.\-]+;[a-z0-9=;,]*base64,[A-Za-z0-9+/=]+/gi, '')
    // 극단적으로 긴 공백 없는 토큰 (base64 잔해) — 800자 이상 연속 non-space 문자열 제거
    .replace(/\S{800,}/g, '')
    // CRLF → LF
    .replace(/\r\n/g, '\n')
    // NBSP → 일반 공백
    .replace(/\u00a0/g, ' ')
    // 줄 양끝 공백 제거
    .split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n')
    // 빈 줄 3개 이상 → 2개로 압축
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

    // 파일 크기 한도 검사 (대용량 파일로 인한 서버 OOM 방지)
    try {
      const fileStat = await stat(filePath);
      const limit = getMaxParseSize(ext);
      if (fileStat.size > limit) {
        return {
          content: null,
          status: 'parse_error',
          format: ext.replace('.', ''),
          error: `파일이 너무 큽니다: ${formatSize(fileStat.size)} (한도 ${formatSize(limit)}). 분할 업로드를 권장합니다.`,
        };
      }
    } catch {
      // stat 실패는 아래 로직에서 처리
    }

    try {
      // 텍스트 파일 — 직접 읽기
      if (TEXT_READABLE_EXTS.includes(ext)) {
        const content = await readFile(filePath, 'utf-8');
        return { content: normalizeText(content), status: 'ok', format: 'text' };
      }

      // PDF
      if (ext === '.pdf') {
        const pdfParse = (await import('pdf-parse')).default;
        const buffer = await readFile(filePath);
        const data = await pdfParse(buffer);
        if (!data.text || data.text.trim().length === 0) {
          return { content: null, status: 'parse_error', format: 'pdf', error: '텍스트를 추출할 수 없습니다 (이미지 PDF일 수 있음)' };
        }
        return { content: normalizeText(data.text), status: 'ok', format: 'pdf', pages: data.numpages };
      }

      // DOCX
      if (ext === '.docx') {
        const mammoth = await import('mammoth');
        const buffer = await readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        return { content: normalizeText(result.value), status: 'ok', format: 'docx' };
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
        return { content: normalizeText(text), status: 'ok', format: 'spreadsheet' };
      }

      // HTML / HTM
      if (ext === '.html' || ext === '.htm') {
        const TurndownService = (await import('turndown')).default;
        const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
        const rawHtml = await readFile(filePath, 'utf-8');
        const cleanHtml = preCleanHtml(rawHtml);
        const markdown = td.turndown(cleanHtml);
        return { content: normalizeText(markdown), status: 'ok', format: 'html' };
      }

      // HWP (한글 문서)
      if (ext === '.hwp') {
        try {
          const hwpjs = await import('@ohah/hwpjs');
          const buffer = await readFile(filePath);
          // @ohah/hwpjs API — toMarkdown 또는 toJSON 사용
          const result = hwpjs.toMarkdown ? hwpjs.toMarkdown(buffer) : null;
          if (result) {
            return { content: normalizeText(result), status: 'ok', format: 'hwp' };
          }
          // fallback: toJSON에서 텍스트 추출
          if (hwpjs.toJSON) {
            const json = hwpjs.toJSON(buffer);
            const text = JSON.stringify(json, null, 2);
            return { content: normalizeText(text), status: 'ok', format: 'hwp' };
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
            return { content: normalizeText(text), status: 'ok', format: 'hwpx' };
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

  /**
   * 모든 참고자료를 병렬로 파싱해 텍스트 배열로 반환한다.
   * 기존 chapterGenerator._loadReferences의 순차 로직을 교체.
   * @param {object} opts
   * @param {number} opts.concurrency 동시 파싱 수 (기본 4)
   * @returns {Promise<Array<{ name: string, content: string|null, status: string, error?: string }>>}
   */
  async loadAllParsed({ concurrency = 4 } = {}) {
    const files = await this.listFiles();
    if (files.length === 0) return [];

    const results = new Array(files.length);
    let idx = 0;

    const worker = async () => {
      while (true) {
        const i = idx++;
        if (i >= files.length) return;
        const file = files[i];
        try {
          const r = await this.readFileContent(file.name);
          results[i] = { name: file.name, ...r };
        } catch (e) {
          results[i] = {
            name: file.name,
            content: null,
            status: 'parse_error',
            format: file.format,
            error: e.message,
          };
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }
}
