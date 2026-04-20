import { Router } from 'express';
import { join, dirname } from 'path';
import { createReadStream, existsSync } from 'fs';
import { stat, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';
import { Deployment } from '../services/deployment.js';
import { COLOR_THEMES, DEFAULT_THEME_KEY } from '../services/starlightGenerator.js';
import { sanitizeId, sanitizeFilename } from '../middleware/sanitize.js';
import { withLock } from '../services/fileLock.js';

// 빌드 중복·동시성 제어 (shared-cpu 보호)
// - activeBuilds: 같은 프로젝트 중복 빌드 즉시 거절
// - withLock('__build__'): 전역 직렬화로 동시에 한 건만 실행
const activeBuilds = new Set();
const BUILD_LOCK_KEY = '__global_build_lock__';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');

const router = Router({ mergeParams: true });

function projectPath(id) {
  const safe = sanitizeId(id);
  if (!safe) throw new Error('잘못된 프로젝트 ID입니다.');
  return join(PROJECTS_DIR, safe);
}

// GET /api/projects/:id/deploy/themes - 사이트 색상 테마 프리셋 목록
router.get('/themes', asyncHandler(async (req, res) => {
  res.json({
    default: DEFAULT_THEME_KEY,
    themes: Object.entries(COLOR_THEMES).map(([key, value]) => ({
      key,
      label: value.label,
      accent: value.accent,
      accentBg: value.accentBg,
    })),
  });
}));

// GET /api/projects/:id/deploy/status - 배포 도구 상태 확인
router.get('/status', asyncHandler(async (req, res) => {
  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  const tools = await dep.checkTools();
  const chapters = await dep.getChapterFiles();
  const hasMkdocsYml = existsSync(join(projectPath(req.params.id), 'mkdocs.yml'));
  const siteReady = existsSync(join(projectPath(req.params.id), 'site', 'index.html'));
  const isBuilding = activeBuilds.has(req.params.id);

  let ghUser = null;
  if (tools.gh) {
    const result = await dep.getGitHubUser();
    if (result.success) ghUser = result.username;
  }

  // 이전 배포 기록 로드
  let deploymentInfo = null;
  const deployInfoPath = join(projectPath(req.params.id), 'deployment_info.json');
  if (existsSync(deployInfoPath)) {
    try {
      deploymentInfo = JSON.parse(await readFile(deployInfoPath, 'utf-8'));
    } catch { /* ignore */ }
  }

  // 저장된 빌드 테마 복원 (기본 starlight)
  let buildTheme = 'starlight';
  const cfgPath = join(projectPath(req.params.id), 'config.json');
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(await readFile(cfgPath, 'utf-8'));
      if (cfg.deployment?.theme === 'mkdocs' || cfg.deployment?.theme === 'starlight') {
        buildTheme = cfg.deployment.theme;
      }
    } catch { /* ignore */ }
  }

  res.json({
    tools,
    chapterCount: chapters.length,
    hasMkdocsYml,
    siteReady,
    isBuilding,
    ghUser,
    deploymentInfo,
    buildTheme,
  });
}));

