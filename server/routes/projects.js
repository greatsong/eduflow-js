import { Router } from 'express';
import { readdir, readFile, writeFile, rm, cp, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ProgressManager } from '../services/progressManager.js';
import { TemplateManager, TemplateComposer } from '../services/templateManager.js';
import { ReferenceManager } from '../services/referenceManager.js';
import { sanitizeId } from '../middleware/sanitize.js';
import { TIER_CONFIG, TEMPLATE_VERSION } from '../../shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');
const TEMPLATE_DIR = join(PROJECTS_DIR, 'template');

const router = Router();

// multer 설정: 메모리 저장
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// 헬퍼: 프로젝트 경로 (Path Traversal 방어)
function projectPath(id) {
  const safe = sanitizeId(id);
  if (!safe) throw new Error('잘못된 프로젝트 ID입니다.');
  return join(PROJECTS_DIR, safe);
}

// 헬퍼: config.json 로드
async function loadConfig(id) {
  const configFile = join(projectPath(id), 'config.json');
  if (!existsSync(configFile)) return null;
  const raw = await readFile(configFile, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    // JSON 파싱 실패 시 null 반환 (손상된 config.json 방어)
    console.error(`[loadConfig] JSON 파싱 실패 (id: ${id}):`, e.message);
    return null;
  }
}

// ============================================================
// 프로젝트 CRUD
// ============================================================

// GET /api/projects - 프로젝트 목록 (자기 프로젝트만 또는 전체)
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

  // 사용자별 필터링: owner가 설정된 프로젝트는 본인 것만, 미설정은 모두에게 표시
  // NOTE(BUG-021): 로컬 버전에서는 인증 미들웨어를 거치지 않을 수 있어 req.user가 없는 것이 정상.
  // 이 경우 모든 프로젝트를 반환한다. 멀티유저 배포 시 인증 필수화가 필요함.
  const userGoogleId = req.user?.googleId;
  const filtered = userGoogleId
    ? projects.filter(p => !p.owner || p.owner.googleId === userGoogleId)
    : projects;

  // 최신순 정렬
  filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(filtered);
}));

