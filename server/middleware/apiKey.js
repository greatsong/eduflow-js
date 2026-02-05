/**
 * API 키 검증 미들웨어
 * 요청 헤더 또는 서버 환경변수에서 Anthropic API 키를 확인한다.
 */
export function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(401).json({
      message: 'Anthropic API 키가 필요합니다. 환경변수 ANTHROPIC_API_KEY를 설정하세요.',
    });
  }

  req.apiKey = apiKey;
  next();
}
