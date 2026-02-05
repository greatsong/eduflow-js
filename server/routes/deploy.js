import { Router } from 'express';
import { join, dirname } from 'path';
import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';
import { Deployment } from '../services/deployment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');

const router = Router({ mergeParams: true });

function projectPath(id) {
  return join(PROJECTS_DIR, id);
}

// GET /api/projects/:id/deploy/status - 배포 도구 상태 확인
router.get('/status', asyncHandler(async (req, res) => {
  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  const tools = await dep.checkTools();
  const chapters = await dep.getChapterFiles();
  const hasMkdocsYml = existsSync(join(projectPath(req.params.id), 'mkdocs.yml'));

  let ghUser = null;
  if (tools.gh) {
    const result = await dep.getGitHubUser();
    if (result.success) ghUser = result.username;
  }

  res.json({
    tools,
    chapterCount: chapters.length,
    hasMkdocsYml,
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
    filePath = join(outputDir, filename);
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
router.post('/github', asyncHandler(async (req, res) => {
  const { repoName } = req.body;
  if (!repoName) {
    return res.status(400).json({ message: '저장소 이름이 필요합니다' });
  }

  const dep = new Deployment(projectPath(req.params.id));
  await dep.init();

  const result = await dep.deployToGitHub(repoName);
  res.json(result);
}));

export default router;
