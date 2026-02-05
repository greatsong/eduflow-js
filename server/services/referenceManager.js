import { readFile, writeFile, readdir, unlink, stat, mkdir } from 'fs/promises';
import { join, extname, parse as parsePath } from 'path';
import { existsSync } from 'fs';
import { lookup } from 'mime-types';

// mime-types가 없으면 간단한 폴백
function getMimeType(filename) {
  const ext = extname(filename).toLowerCase();
  const types = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.markdown': 'text/markdown',
    '.json': 'application/json',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',
  };
  return types[ext] || 'application/octet-stream';
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
        files.push({
          name,
          path: filePath,
          size: stats.size,
          type: getMimeType(name),
        });
      } catch {
        continue;
      }
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  async readFile(filename) {
    const filePath = join(this.referencesPath, filename);
    if (!existsSync(filePath)) return null;

    const textExts = ['.txt', '.md', '.markdown', '.text'];
    if (!textExts.includes(extname(filename).toLowerCase())) return null;

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
