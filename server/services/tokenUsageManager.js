import { readFile, writeFile, appendFile, mkdir, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

/**
 * 토큰 사용량 추적 & 비용 계산 서비스
 *
 * 저장 구조:
 *   /data/token-usage/
 *   ├── 2026-03/
 *   │   ├── 2026-03-12.jsonl   ← 일별 JSONL (append-only)
 *   │   └── 2026-03-13.jsonl
 *   └── (월별 디렉토리)
 *
 * 레코드: { ts, userId, userName, userEmail, projectId, action, provider, model,
 *           inputTokens, outputTokens, cost, keySource }
 */
export class TokenUsageManager {
  constructor(baseDir) {
    this.baseDir = join(baseDir, 'token-usage');
    this._pricingCache = null;
    this._pricingCacheTime = 0;
  }

  // ──────────────────────────────────────────────
  // 가격 로드 (model_config.json 기반, 60초 캐시)
  // ──────────────────────────────────────────────

  async loadPricing() {
    const now = Date.now();
    if (this._pricingCache && now - this._pricingCacheTime < 60_000) {
      return this._pricingCache;
    }

    const configPath = join(dirname(this.baseDir), '..', 'model_config.json');
    const fallback = {
      'claude-opus-4-7':              { input: 5.0,  output: 25.0 },
      'claude-opus-4-6':              { input: 5.0,  output: 25.0 },
      'claude-opus-4-5-20251101':     { input: 5.0,  output: 25.0 },
      'claude-sonnet-4-6':            { input: 3.0,  output: 15.0 },
      'claude-sonnet-4-5-20250929':   { input: 3.0,  output: 15.0 },
      'claude-sonnet-4-20250514':     { input: 3.0,  output: 15.0 },
      'claude-haiku-4-5-20251001':    { input: 0.8,  output: 4.0  },
      'gpt-5.4-pro':                  { input: 30.0, output: 180.0 },
      'gpt-5.4':                      { input: 2.5,  output: 15.0 },
      'gpt-5.3':                      { input: 1.75, output: 14.0 },
      'gpt-5.1':                      { input: 1.25, output: 10.0 },
      'gpt-5-mini':                   { input: 0.25, output: 2.0  },
      'gpt-5-nano':                   { input: 0.05, output: 0.40 },
      'gemini-3.1-pro-preview':       { input: 2.0,  output: 12.0 },
      'gemini-3-flash-preview':       { input: 0.50, output: 3.0  },
      'gemini-3.1-flash-lite-preview':{ input: 0.25, output: 1.50 },
      'solar-pro3':                   { input: 1.0,  output: 4.0  },
    };

    try {
      if (existsSync(configPath)) {
        const config = JSON.parse(await readFile(configPath, 'utf-8'));
        const pricing = {};
        for (const m of config.models || []) {
          if (m.id && m.pricing) {
            pricing[m.id] = m.pricing;
          }
        }
        if (Object.keys(pricing).length > 0) {
          this._pricingCache = { ...fallback, ...pricing };
          this._pricingCacheTime = now;
          return this._pricingCache;
        }
      }
    } catch { /* fall through */ }

    this._pricingCache = fallback;
    this._pricingCacheTime = now;
    return fallback;
  }

  /**
   * 비용 계산 ($/1M tokens 단위 → 달러)
   */
  calcCost(model, inputTokens, outputTokens, pricing) {
    const p = pricing[model] || { input: 3.0, output: 15.0 }; // 기본값: Sonnet급
    const inputCost  = (inputTokens  / 1_000_000) * p.input;
    const outputCost = (outputTokens / 1_000_000) * p.output;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 소수점 6자리
  }

  // ──────────────────────────────────────────────
  // 사용량 기록 (fire-and-forget)
  // ──────────────────────────────────────────────

  /**
   * 토큰 사용량 레코드 기록
   * 에러 발생 시 콘솔 로그만 남기고, AI 응답에 영향 없음
   */
  async record({ userId, userName, userEmail, projectId, action, provider, model, inputTokens, outputTokens, keySource }) {
    try {
      const pricing = await this.loadPricing();
      const cost = this.calcCost(model, inputTokens || 0, outputTokens || 0, pricing);

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // 2026-03-12
      const monthStr = dateStr.slice(0, 7);             // 2026-03

      const monthDir = join(this.baseDir, monthStr);
      if (!existsSync(monthDir)) {
        await mkdir(monthDir, { recursive: true });
      }

      const record = {
        ts: now.toISOString(),
        userId: userId || 'anonymous',
        userName: userName || '',
        userEmail: userEmail || '',
        projectId: projectId || '',
        action: action || 'unknown',
        provider: provider || '',
        model: model || '',
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        cost,
        keySource: keySource || 'server',
      };

      const filePath = join(monthDir, `${dateStr}.jsonl`);
      await appendFile(filePath, JSON.stringify(record) + '\n', 'utf-8');
    } catch (err) {
      console.error('[TokenUsage] 기록 실패:', err.message);
    }
  }

  // ──────────────────────────────────────────────
  // 통계 조회
  // ──────────────────────────────────────────────

  /**
   * 지정 기간의 모든 레코드 로드
   * @param {number} days - 최근 N일 (기본 30)
   */
  async _loadRecords(days = 30) {
    const records = [];
    const now = new Date();

    // 필요한 날짜 범위의 파일만 로드
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const monthStr = dateStr.slice(0, 7);
      const filePath = join(this.baseDir, monthStr, `${dateStr}.jsonl`);

      if (!existsSync(filePath)) continue;

      try {
        const content = await readFile(filePath, 'utf-8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            records.push(JSON.parse(line));
          } catch { /* 손상된 줄 무시 */ }
        }
      } catch { /* 파일 읽기 실패 무시 */ }
    }

    return records;
  }

  /**
   * 관리자 통계 API용 전체 집계
   */
  async getStats(days = 30) {
    const records = await this._loadRecords(days);

    // 전체 합계
    let totalInput = 0, totalOutput = 0, totalCost = 0;
    for (const r of records) {
      totalInput  += r.inputTokens || 0;
      totalOutput += r.outputTokens || 0;
      totalCost   += r.cost || 0;
    }

    // 사용자별 집계
    const userMap = {};
    for (const r of records) {
      const key = r.userId || 'anonymous';
      if (!userMap[key]) {
        userMap[key] = { userId: key, name: r.userName || '', email: r.userEmail || '', input: 0, output: 0, cost: 0, callCount: 0 };
      }
      userMap[key].input     += r.inputTokens || 0;
      userMap[key].output    += r.outputTokens || 0;
      userMap[key].cost      += r.cost || 0;
      userMap[key].callCount += 1;
      // 최신 이름 업데이트
      if (r.userName) userMap[key].name = r.userName;
      if (r.userEmail) userMap[key].email = r.userEmail;
    }

    // 모델별 집계
    const modelMap = {};
    for (const r of records) {
      const key = r.model || 'unknown';
      if (!modelMap[key]) {
        modelMap[key] = { model: key, provider: r.provider || '', input: 0, output: 0, cost: 0, callCount: 0 };
      }
      modelMap[key].input     += r.inputTokens || 0;
      modelMap[key].output    += r.outputTokens || 0;
      modelMap[key].cost      += r.cost || 0;
      modelMap[key].callCount += 1;
    }

    // 액션별 집계
    const actionMap = {};
    for (const r of records) {
      const key = r.action || 'unknown';
      if (!actionMap[key]) {
        actionMap[key] = { action: key, input: 0, output: 0, cost: 0, callCount: 0 };
      }
      actionMap[key].input     += r.inputTokens || 0;
      actionMap[key].output    += r.outputTokens || 0;
      actionMap[key].cost      += r.cost || 0;
      actionMap[key].callCount += 1;
    }

    // 일별 집계
    const dailyMap = {};
    const today = new Date();
    for (let i = Math.min(days, 14) - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyMap[key] = { date: key, input: 0, output: 0, cost: 0, callCount: 0 };
    }
    for (const r of records) {
      const day = r.ts?.split('T')[0];
      if (day && dailyMap[day]) {
        dailyMap[day].input     += r.inputTokens || 0;
        dailyMap[day].output    += r.outputTokens || 0;
        dailyMap[day].cost      += r.cost || 0;
        dailyMap[day].callCount += 1;
      }
    }

    // keySource별 비용 (서버 키 vs 사용자 키)
    let serverCost = 0, userCost = 0;
    for (const r of records) {
      if (r.keySource === 'user') {
        userCost += r.cost || 0;
      } else {
        serverCost += r.cost || 0;
      }
    }

    return {
      totalTokens: { input: totalInput, output: totalOutput },
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
      totalCalls: records.length,
      costBySource: {
        server: Math.round(serverCost * 1_000_000) / 1_000_000,
        user: Math.round(userCost * 1_000_000) / 1_000_000,
      },
      byUser: Object.values(userMap)
        .map(u => ({ ...u, cost: Math.round(u.cost * 1_000_000) / 1_000_000 }))
        .sort((a, b) => b.cost - a.cost),
      byModel: Object.values(modelMap)
        .map(m => ({ ...m, cost: Math.round(m.cost * 1_000_000) / 1_000_000 }))
        .sort((a, b) => b.cost - a.cost),
      byAction: Object.values(actionMap)
        .map(a => ({ ...a, cost: Math.round(a.cost * 1_000_000) / 1_000_000 }))
        .sort((a, b) => b.cost - a.cost),
      daily: Object.values(dailyMap).map(d => ({
        ...d,
        cost: Math.round(d.cost * 1_000_000) / 1_000_000,
      })),
    };
  }
}