// POST /api/projects - 프로젝트 생성
router.post('/', asyncHandler(async (req, res) => {
  const { name, title, author, description, claude_model, settings, template_id, template_vars, custom_prompt_config, include_hw_diagrams, image_generation_enabled, assessment_level } = req.body;

  if (!name || !title) {
    return res.status(400).json({ message: '프로젝트 ID와 제목은 필수입니다' });
  }

  // 프로젝트 한도 체크 (등급 기반)
  const userTier = req.userTier || 'starter';
  const maxProjects = TIER_CONFIG[userTier]?.maxProjects || 1;

  if (req.user?.googleId) {
    // 현재 프로젝트 수 카운트
    if (existsSync(PROJECTS_DIR)) {
      const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
      let count = 0;
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'template') continue;
        const configFile = join(PROJECTS_DIR, entry.name, 'config.json');
        if (!existsSync(configFile)) continue;
        try {
          const raw = await readFile(configFile, 'utf-8');
          const config = JSON.parse(raw);
          if (config.owner?.googleId === req.user.googleId) count++;
        } catch { /* skip */ }
      }

      if (count >= maxProjects) {
        return res.status(403).json({
          message: `프로젝트 한도에 도달했습니다 (${count}/${maxProjects}개). 등급 업그레이드를 요청하세요.`,
          currentCount: count,
          maxProjects,
          currentTier: userTier,
        });
      }
    }
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

  // config.json 작성 (owner 정보 포함)
  const config = {
    name,
    title,
    author: author || '',
    description: description || '',
    claude_model: claude_model || 'claude-sonnet-4-6',
    owner: req.user ? {
      googleId: req.user.googleId,
      email: req.user.email,
      name: req.user.name,
    } : null,
    settings: {
      batch_generation_enabled: settings?.batch_generation_enabled ?? true,
      auto_save: settings?.auto_save ?? true,
      max_tokens: settings?.max_tokens ?? 16000,
      temperature: 1.0,
    },
    include_hw_diagrams: include_hw_diagrams || false,
    image_generation_enabled: image_generation_enabled || false,
    assessment_level: assessment_level ?? 2,
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
  const { what_id, how_id, features: featureIds, context_answers } = req.body;

  if (what_id && how_id) {
    // ── v2: 3축 조합 시스템 ──
    const tc = new TemplateComposer();
    await tc.applyV2(projPath, what_id, how_id, featureIds || [], context_answers || {});
  } else if (template_id) {
    // ── v1: 레거시 단일 템플릿 ──
    const tm = new TemplateManager();
    const success = await tm.applyTemplate(template_id, projPath, template_vars || {});

    // 커스텀 프롬프트 저장 (목차/챕터 프롬프트 오버라이드)
    if (success && custom_prompt_config) {
      const infoFile = join(projPath, 'template-info.json');
      if (existsSync(infoFile)) {
        const raw = await readFile(infoFile, 'utf-8');
        const info = JSON.parse(raw);
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

// ── v2 3축 템플릿 API ──

// GET /api/projects/templates/whats - 교과 전문성 목록
router.get('/templates/whats', asyncHandler(async (req, res) => {
  const tc = new TemplateComposer();
  const whats = await tc.listWhats();
  res.json(whats);
}));

// GET /api/projects/templates/hows - 교육 모델 목록
router.get('/templates/hows', asyncHandler(async (req, res) => {
  const tc = new TemplateComposer();
  const hows = await tc.listHows();
  res.json(hows);
}));

// GET /api/projects/templates/features - 기능 옵션 목록
router.get('/templates/features', asyncHandler(async (req, res) => {
  const tc = new TemplateComposer();
  const features = await tc.listFeatures();
  res.json(features);
}));

// POST /api/projects/templates/compose-preview - 조합 미리보기
router.post('/templates/compose-preview', asyncHandler(async (req, res) => {
  const { what_id, how_id, features } = req.body;
  if (!how_id) return res.status(400).json({ message: 'how_id는 필수입니다' });
  const tc = new TemplateComposer();
  const composed = await tc.compose(what_id || '_default', how_id, features || []);
  res.json({
    persona: composed.persona,
    templateName: composed.templateName,
    compatibility: composed.compatibility,
    tocAdditionPreview: composed.tocAddition.slice(0, 500),
    chapterAdditionPreview: composed.chapterAddition.slice(0, 500),
  });
}));

// GET /api/projects/templates/check-compatibility - 호환성 검사
router.get('/templates/check-compatibility', asyncHandler(async (req, res) => {
  const { what_id, how_id, features } = req.query;
  if (!what_id || !how_id) return res.status(400).json({ message: 'what_id와 how_id는 필수입니다' });
  const tc = new TemplateComposer();
  const what = await tc.loadWhat(what_id);
  const how = await tc.loadHow(how_id);
  if (!what || !how) return res.status(404).json({ message: '템플릿을 찾을 수 없습니다' });
  const featureList = features ? (typeof features === 'string' ? features.split(',') : features) : [];
  const result = tc.checkCompatibility(what, how, featureList);
  res.json(result);
}));

// GET /api/projects/templates/samples/:templateId - 템플릿 샘플 챕터 조회
router.get('/templates/samples/:templateId', asyncHandler(async (req, res) => {
  const samplesFile = join(__dirname, '..', '..', 'samples', 'template-samples.md');
  if (!existsSync(samplesFile)) {
    return res.status(404).json({ message: '샘플 파일을 찾을 수 없습니다' });
  }

  const templateId = req.params.templateId;

  // 템플릿 ID → 샘플 섹션 매핑
  const sectionMap = {
    'storytelling': '1.',
    'school-textbook': '2.',
    'programming-course': '3.',
    'self-directed-learning': '4.',
    'business-education': '5.',
    'teacher-guide-4c': '6.',
    'workshop-material': '7.',
    'class-preview': '8.',
    'lesson-per-session': '9.',
  };

  const sectionPrefix = sectionMap[templateId];
  if (!sectionPrefix) {
    return res.status(404).json({ message: '해당 템플릿의 샘플이 없습니다' });
  }

  const raw = await readFile(samplesFile, 'utf-8');
  const sections = raw.split(/\n---\n/);

  // 해당 섹션 번호로 시작하는 ## 헤더를 가진 섹션 찾기
  let sample = null;
  for (const section of sections) {
    const trimmed = section.trim();
    // "## 1. 스토리텔링 교육자료" 같은 패턴 매칭
    if (trimmed.startsWith(`## ${sectionPrefix}`) || trimmed.match(new RegExp(`^##\\s+${sectionPrefix.replace('.', '\\.')}`))) {
      sample = trimmed;
      break;
    }
  }

  if (!sample) {
    return res.status(404).json({ message: '해당 템플릿의 샘플을 찾을 수 없습니다' });
  }

  // ## 헤더에서 제목 추출
  const titleMatch = sample.match(/^##\s+\d+\.\s+(.+?)(?:\s*—\s*(.+))?$/m);
  const title = titleMatch ? (titleMatch[2] || titleMatch[1]) : templateId;

  res.json({ templateId, title, content: sample });
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
  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    // 손상된 config.json 방어
    console.error(`[PUT /:id] config.json 파싱 실패:`, e.message);
    return res.status(422).json({ message: '프로젝트 설정 파일이 손상되었습니다' });
  }
  const updates = req.body;

  // 허용된 필드만 업데이트
  if (updates.title !== undefined) config.title = updates.title;
  if (updates.author !== undefined) config.author = updates.author;
  if (updates.description !== undefined) config.description = updates.description;
  if (updates.target_audience !== undefined) config.target_audience = updates.target_audience;
  if (updates.claude_model !== undefined) config.claude_model = updates.claude_model;
  if (updates.settings) config.settings = { ...config.settings, ...updates.settings };
  if (updates.include_hw_diagrams !== undefined) config.include_hw_diagrams = updates.include_hw_diagrams;
  if (updates.image_generation_enabled !== undefined) config.image_generation_enabled = updates.image_generation_enabled;
  if (updates.assessment_level !== undefined) config.assessment_level = updates.assessment_level;
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

// POST /api/projects/:id/references/paste - 텍스트/HTML 복붙
router.post('/:id/references/paste', asyncHandler(async (req, res) => {
  const { title, content, format } = req.body;
  if (!title || !content) {
    return res.status(400).json({ message: '제목과 내용은 필수입니다' });
  }

  const rm = new ReferenceManager(projectPath(req.params.id));
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ_\-\s]/g, '_').trim().slice(0, 100);

  let finalContent = content;
  let ext = '.md';

  if (format === 'html') {
    // HTML → Markdown 변환
    try {
      const TurndownService = (await import('turndown')).default;
      const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
      finalContent = td.turndown(content);
    } catch (e) {
      // 변환 실패 시 원본 HTML에서 태그 제거
      finalContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  } else if (format === 'text') {
    ext = '.txt';
  }
  // format === 'markdown' 또는 기본값: .md 그대로

  const filename = `${sanitizedTitle}${ext}`;
  const buffer = Buffer.from(finalContent, 'utf-8');
  const path = await rm.saveFile(buffer, filename);

  res.status(201).json({ saved: { name: filename, path }, message: '참고자료로 저장되었습니다' });
}));

// GET /api/projects/:id/references/search - 검색 (/:filename보다 먼저 등록)
router.get('/:id/references/search', asyncHandler(async (req, res) => {
  const rm = new ReferenceManager(projectPath(req.params.id));
  const files = await rm.searchFiles(req.query.q || '');
  res.json({ files });
}));

// GET /api/projects/:id/references/:filename - 내용 읽기 (모든 포맷 지원)
router.get('/:id/references/:filename', asyncHandler(async (req, res) => {
  const rm = new ReferenceManager(projectPath(req.params.id));
  const result = await rm.readFileContent(req.params.filename);

  if (result.status === 'not_found') {
    return res.status(404).json({ message: '파일을 찾을 수 없습니다' });
  }
  if (result.status === 'parse_error' || result.status === 'unsupported') {
    // 파싱 실패 또는 미지원 포맷은 422 상태코드로 반환 (BUG-017)
    const statusCode = result.status === 'parse_error' ? 422 : 415;
    return res.status(statusCode).json({ filename: req.params.filename, content: null, status: result.status, error: result.error });
  }
  res.json({ filename: req.params.filename, content: result.content, status: 'ok', format: result.format });
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

  const { toc_prompt_addition, chapter_prompt_addition, what_id, how_id, features, context_answers } = req.body;
  if (toc_prompt_addition !== undefined) {
    info.toc_prompt_addition = toc_prompt_addition;
  }
  if (chapter_prompt_addition !== undefined) {
    info.chapter_prompt_addition = chapter_prompt_addition;
  }
  info.custom_prompt_config = { toc_prompt_addition, chapter_prompt_addition };

  // v2 필드 업데이트
  if (what_id !== undefined) info.what_id = what_id;
  if (how_id !== undefined) info.how_id = how_id;
  if (features !== undefined) info.features = features;
  if (context_answers !== undefined) info.context_answers = context_answers;

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
