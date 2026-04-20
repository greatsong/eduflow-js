import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * 사용자 정보 파일 기반 저장소
 * users/{googleId}.json 파일에 GitHub 토큰 등을 저장한다.
 */
export class UserStore {
  constructor(baseDir) {
    this.baseDir = join(baseDir, 'users');
  }

  /** users/ 디렉토리 초기화 */
  async init() {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

  /** 사용자 파일 경로 */
  _filePath(googleId) {
    // googleId에 경로 탈출 문자 방지
    const safeId = googleId.replace(/[^a-zA-Z0-9_-]/g, '');
    return join(this.baseDir, `${safeId}.json`);
  }

  /** 사용자 데이터 전체 읽기 (없으면 null) */
  async _read(googleId) {
    const fp = this._filePath(googleId);
    if (!existsSync(fp)) return null;
    try {
      return JSON.parse(await readFile(fp, 'utf-8'));
    } catch {
      return null;
    }
  }

  /** 사용자 데이터 전체 쓰기 */
  async _write(googleId, data) {
    await this.init();
    const fp = this._filePath(googleId);
    await writeFile(fp, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * GitHub 토큰 저장
   * @param {string} googleId - 구글 사용자 ID (sub)
   * @param {string} token - GitHub access token
   * @param {string} username - GitHub 사용자명
   */
  async saveGitHubToken(googleId, token, username) {
    const existing = (await this._read(googleId)) || {};
    existing.github = {
      token,
      username,
      connectedAt: new Date().toISOString(),
    };
    existing.updatedAt = new Date().toISOString();
    await this._write(googleId, existing);
  }

  /**
   * GitHub 토큰 조회
   * @returns {{ token: string, username: string, connectedAt: string } | null}
   */
  async getGitHubToken(googleId) {
    const data = await this._read(googleId);
    return data?.github || null;
  }

  /**
   * GitHub 토큰 삭제 (연동 해제)
   */
  async removeGitHubToken(googleId) {
    const data = await this._read(googleId);
    if (!data) return;
    delete data.github;
    data.updatedAt = new Date().toISOString();
    await this._write(googleId, data);
  }

  /**
   * 전체 사용자 목록 (관리자용)
   */
  async listUsers() {
    await this.init();
    const files = await readdir(this.baseDir);
    const users = [];
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(await readFile(join(this.baseDir, file), 'utf-8'));
        users.push({
          googleId: file.replace('.json', ''),
          hasGitHub: !!data.github,
          githubUsername: data.github?.username || null,
          updatedAt: data.updatedAt || null,
        });
      } catch { /* skip */ }
    }
    return users;
  }

  /**
   * 사용자의 프로젝트 배포 이력 조회 (관리자용)
   */
  async getUserProjects(googleId) {
    const data = await this._read(googleId);
    return data?.projects || [];
  }

  /**
   * 사용자의 프로젝트 배포 이력 추가
   */
  async addUserProject(googleId, projectInfo) {
    const existing = (await this._read(googleId)) || {};
    if (!existing.projects) existing.projects = [];
    // 같은 repoName이 있으면 업데이트
    const idx = existing.projects.findIndex((p) => p.repoName === projectInfo.repoName);
    if (idx >= 0) {
      existing.projects[idx] = { ...existing.projects[idx], ...projectInfo, updatedAt: new Date().toISOString() };
    } else {
      existing.projects.push({ ...projectInfo, deployedAt: new Date().toISOString() });
    }
    existing.updatedAt = new Date().toISOString();
    await this._write(googleId, existing);
  }
}
