import { Router } from 'express';
import { join, dirname } from 'path';
import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';
import { Deployment } from '../services/deployment.js';
import { sanitizeId, sanitizeFilename } from '../middleware/sanitize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');

const router = Router({ mergeParams: true });

function projectPath(id) {
  const safe = sanitizeId(id);
  if (!safe) throw new Error('잘못된 프로젝트 ID입니다.');
  return join(PROJECTS_DIR, safe);
}

// GET /api/projects/:id/deploy/status - 배포 도구 상태 확인
router.get('/status', asyncHandler(async (req, res) => {
  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  const tools = await dep.checkTools();
  const chapters = await dep.getChapterFiles();
  const hasMkdocsYml = existsSync(join(projectPath(req.params.id), 'mkdocs.yml'));
  const hasStarlight = existsSync(join(projectPath(req.params.id), '_starlight', 'package.json'));
  const hasStarlightDist = existsSync(join(projectPath(req.params.id), '_starlight', 'dist'));

  let ghUser = null;
  if (tools.gh) {
    const result = await dep.getGitHubUser();
    if (result.success) ghUser = result.username;
  }

  tools.node = true;

  res.json({
    tools,
    chapterCount: chapters.length,
    hasMkdocsYml,
    hasStarlight,
    hasStarlightDist,
    ghUser,
  });
}));

// POST /api/projects/:id/deploy/mkdocs/config - MkDocs 설정 생성
router.post('/mkdocs/config', asyncHandler(async (req, res) => {
  const { siteName, theme } = req.body;
  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  const result = await dep.generateMkdocsConfig(
    siteName || '교육자료',
    theme || 'material'
  );
  res.json(result);
}));

// POST /api/projects/:id/deploy/mkdocs/build - MkDocs 빌드
router.post('/mkdocs/build', asyncHandler(async (req, res) => {
  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  const result = await dep.buildWebsite();
  res.json(result);
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

// =============================================
// Starlight 엔드포인트
// =============================================

// POST /api/projects/:id/deploy/starlight/config - Starlight 프로젝트 생성
router.post('/starlight/config', asyncHandler(async (req, res) => {
  const { siteName, repoName } = req.body;
  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  let username = null;
  const userResult = await dep.getGitHubUser();
  if (userResult.success) username = userResult.username;

  const result = await dep.generateStarlightProject(
    siteName || '교육자료',
    repoName || '',
    username || ''
  );
  res.json(result);
}));

// POST /api/projects/:id/deploy/starlight/install - npm install
router.post('/starlight/install', asyncHandler(async (req, res) => {
  const dep = new Deployment(projectPath(req.params.id));
  const result = await dep.installStarlight();
  res.json(result);
}));

// POST /api/projects/:id/deploy/starlight/build - 빌드
router.post('/starlight/build', asyncHandler(async (req, res) => {
  const dep = new Deployment(projectPath(req.params.id));
  const result = await dep.buildStarlight();
  res.json(result);
}));

// POST /api/projects/:id/deploy/starlight/serve - 로컬 프리뷰
router.post('/starlight/serve', asyncHandler(async (req, res) => {
  const { port } = req.body;
  const dep = new Deployment(projectPath(req.params.id));
  const result = await dep.serveStarlight(port || 4321);
  res.json(result);
}));

// POST /api/projects/:id/deploy/starlight/github - 원스텝 배포
router.post('/starlight/github', asyncHandler(async (req, res) => {
  const { siteName, repoName } = req.body;
  if (!repoName) {
    return res.status(400).json({ message: '저장소 이름이 필요합니다' });
  }

  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  // Step 1: config
  let username = null;
  const userResult = await dep.getGitHubUser();
  if (userResult.success) username = userResult.username;

  const configResult = await dep.generateStarlightProject(
    siteName || '교육자료', repoName, username || ''
  );
  if (!configResult.success) {
    return res.json({ success: false, message: `프로젝트 생성 실패: ${configResult.message}`, step: 'config' });
  }

  // Step 2: install
  const installResult = await dep.installStarlight();
  if (!installResult.success) {
    return res.json({ success: false, message: `의존성 설치 실패: ${installResult.message}`, step: 'install' });
  }

  // Step 3: build
  const buildResult = await dep.buildStarlight();
  if (!buildResult.success) {
    return res.json({ success: false, message: `빌드 실패: ${buildResult.message}`, step: 'build' });
  }

  // Step 4: deploy
  const deployResult = await dep.deployStarlightToGitHub(repoName);

  // 배포 성공 시 deployment_info 저장
  if (deployResult.success && deployResult.site_url) {
    const { writeFile } = await import('fs/promises');
    const infoPath = join(projectPath(req.params.id), 'deployment_info.json');
    await writeFile(infoPath, JSON.stringify({
      engine: 'starlight',
      site_url: deployResult.site_url,
      repo_url: deployResult.repo_url,
      username: deployResult.username,
      deployed_at: new Date().toISOString(),
    }, null, 2), 'utf-8');
  }

  res.json(deployResult);
}));

// POST /api/projects/:id/deploy/github - GitHub Pages 배포 (MkDocs)
router.post('/github', asyncHandler(async (req, res) => {
  const { repoName } = req.body;
  if (!repoName) {
    return res.status(400).json({ message: '저장소 이름이 필요합니다' });
  }

  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  const result = await dep.deployToGitHub(repoName);

  // 배포 성공 시 deployment_info.json 저장 + 포트폴리오 자동 갱신
  if (result.success && result.site_url) {
    const { writeFile } = await import('fs/promises');
    const infoPath = join(projectPath(req.params.id), 'deployment_info.json');
    await writeFile(infoPath, JSON.stringify({
      site_url: result.site_url,
      repo_url: result.repo_url,
      username: result.username,
      deployed_at: new Date().toISOString(),
    }, null, 2), 'utf-8');

    // 포트폴리오 자동 갱신 (실패해도 배포 결과에는 영향 없음)
    const portfolioResult = await dep.updatePortfolio(
      repoName, result.site_url, result.repo_url, result.username
    );
    result.portfolio = portfolioResult;
  }

  res.json(result);
}));

export default router;
