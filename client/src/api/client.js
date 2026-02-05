const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * 기본 fetch 래퍼
 */
export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API 오류: ${res.status}`);
  }

  return res.json();
}

/**
 * SSE(Server-Sent Events) 스트리밍 연결
 * @param {string} path - API 경로
 * @param {object} options
 * @param {function} options.onText - 텍스트 청크 수신 콜백
 * @param {function} options.onProgress - 진행률 수신 콜백
 * @param {function} options.onError - 에러 콜백
 * @param {function} options.onDone - 완료 콜백
 * @returns {function} close - 연결 종료 함수
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `API 오류: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6);
      if (raw === '[DONE]') { onDone?.(); return; }

      try {
        const data = JSON.parse(raw);
        switch (data.type) {
          case 'text': onText?.(data.content); break;
          case 'progress': onProgress?.(data); break;
          case 'error': onError?.(new Error(data.message)); return;
          case 'done': onDone?.(data); return;
        }
      } catch (e) {
        // 파싱 실패 무시
      }
    }
  }
}
