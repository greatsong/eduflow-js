import { Router } from 'express';
import { readdir, readFile, writeFile, rm, cp, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ProgressManager } from '../services/progressManager.js';
import { TemplateManager } from '../services/templateManager.js';
import { ReferenceManager } from '../services/referenceManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');
const TEMPLATE_DIR = join(PROJECTS_DIR, 'template');

const router = Router();

// multer 설정: 메모리 저장
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// 헬퍼: 프로젝트 경로
function projectPath(id) {
  return join(PROJECTS_DIR, id);
}

// 헬퍼: config.json 로드
async function loadConfig(id) {
  const configFile = join(projectPath(id), 'config.json');
  if (!existsSync(configFile)) return null;
  const raw = await readFile(configFile, 'utf-8');
  return JSON.parse(raw);
}

// ============================================================
// 프로젝트 CRUD
// ============================================================

// GET /api/projects - 프로젝트 목록
router.get('/', asyncHandler(async (req, res) => {
  if (!existsSync(PROJECTS_DIR)) {
    await mkdir(PROJECTS_DIR, { recursive: true });
  }

  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'template') continue;
    const config = await loadConfig(entry.name);
    if (config) {
      projects.push(config);
    }
  }

  // 최신순 정렬
  projects.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(projects);
}));

// POST /api/projects - 프로젝트 생성
router.post('/', asyncHandler(async (req, res) => {
  const { name, title, author, description, claude_model, settings, template_id, template_vars, custom_prompt_config } = req.body;

  if (!name || !title) {
    return res.status(400).json({ message: '프로젝트 ID와 제목은 필수입니다' });
  }

  const projPath = projectPath(name);
  if (existsSync(projPath)) {
    return res.status(409).json({ message: `'${name}' 프로젝트가 이미 존재합니다` });
  }

  // 템플릿 디렉토리 복사
  if (existsSync(TEMPLATE_DIR)) {
    await cp(TEMPLATE_DIR, projPath, { recursive: true });
  } else {
    await mkdir(join(projPath, 'discussions'), { recursive: true });
    await mkdir(join(projPath, 'docs'), { recursive: true });
    await mkdir(join(projPath, 'outlines'), { recursive: true });
    await mkdir(join(projPath, 'references'), { recursive: true });
    await mkdir(join(projPath, 'logs'), { recursive: true });
  }

  // config.json 작성
  const config = {
    name,
    title,
    author: author || '',
    description: description || '',
    claude_model: claude_model || 'claude-sonnet-4-20250514',
    settings: {
      batch_generation_enabled: settings?.batch_generation_enabled ?? true,
      auto_save: settings?.auto_save ?? true,
      max_tokens: settings?.max_tokens ?? 16000,
      temperature: 1.0,
    },
    deployment: {
      auto_commit: false,
      auto_deploy: false,
      build_docx: true,
      build_website: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await writeFile(join(projPath, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');

  // 템플릿 적용
  if (template_id) {
    const tm = new TemplateManager();
    const success = await tm.applyTemplate(template_id, projPath, template_vars || {});

    // 커스텀 프롬프트 저장 (목차/챕터 프롬프트 오버라이드)
    if (success && custom_prompt_config) {
      const infoFile = join(projPath, 'template-info.json');
      if (existsSync(infoFile)) {
        const raw = await readFile(infoFile, 'utf-8');
        const info = JSON.parse(raw);
        // 템플릿 기본값 대신 사용자 커스텀 프롬프트로 오버라이드
        if (custom_prompt_config.toc_prompt_addition !== undefined) {
          info.toc_prompt_addition = custom_prompt_config.toc_prompt_addition;
        }
        if (custom_prompt_config.chapter_prompt_addition !== undefined) {
          info.chapter_prompt_addition = custom_prompt_config.chapter_prompt_addition;
        }
        info.custom_prompt_config = custom_prompt_config;
        await writeFile(infoFile, JSON.stringify(info, null, 2), 'utf-8');
      }
    }
  }

  res.status(201).json(config);
}));

// ============================================================
// 템플릿 (/:id 전에 배치해야 함)
// ============================================================

// GET /api/projects/templates/list - 템플릿 목록
router.get('/templates/list', asyncHandler(async (req, res) => {
  const tm = new TemplateManager();
  const templates = await tm.listTemplates();
  res.json(templates);
}));

// GET /api/projects/:id - 프로젝트 상세
router.get('/:id', asyncHandler(async (req, res) => {
  const config = await loadConfig(req.params.id);
  if (!config) {
    return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다' });
  }
  res.json(config);
}));

// PUT /api/projects/:id - 프로젝트 수정
router.put('/:id', asyncHandler(async (req, res) => {
  const configFile = join(projectPath(req.params.id), 'config.json');
  if (!existsSync(configFile)) {
    return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다' });
  }

  const raw = await readFile(configFile, 'utf-8');
  const config = JSON.parse(raw);
  const updates = req.body;

  // 허용된 필드만 업데이트
  if (updates.title !== undefined) config.title = updates.title;
  if (updates.author !== undefined) config.author = updates.author;
  if (updates.description !== undefined) config.description = updates.description;
  if (updates.target_audience !== undefined) config.target_audience = updates.target_audience;
  if (updates.claude_model !== undefined) config.claude_model = updates.claude_model;
  if (updates.settings) config.settings = { ...config.settings, ...updates.settings };
  config.updated_at = new Date().toISOString();

  await writeFile(configFile, JSON.stringify(config, null, 2), 'utf-8');

  // 커스텀 프롬프트 업데이트
  if (updates.custom_prompt_config) {
    const infoFile = join(projectPath(req.params.id), 'template-info.json');
    let info = {};
    if (existsSync(infoFile)) {
      info = JSON.parse(await readFile(infoFile, 'utf-8'));
    }
    info.custom_prompt_config = updates.custom_prompt_config;
    await writeFile(infoFile, JSON.stringify(info, null, 2), 'utf-8');
  }

  res.json(config);
}));

// DELETE /api/projects/:id - 프로젝트 삭제
router.delete('/:id', asyncHandler(async (req, res) => {
  const projPath = projectPath(req.params.id);
  if (!existsSync(projPath)) {
    return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다' });
  }
  await rm(projPath, { recursive: true, force: true });
  res.json({ message: '삭제 완료' });
}));

// GET /api/projects/:id/progress - 진행 상태
router.get('/:id/progress', asyncHandler(async (req, res) => {
  const projPath = projectPath(req.params.id);
  if (!existsSync(projPath)) {
    return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다' });
  }
  const pm = new ProgressManager(projPath);
  const status = await pm.getOverallStatus();
  res.json(status);
}));

// ============================================================
// 레퍼런스 관리
// ============================================================

// GET /api/projects/:id/references - 목록
router.get('/:id/references', asyncHandler(async (req, res) => {
  const rm = new ReferenceManager(projectPath(req.params.id));
  const files = await rm.listFiles();
  const totalSize = await rm.getTotalSize();
  res.json({ files, totalSize });
}));

// POST /api/projects/:id/references - 업로드
router.post('/:id/references', upload.array('files', 20), asyncHandler(async (req, res) => {
  const rm = new ReferenceManager(projectPath(req.params.id));
  const saved = [];

  for (const file of req.files || []) {
    const path = await rm.saveFile(file.buffer, file.originalname);
    saved.push({ name: file.originalname, path });
  }

  res.status(201).json({ saved, count: saved.length });
}));

// GET /api/projects/:id/references/search - 검색 (/:filename보다 먼저 등록)
router.get('/:id/references/search', asyncHandler(async (req, res) => {
  const rm = new ReferenceManager(projectPath(req.params.id));
  const files = await rm.searchFiles(req.query.q || '');
  res.json({ files });
}));

// GET /api/projects/:id/references/:filename - 내용 읽기
router.get('/:id/references/:filename', asyncHandler(async (req, res) => {
  const rm = new ReferenceManager(projectPath(req.params.id));
  const content = await rm.readFile(req.params.filename);
  if (content === null) {
    return res.status(404).json({ message: '파일을 찾을 수 없거나 텍스트 파일이 아닙니다' });
  }
  res.json({ filename: req.params.filename, content });
}));

// DELETE /api/projects/:id/references/:filename - 삭제
router.delete('/:id/references/:filename', asyncHandler(async (req, res) => {
  const rm = new ReferenceManager(projectPath(req.params.id));
  const success = await rm.deleteFile(req.params.filename);
  if (!success) {
    return res.status(404).json({ message: '파일을 찾을 수 없습니다' });
  }
  res.json({ message: '삭제 완료' });
}));

// ============================================================
// 템플릿 정보 (프로젝트별)
// ============================================================

// GET /api/projects/:id/template-info - 프로젝트의 템플릿 정보 조회
router.get('/:id/template-info', asyncHandler(async (req, res) => {
  const infoFile = join(projectPath(req.params.id), 'template-info.json');
  if (!existsSync(infoFile)) {
    return res.json({ exists: false });
  }
  try {
    const raw = await readFile(infoFile, 'utf-8');
    const info = JSON.parse(raw);
    res.json({ exists: true, ...info });
  } catch (e) {
    res.json({ exists: false, error: e.message });
  }
}));

// PUT /api/projects/:id/template-info - 프로젝트의 템플릿 정보 수정
router.put('/:id/template-info', asyncHandler(async (req, res) => {
  const projPath = projectPath(req.params.id);
  if (!existsSync(projPath)) {
    return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다' });
  }

  const infoFile = join(projPath, 'template-info.json');
  let info = {};
  if (existsSync(infoFile)) {
    info = JSON.parse(await readFile(infoFile, 'utf-8'));
  }

  const { toc_prompt_addition, chapter_prompt_addition } = req.body;
  if (toc_prompt_addition !== undefined) {
    info.toc_prompt_addition = toc_prompt_addition;
  }
  if (chapter_prompt_addition !== undefined) {
    info.chapter_prompt_addition = chapter_prompt_addition;
  }
  info.custom_prompt_config = { toc_prompt_addition, chapter_prompt_addition };

  await writeFile(infoFile, JSON.stringify(info, null, 2), 'utf-8');
  res.json({ success: true, ...info });
}));

// ============================================================
// 직접 입력 API
// ============================================================

// GET /api/projects/:id/context - master-context.md 조회
router.get('/:id/context', asyncHandler(async (req, res) => {
  const contextFile = join(projectPath(req.params.id), 'master-context.md');
  if (!existsSync(contextFile)) {
    return res.json({ content: '' });
  }
  const content = await readFile(contextFile, 'utf-8');
  res.json({ content });
}));

// PUT /api/projects/:id/context - master-context.md 저장
router.put('/:id/context', asyncHandler(async (req, res) => {
  const projPath = projectPath(req.params.id);
  if (!existsSync(projPath)) {
    return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다' });
  }

  const { content } = req.body;
  const contextFile = join(projPath, 'master-context.md');
  await writeFile(contextFile, content || '', 'utf-8');

  // progress.json 업데이트 (step1 완료 처리)
  const pm = new ProgressManager(projPath);
  await pm.markStep1Completed();

  res.json({ success: true, message: '저장 완료' });
}));

export default router;
