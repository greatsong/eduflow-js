/**
 * API 키 검증 미들웨어 (멀티 프로바이더 지원)
 *
 * 요청 헤더 또는 서버 환경변수에서 각 프로바이더별 API 키를 수집한다.
 * 최소 하나의 API 키가 있으면 통과.
 */
export function requireApiKey(req, res, next) {
  // 프로바이더별 키 수집
  const keys = {
    anthropic: req.headers['x-anthropic-key'] || process.env.ANTHROPIC_API_KEY || '',
    openai: req.headers['x-openai-key'] || process.env.OPENAI_API_KEY || '',
    google: req.headers['x-google-key'] || process.env.GOOGLE_API_KEY || '',
    upstage: req.headers['x-upstage-key'] || process.env.UPSTAGE_API_KEY || '',
  };

  // 하위 호환: 기존 x-api-key 헤더는 anthropic 키로 취급
  const legacyKey = req.headers['x-api-key'];
  if (legacyKey && !keys.anthropic) {
    keys.anthropic = legacyKey;
  }

  // _default: 프로바이더를 특정하지 않은 범용 키 (기존 호환)
  keys._default = keys.anthropic || legacyKey || '';

  const hasAnyKey = Object.entries(keys).some(([k, v]) => k !== '_default' && v);

  if (!hasAnyKey) {
    return res.status(401).json({
      message: 'API 키가 필요합니다. 환경변수(ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, UPSTAGE_API_KEY) 중 하나 이상을 설정하세요.',
    });
  }

  // 기존 호환: req.apiKey 유지
  req.apiKey = keys._default || keys.anthropic || keys.openai || keys.google || keys.upstage;
  req.apiKeys = keys;
  next();
}