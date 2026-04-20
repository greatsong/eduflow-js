/**
 * 전역 API Rate Limiter — 프로바이더별 슬라이딩 윈도우 RPM 제한
 *
 * 키 풀 사용 시 키 개수만큼 RPM이 자동 확장된다.
 * 대기 큐 + 30초 타임아웃으로 과부하 시 503 반환.
 */

// 프로바이더별 기본 RPM
// anthropic: Tier 4 계정 기준 상향. 콘솔의 실제 한도 70~80% 수준으로 유지.
const DEFAULT_RPM = {
  anthropic: 500,
  openai: 50,
  google: 50,
  upstage: 30,
};

const WAIT_TIMEOUT = 30_000; // 30초

// provider → { timestamps: number[], queue: resolver[] }
const state = new Map();

function getState(provider) {
  if (!state.has(provider)) {
    state.set(provider, { timestamps: [], queue: [] });
  }
  return state.get(provider);
}

function cleanOldTimestamps(timestamps) {
  const oneMinuteAgo = Date.now() - 60_000;
  while (timestamps.length > 0 && timestamps[0] < oneMinuteAgo) {
    timestamps.shift();
  }
}

/**
 * RPM 한도 설정을 업데이트 (키 풀 변경 시 호출)
 * @param {string} provider
 * @param {number} keyCount - 등록된 키 개수 (1 이상)
 */
export function updateLimit(provider, keyCount) {
  const base = DEFAULT_RPM[provider] || 30;
  const effective = base * Math.max(1, keyCount);
  const s = getState(provider);
  s.limit = effective;
}

/**
 * API 호출 전 rate limit 확인. 한도 내이면 즉시 통과, 아니면 대기.
 * @param {string} provider
 * @returns {Promise<void>} 통과 시 resolve, 타임아웃 시 reject
 */
export function acquire(provider) {
  const s = getState(provider);
  const limit = s.limit || DEFAULT_RPM[provider] || 30;

  cleanOldTimestamps(s.timestamps);

  if (s.timestamps.length < limit) {
    s.timestamps.push(Date.now());
    return Promise.resolve();
  }

  // 대기 큐에 등록
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // 큐에서 제거
      const idx = s.queue.indexOf(entry);
      if (idx >= 0) s.queue.splice(idx, 1);
      reject(new Error(`API rate limit 대기 시간 초과 (${provider}). 잠시 후 다시 시도해주세요.`));
    }, WAIT_TIMEOUT);

    const entry = { resolve, reject, timer };
    s.queue.push(entry);
  });
}

/**
 * API 호출 완료 후 호출 — 대기 큐에서 다음 요청을 해제
 * (슬라이딩 윈도우 방식이므로, 주기적으로 큐를 확인)
 */
export function release(provider) {
  const s = getState(provider);
  if (!s.queue.length) return;

  // 100ms 후 큐 처리 (슬라이딩 윈도우 정리 후)
  setTimeout(() => {
    cleanOldTimestamps(s.timestamps);
    const limit = s.limit || DEFAULT_RPM[provider] || 30;

    while (s.queue.length > 0 && s.timestamps.length < limit) {
      const entry = s.queue.shift();
      clearTimeout(entry.timer);
      s.timestamps.push(Date.now());
      entry.resolve();
    }
  }, 100);
}

/**
 * 현재 상태 조회 (모니터링용)
 */
export function getStats() {
  const result = {};
  for (const [provider, s] of state) {
    cleanOldTimestamps(s.timestamps);
    result[provider] = {
      currentRPM: s.timestamps.length,
      limit: s.limit || DEFAULT_RPM[provider] || 30,
      queueLength: s.queue.length,
    };
  }
  return result;
}
