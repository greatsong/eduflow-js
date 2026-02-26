export function errorHandler(err, req, res, next) {
  console.error(`[에러] ${req.method} ${req.path}:`, err.message);

  // SSE 등으로 이미 헤더가 전송된 경우 — JSON 응답 불가, 연결 종료
  if (res.headersSent) {
    try { res.end(); } catch { /* ignore */ }
    return;
  }

  const status = err.status || 500;
  res.status(status).json({
    message: err.message || '서버 내부 오류',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

/**
 * async 라우트 핸들러 래퍼 - try/catch 자동 처리
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