// POST /api/projects/:id/deploy/mkdocs/config - 사이트 설정 생성 + 빌드 테마 저장
router.post('/mkdocs/config', asyncHandler(async (req, res) => {
  const { siteName, theme, colorTheme, creator, publishing, repoUrl, buildTheme } = req.body;
  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  // config.json에서 publishing 정보 로드 (요청에 없으면)
  const configFile = join(projectPath(req.params.id), 'config.json');
  let pubInfo = publishing || null;
  if (!pubInfo && existsSync(configFile)) {
    try {
      const config = JSON.parse(await readFile(configFile, 'utf-8'));
      pubInfo = config.publishing || null;
    } catch { /* skip */ }
  }

  const result = await dep.generateMkdocsConfig(
    siteName || '교육자료',
    theme || 'material',
    creator || null,
    colorTheme || 'indigo',
    pubInfo,
    repoUrl || null
  );

  // 사용자가 선택한 빌드 테마(starlight/mkdocs)와 색상 테마를 config.json에 저장
  // → /mkdocs/build, 미리보기 자동빌드가 이 값을 참조
  if (result.success && existsSync(configFile)) {
    try {
      const cfg = JSON.parse(await readFile(configFile, 'utf-8'));
      cfg.deployment = { ...(cfg.deployment || {}) };
      if (buildTheme === 'starlight' || buildTheme === 'mkdocs') {
        cfg.deployment.theme = buildTheme;
      }
      if (colorTheme) cfg.deployment.color_theme = colorTheme;
      cfg.updated_at = new Date().toISOString();
      const { writeFile } = await import('fs/promises');
      await writeFile(configFile, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch { /* 저장 실패는 빌드에 영향 없음 */ }
  }

  res.json(result);
}));

// POST /api/projects/:id/deploy/mkdocs/build - 사이트 빌드 (기본: Starlight, 레거시: MkDocs)
//
// body 파라미터:
//   - theme: 'starlight' (기본) | 'mkdocs'
//   - siteName, creator, accentColor (starlight 전용)
//   - siteUrl, basePath (starlight 전용, GitHub Pages 경로용)
//
// 레거시 경로 '/mkdocs/build' 이름은 유지 — 내부에서 테마 분기만 처리.
router.post('/mkdocs/build', asyncHandler(async (req, res) => {
  const {
    theme,
    siteName,
    creator,
    colorTheme,
    accentColor,
    siteUrl,
    basePath,
  } = req.body || {};

  const projectId = req.params.id;

  // 같은 프로젝트 중복 빌드 거절 (연타·다중 탭 방어)
  if (activeBuilds.has(projectId)) {
    return res.status(409).json({
      message: '이 프로젝트는 이미 배포 빌드 중입니다. 완료 후 다시 시도해주세요.',
    });
  }

  const dep = new Deployment(projectPath(projectId));
  await dep.init();

  // theme/colorTheme 기본값: 프로젝트 config.json의 deployment.* → 기본값
  let effectiveTheme = theme;
  let effectiveColorTheme = colorTheme;
  try {
    const cfgPath = join(projectPath(projectId), 'config.json');
    if (existsSync(cfgPath)) {
      const cfg = JSON.parse(await readFile(cfgPath, 'utf-8'));
      effectiveTheme = effectiveTheme || cfg.deployment?.theme || 'starlight';
      effectiveColorTheme = effectiveColorTheme || cfg.deployment?.color_theme || 'sky';
    }
  } catch { /* 무시 */ }
  effectiveTheme = effectiveTheme || 'starlight';
  effectiveColorTheme = effectiveColorTheme || 'sky';

  activeBuilds.add(projectId);
  try {
    // 전역 직렬화: shared-cpu 환경에서 동시 npm install·astro build 폭발 방지
    const result = await withLock(BUILD_LOCK_KEY, () => dep.buildWebsite({
      theme: effectiveTheme,
      siteName,
      creator,
      colorTheme: effectiveColorTheme,
      accentColor,
      siteUrl,
      basePath,
    }));
    res.json(result);
  } finally {
    activeBuilds.delete(projectId);
  }
}));

// POST /api/projects/:id/deploy/mkdocs/serve - 로컬 프리뷰
router.post('/mkdocs/serve', asyncHandler(async (req, res) => {
  const { port } = req.body;
  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  const result = await dep.serveLocal(port || 8000);
  res.json(result);
}));

// POST /api/projects/:id/deploy/docx - DOCX 생성
router.post('/docx', asyncHandler(async (req, res) => {
  const { title } = req.body;
  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  const result = await dep.generateDocx(title || '교육자료');
  res.json(result);
}));

// GET /api/projects/:id/deploy/docx/download - DOCX 다운로드
router.get('/docx/download', asyncHandler(async (req, res) => {
  const { filename } = req.query;
  const projPath = projectPath(req.params.id);
  const outputDir = join(projPath, 'output');

  // filename이 있으면 그 파일, 없으면 output/ 안에서 첫 번째 .docx 파일
  let filePath;
  if (filename) {
    const safeFilename = sanitizeFilename(filename);
    if (!safeFilename) {
      return res.status(400).json({ message: '잘못된 파일명입니다.' });
    }
    filePath = join(outputDir, safeFilename);
  } else {
    const { readdir } = await import('fs/promises');
    if (!existsSync(outputDir)) {
      return res.status(404).json({ message: 'DOCX 파일이 없습니다' });
    }
    const files = await readdir(outputDir);
    const docxFile = files.find((f) => f.endsWith('.docx'));
    if (!docxFile) {
      return res.status(404).json({ message: 'DOCX 파일이 없습니다' });
    }
    filePath = join(outputDir, docxFile);
  }

  if (!existsSync(filePath)) {
    return res.status(404).json({ message: 'DOCX 파일을 찾을 수 없습니다' });
  }

  const fileStat = await stat(filePath);
  const fileName = filePath.split('/').pop();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('Content-Length', fileStat.size);

  createReadStream(filePath).pipe(res);
}));

// POST /api/projects/:id/deploy/github - GitHub Pages 배포
//
// 토큰 획득 우선순위:
//   1) JWT 유저(웹 배포판): userStore의 GitHub OAuth 토큰
//   2) 로컬: `gh auth token` CLI 출력
//   3) 로컬: 환경변수 GITHUB_TOKEN
router.post('/github', asyncHandler(async (req, res) => {
  const { repoName, creator } = req.body;
  if (!repoName) {
    return res.status(400).json({ message: '저장소 이름이 필요합니다' });
  }

  const userStore = req.app.locals.userStore;
  let token = null;
  let tokenSource = null;

  // 1) 웹 배포판: JWT 유저 → userStore
  if (req.user?.googleId && userStore) {
    const github = await userStore.getGitHubToken(req.user.googleId);
    if (github?.token) {
      token = github.token;
      tokenSource = `user(${github.username || req.user.googleId})`;
    }
  }

  // 2) 로컬: gh CLI에서 토큰 조회
  if (!token) {
    try {
      const { execa } = await import('execa');
      const { stdout } = await execa('gh', ['auth', 'token']);
      const t = (stdout || '').trim();
      if (t) {
        token = t;
        tokenSource = 'gh-cli';
      }
    } catch { /* gh 없거나 로그인 안 됨 */ }
  }

  // 3) 로컬: 환경변수
  if (!token && process.env.GITHUB_TOKEN) {
    token = process.env.GITHUB_TOKEN;
    tokenSource = 'env';
  }

  if (!token) {
    return res.status(400).json({
      message: 'GitHub 토큰을 찾을 수 없습니다. 아래 중 하나를 진행해주세요:\n'
        + '• 터미널에서 `gh auth login` 실행\n'
        + '• .env 파일에 `GITHUB_TOKEN=ghp_...` 추가 후 서버 재시작\n'
        + '• (웹 배포판) 배포 페이지에서 GitHub 계정 연동',
    });
  }

  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  console.log(`[EduFlow] GitHub API 배포 요청: ${repoName} (token source: ${tokenSource})`);
  const result = await dep.deployToGitHubAPI(repoName, token, creator || null);

  // 배포 성공 시 포트폴리오 등록 (필수 — 서버 토큰 사용)
  if (result.success && result.site_url) {
    const portfolioResult = await dep.updatePortfolioAPI(
      repoName, result.site_url, result.repo_url, result.username, creator
    );
    result.portfolio = portfolioResult;
  }

  // 배포 성공 시 deployment_info.json 저장 + 이력 기록
  if (result.success && result.site_url) {
    const { writeFile } = await import('fs/promises');
    const infoPath = join(projectPath(req.params.id), 'deployment_info.json');
    await writeFile(infoPath, JSON.stringify({
      site_url: result.site_url,
      repo_url: result.repo_url,
      username: result.username,
      deployed_at: new Date().toISOString(),
      deploy_method: 'github_api',
      ...(creator?.name && { creatorName: creator.name }),
      ...(creator?.affiliation && { creatorAffiliation: creator.affiliation }),
    }, null, 2), 'utf-8');

    // UserStore에 프로젝트 배포 이력 저장 (웹 배포판에서만 가능 — 로컬은 건너뜀)
    if (userStore && req.user?.googleId) {
      try {
        await userStore.addUserProject(req.user.googleId, {
          repoName,
          siteUrl: result.site_url,
          repoUrl: result.repo_url,
          username: result.username,
        });
      } catch { /* 배포 결과에 영향 없음 */ }
    }
  }

  res.json(result);
}));

export default router;
