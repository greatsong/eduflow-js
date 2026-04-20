import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import modelsRouter from './routes/models.js';
import projectsRouter from './routes/projects.js';
import discussionsRouter from './routes/discussions.js';
import tocRouter from './routes/toc.js';
import chaptersRouter from './routes/chapters.js';
import deployRouter from './routes/deploy.js';
import portfolioRouter from './routes/portfolio.js';
import compareRouter from './routes/compare.js';
import { ServerSettings } from './services/settings.js';
import { existsSync } from 'fs';
import { stat as fsStat } from 'fs/promises';
import { errorHandler } from './middleware/errorHandler.js';
import { sanitizeId } from './middleware/sanitize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') }); // 루트 .env 로드

const app = express();
const PORT = process.env.PORT || 7829;

// 상대경로를 루트(.env 위치) 기준 절대경로로 변환
const ROOT_DIR = path.resolve(__dirname, '..');
const resolveFromRoot = (p, fallback) =>
  p ? path.resolve(ROOT_DIR, p) : fallback;

const PROJECTS_DIR = resolveFromRoot(process.env.PROJECTS_DIR, path.join(ROOT_DIR, 'projects'));
const DATA_BASE = resolveFromRoot(process.env.DATA_DIR, ROOT_DIR);

// 모든 라우트에서 동일하게 절대경로를 사용하도록 환경변수 덮어쓰기
process.env.PROJECTS_DIR = PROJECTS_DIR;
process.env.DATA_DIR = DATA_BASE;

// 미들웨어 — 프로덕션에서는 same-origin, 개발에서는 localhost 허용
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:7830', 'http://localhost:7829'];
app.use(cors({
  origin: (origin, cb) => {
    // same-origin (origin 없음) 또는 허용 목록
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
}));
app.use(express.json({ limit: '10mb' }));

// Google Sign-In 팝업이 부모 창과 통신할 수 있도록 COOP 설정
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 운영 설정 인스턴스
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const serverSettings = new ServerSettings(path.join(DATA_DIR, 'settings.json'));

// API 키 상태 확인 (로컬 버전: 서버 .env 기반)
app.get('/api/auth/status', async (req, res) => {
  const settings = await serverSettings.get();

  // 서버 .env에 설정된 API 키 확인
  const serverProviders = {};
  for (const provider of ['anthropic', 'openai', 'google', 'upstage']) {
    serverProviders[provider] = !!process.env[`${provider.toUpperCase()}_API_KEY`];
  }

  const hasEnvKey = Object.values(serverProviders).some(Boolean);

  res.json({
    hasEnvKey,
    isAdmin: true,  // 로컬 버전은 모든 사용자가 관리자
    apiMode: settings.apiMode || 'user',
    serverModeMessage: settings.serverModeMessage || '',
    allowedModels: settings.allowedModels || [],
    serverProviders,
    sharedProviders: serverProviders,
  });
});

// GitHub 연결 상태 (로컬: gh CLI 또는 GITHUB_TOKEN 확인)
app.get('/api/auth/github/status', async (req, res) => {
  try {
    const { execa } = await import('execa');
    // gh CLI에서 토큰 + 사용자명 조회
    try {
      await execa('gh', ['auth', 'token']);
      const { stdout } = await execa('gh', ['api', 'user', '--jq', '.login']);
      const username = (stdout || '').trim();
      if (username) {
        return res.json({
          connected: true,
          username,
          source: 'gh-cli',
          local: true,
        });
      }
    } catch { /* gh 없거나 로그인 안 됨 */ }

    // env var 폴백 (사용자명은 못 구함)
    if (process.env.GITHUB_TOKEN) {
      return res.json({
        connected: true,
        username: 'env',
        source: 'env',
        local: true,
      });
    }
  } catch { /* ignore */ }
  res.json({ connected: false, local: true });
});

// API 키 검증 (간소화: 키가 비어있지 않으면 유효로 처리)
app.post('/api/auth/verify', async (req, res) => {
  // 어떤 프로바이더든 키가 있으면 통과
  const hasAny = !!(
    req.headers['x-api-key'] ||
    req.headers['x-openai-key'] ||
    req.headers['x-google-key'] ||
    req.headers['x-upstage-key']
  );
  if (!hasAny) {
    return res.status(400).json({ valid: false, message: 'API 키가 제공되지 않았습니다.' });
  }
  res.json({ valid: true });
});

// 빌드된 사이트 미리보기 (iframe에서 접근)
const PROJECTS_DIR_RESOLVED = process.env.PROJECTS_DIR || path.join(__dirname, '..', 'projects');

app.get('/api/projects/:id/deploy/preview/{*filePath}', async (req, res) => {
  const safe = sanitizeId(req.params.id);
  if (!safe) return res.status(400).json({ message: '잘못된 프로젝트 ID' });

  const siteDir = path.join(PROJECTS_DIR_RESOLVED, safe, 'site');
  if (!existsSync(siteDir)) {
    return res.status(404).json({ message: '빌드된 사이트가 없습니다.' });
  }

  const rawPath = req.params.filePath;
  const requestedPath = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath || 'index.html');
  const segments = requestedPath.split('/').filter(Boolean);
  const filePath = path.join(siteDir, ...segments);

  // 경로 탈출 방지
  if (!filePath.startsWith(siteDir)) {
    return res.status(403).json({ message: '접근 금지' });
  }

  try {
    if (!existsSync(filePath)) {
      const indexFallback = path.join(siteDir, 'index.html');
      if (existsSync(indexFallback)) return res.sendFile(indexFallback);
      return res.status(404).json({ message: '파일을 찾을 수 없습니다' });
    }

    const s = await fsStat(filePath);
    if (s.isDirectory()) {
      const dirIndex = path.join(filePath, 'index.html');
      if (existsSync(dirIndex)) return res.sendFile(dirIndex);
      return res.status(404).json({ message: '파일을 찾을 수 없습니다' });
    }

    res.sendFile(filePath);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 라우트
app.use('/api/models', modelsRouter);

// 더 구체적인 프로젝트 서브라우트를 먼저 등록
app.use('/api/projects/:id/discussions', discussionsRouter);
app.use('/api/projects/:id/toc', tocRouter);
app.use('/api/projects/:id/chapters', chaptersRouter);
app.use('/api/projects/:id/deploy', deployRouter);

// 기본 프로젝트 라우트 (context, template-info, references 등 포함)
app.use('/api/projects', projectsRouter);

app.use('/api/portfolio', portfolioRouter);
app.use('/api/compare', compareRouter);

// API 404 핸들러
app.all('/api/{*path}', (req, res) => {
  res.status(404).json({ message: `API 경로를 찾을 수 없습니다: ${req.method} ${req.path}` });
});

// 프로덕션: 프론트엔드 정적 파일 서빙
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// 에러 핸들링 (반드시 마지막)
app.use(errorHandler);

// 전역 예외 처리
process.on('unhandledRejection', (reason) => {
  console.error('[EduFlow] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[EduFlow] Uncaught Exception:', err);
  process.exit(1);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[EduFlow] 서버 실행 중: http://localhost:${PORT}`);
  console.log(`[EduFlow] 프로젝트 디렉토리: ${process.env.PROJECTS_DIR || './projects'}`);
});
