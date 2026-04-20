import { ServerSettings } from '../services/settings.js';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const serverSettings = new ServerSettings(join(DATA_DIR, 'settings.json'));

/**
 * 로컬 버전: 모든 사용자를 관리자로 취급
 */
function isAdmin() {
  return true;
}

/**
 * API 키 검증 미들웨어 (멀티 프로바이더 지원)
 *
 * 키 우선순위:
 * 1. 요청 헤더 (사용자 직접 입력 키)
 * 2. settings.json adminApiKeys (관리자가 UI에서 입력한 키)
 *    - shared: true → 모든 사용자에게 제공
 *    - shared: false → 관리자만 사용 가능
 * 3. 환경변수 (fly secrets 등)
 */
export async function requireApiKey(req, res, next) {
  try {
    const admin = isAdmin(req);
    const settings = await serverSettings.get();
    const adminKeys = settings.adminApiKeys || {};

    // 프로바이더별 키 수집
    const keys = {};
    for (const provider of ['anthropic', 'openai', 'google', 'upstage']) {
      const headerKey = req.headers[`x-${provider}-key`] || '';
      const envKey = process.env[`${provider.toUpperCase()}_API_KEY`] || '';

      // settings.json 키: 관리자이면 모두 사용, 일반 사용자는 shared만
      const stored = adminKeys[provider];
      const storedKey = stored?.key && (admin || stored.shared) ? stored.key : '';

      keys[provider] = headerKey || storedKey || envKey || '';
    }

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
        message: 'API 키가 필요합니다. 관리자에게 문의하거나, AI 설정에서 직접 API 키를 입력하세요.',
      });
    }

    // 기존 호환: req.apiKey 유지
    req.apiKey = keys._default || keys.anthropic || keys.openai || keys.google || keys.upstage;
    req.apiKeys = keys;
    next();
  } catch (err) {
    return res.status(500).json({ message: 'API 키 검증 중 오류: ' + err.message });
  }
}

/**
 * 로컬 버전: 모델 등급 제한 없음 → 통과
 * (웹 배포판에서는 JWT tier/모델 등급을 체크하는 역할)
 */
export function requireModelAccess(req, res, next) {
  next();
}
