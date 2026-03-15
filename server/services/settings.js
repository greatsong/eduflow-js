import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

const DEFAULT_SETTINGS = {
  apiMode: 'user',                                          // 'server' | 'user'
  serverModeMessage: '이 서비스는 현재 API 키가 제공됩니다.', // 서버 모드일 때 안내 메시지
  allowedModels: [],                                         // 빈 배열 = 모든 모델 허용
  registrationMode: 'open',                                  // 'open' | 'approval'
  adminApiKeys: {                                            // 관리자가 UI에서 입력한 API 키
    anthropic: { key: '', shared: false },                   // shared: true → 모든 사용자 제공
    openai:    { key: '', shared: false },                   // shared: false → 관리자만 사용
    google:    { key: '', shared: false },
    upstage:   { key: '', shared: false },
  },
};

/**
 * 서버 운영 설정 관리 (파일 기반)
 * data/settings.json 에 저장
 */
export class ServerSettings {
  constructor(filePath) {
    this.filePath = filePath;
  }

  /** 현재 설정 읽기 */
  async get() {
    if (!existsSync(this.filePath)) {
      return { ...DEFAULT_SETTINGS };
    }
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  /** 설정 업데이트 (부분 업데이트 가능) */
  async update(partial) {
    const current = await this.get();
    const updated = { ...current, ...partial, updatedAt: new Date().toISOString() };

    // 디렉토리 생성
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(this.filePath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }
}
