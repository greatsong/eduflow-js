/**
 * API 키 풀 — 프로바이더별 다중 키 라운드로빈 분배
 *
 * settings.json의 adminApiKeys 구조:
 *   기존 (하위호환): { anthropic: { key: "sk-...", shared: true } }
 *   확장:          { anthropic: { keys: ["sk-1", "sk-2"], shared: true } }
 *
 * 10개 키를 등록하면 2~3명이 같은 키를 사용하게 되어
 * API rate limit이 자연스럽게 분산된다.
 */

const counters = new Map(); // provider → 현재 인덱스

/**
 * adminApiKeys 설정에서 프로바이더의 키 배열을 추출 (하위호환)
 * @param {object} adminKeys - settings.json의 adminApiKeys
 * @param {string} provider - 'anthropic' | 'openai' | 'google' | 'upstage'
 * @param {boolean} isAdmin - 관리자 여부
 * @returns {string[]} 사용 가능한 키 배열
 */
export function getProviderKeys(adminKeys, provider, isAdmin) {
  const entry = adminKeys?.[provider];
  if (!entry) return [];

  // shared 체크: 일반 사용자는 shared=true인 키만
  if (!isAdmin && !entry.shared) return [];

  // 배열 형식 (신규)
  if (Array.isArray(entry.keys)) {
    return entry.keys.filter(k => k && typeof k === 'string' && k.trim());
  }

  // 단일 키 형식 (하위호환)
  if (entry.key && typeof entry.key === 'string' && entry.key.trim()) {
    return [entry.key.trim()];
  }

  return [];
}

/**
 * 라운드로빈으로 다음 키를 선택
 * @param {string} provider
 * @param {string[]} keys
 * @returns {string} 선택된 키
 */
export function pickNextKey(provider, keys) {
  if (!keys.length) return '';
  if (keys.length === 1) return keys[0];

  const idx = (counters.get(provider) || 0) % keys.length;
  counters.set(provider, idx + 1);
  return keys[idx];
}

/**
 * 프로바이더의 키 개수 반환 (rate limiter에서 RPM 확장에 사용)
 */
export function getKeyCount(adminKeys, provider) {
  const entry = adminKeys?.[provider];
  if (!entry) return 0;
  if (Array.isArray(entry.keys)) return entry.keys.filter(k => k?.trim()).length;
  if (entry.key?.trim()) return 1;
  return 0;
}

/**
 * 관리자 UI에서 입력한 쉼표/줄바꿈 구분 문자열을 키 배열로 파싱
 * @param {string} input - "sk-1, sk-2\nsk-3"
 * @returns {string[]}
 */
export function parseKeyInput(input) {
  if (!input || typeof input !== 'string') return [];
  return input
    .split(/[,\n]+/)
    .map(k => k.trim())
    .filter(Boolean);
}
