export const API_BASE = import.meta.env.VITE_API_URL || '';

// 프로바이더별 localStorage 키 매핑
const PROVIDER_KEYS = {
  anthropic: 'eduflow_api_key',       // 기존 호환
  openai: 'eduflow_openai_key',
  google: 'eduflow_google_key',
  upstage: 'eduflow_upstage_key',
};

/** 프로바이더별 API 키 가져오기 */
export function getApiKey(provider = 'anthropic') {
  try {
    return localStorage.getItem(PROVIDER_KEYS[provider] || PROVIDER_KEYS.anthropic) || '';
  } catch (e) {
    // localStorage 접근 불가 시 (프라이빗 브라우징 등) 빈 문자열 반환
    console.warn('[client] localStorage 읽기 실패:', e);
    return '';
  }
}

/** 프로바이더별 API 키 저장 */
export function setApiKey(key, provider = 'anthropic') {
  const storageKey = PROVIDER_KEYS[provider] || PROVIDER_KEYS.anthropic;
  try {
    if (key) {
      localStorage.setItem(storageKey, key);
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch (e) {
    // localStorage 쓰기 실패 시 (용량 초과, 프라이빗 브라우징 등)
    console.warn('[client] localStorage 쓰기 실패:', e);
  }
}

/** 설정된 모든 프로바이더 키 조회 */
export function getAllApiKeys() {
  const keys = {};
  try {
    for (const [provider, storageKey] of Object.entries(PROVIDER_KEYS)) {
      const val = localStorage.getItem(storageKey);
      if (val) keys[provider] = val;
    }
  } catch (e) {
    // localStorage 접근 불가 시 빈 객체 반환
    console.warn('[client] localStorage 읽기 실패:', e);
  }
  return keys;
}

/** 아무 API 키라도 설정되어 있는지 확인 */
export function hasApiKey() {
  try {
    return Object.values(PROVIDER_KEYS).some((k) => !!localStorage.getItem(k));
  } catch (e) {
    // localStorage 접근 불가 시 false 반환
    console.warn('[client] localStorage 읽기 실패:', e);
    return false;
  }
}

/** 공통 헤더 생성 — 모든 프로바이더 키를 각각의 헤더로 전송 */
function authHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json' };
  // 기존 호환: x-api-key
  const anthropicKey = getApiKey('anthropic');
  if (anthropicKey) headers['x-api-key'] = anthropicKey;

  // 프로바이더별 헤더
  const openaiKey = getApiKey('openai');
  if (openaiKey) headers['x-openai-key'] = openaiKey;
  const googleKey = getApiKey('google');
  if (googleKey) headers['x-google-key'] = googleKey;
  const upstageKey = getApiKey('upstage');
  if (upstageKey) headers['x-upstage-key'] = upstageKey;

  Object.assign(headers, extra);
  return headers;
}

/**
 * 기본 fetch 래퍼
 */
export async function apiFetch(path, options = {}) {
  const fetchOptions = {
    ...options,
    headers: authHeaders(options.headers),
  };
  // body가 객체면 자동 JSON 직렬화
  if (fetchOptions.body && typeof fetchOptions.body === 'object' && !(fetchOptions.body instanceof FormData)) {
    fetchOptions.body = JSON.stringify(fetchOptions.body);
  }
  const res = await fetch(`${API_BASE}${path}`, fetchOptions);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API 오류: ${res.status}`);
  }

  return res.json();
}

/**
 * SSE(Server-Sent Events) 스트리밍 연결
 */
export function apiSSE(path, { onText, onProgress, onError, onDone } = {}) {
  const es = new EventSource(`${API_BASE}${path}`);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'text':
          onText?.(data.content);
          break;
        case 'progress':
          onProgress?.(data);
          break;
        case 'error':
          onError?.(new Error(data.message));
          es.close();
          break;
        case 'done':
          onDone?.(data);
          es.close();
          break;
      }
    } catch (e) {
      onError?.(e);
    }
  };

  es.onerror = () => {
    onError?.(new Error('SSE 연결 끊김'));
    es.close();
  };

  return () => es.close();
}

/**
 * POST 요청 후 SSE 스트리밍 (EventSource는 GET만 지원하므로 fetch 사용)
 */
export async function apiStreamPost(path, body, { onText, onProgress, onError, onDone } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `API 오류: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // onError 호출 후 onDone 중복 호출 방지 플래그
  let errored = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') { if (!errored) onDone?.(); return; }

        try {
          const data = JSON.parse(raw);
          switch (data.type) {
            case 'text': onText?.(data.content); break;
            case 'progress': onProgress?.(data); break;
            case 'report': onProgress?.(data); break;
            case 'error':
              errored = true;
              onError?.(new Error(data.message));
              return;
            case 'done':
              if (!errored) onDone?.(data);
              return;
          }
        } catch (e) {
          // SSE 데이터 JSON 파싱 실패 — 불완전한 청크일 수 있음
          console.warn('[apiStreamPost] SSE 데이터 파싱 실패:', raw, e);
        }
      }
    }
  } catch (networkErr) {
    // 네트워크 에러 (연결 끊김, 타임아웃 등)
    errored = true;
    onError?.(networkErr);
  }

  // 스트림 정상 종료 시 (서버가 [DONE] 없이 종료한 경우)
  if (!errored) onDone?.();
}