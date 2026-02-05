import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { ChapterGenerator } from '../services/chapterGenerator.js';
import { ProgressManager } from '../services/progressManager.js';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');

const router = Router({ mergeParams: true });

function projectPath(id) {
  return join(PROJECTS_DIR, id);
}

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// GET /api/projects/:id/chapters - 챕터 목록 + 상태
router.get('/', asyncHandler(async (req, res) => {
  const gen = new ChapterGenerator(projectPath(req.params.id));
  await gen.init();
  const chapters = await gen.listChapters();
  const report = await gen.loadReport();
  res.json({ chapters, report });
}));

// GET /api/projects/:id/chapters/:chapterId - 챕터 내용 읽기
router.get('/:chapterId', asyncHandler(async (req, res) => {
  const gen = new ChapterGenerator(projectPath(req.params.id));
  await gen.init();
  const content = await gen.readChapter(req.params.chapterId);

  if (content === null) {
    return res.status(404).json({ message: '챕터를 찾을 수 없습니다' });
  }

  res.json({ chapter_id: req.params.chapterId, content });
}));

// PUT /api/projects/:id/chapters/:chapterId - 챕터 내용 수정
router.put('/:chapterId', asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (content === undefined) {
    return res.status(400).json({ message: 'content가 필요합니다' });
  }

  const gen = new ChapterGenerator(projectPath(req.params.id));
  await gen.init();
  await gen.saveChapter(req.params.chapterId, content);
  res.json({ success: true });
}));

// POST /api/projects/:id/chapters/generate-all - 배치 생성 (SSE)
router.post('/generate-all', requireApiKey, asyncHandler(async (req, res) => {
  const { model, maxTokens, concurrent, skipCompleted } = req.body;
  const projPath = projectPath(req.params.id);

  sseHeaders(res);

  try {
    const gen = new ChapterGenerator(projPath, req.apiKey);
    await gen.init();

    // TOC 로드
    const tocData = await gen._loadJson(join(projPath, 'toc.json'));
    if (!tocData || !tocData.parts) {
      sseSend(res, { type: 'error', message: '목차(toc.json)가 없습니다. 먼저 Step 2에서 목차를 생성하세요.' });
      return res.end();
    }

    // SSE 진행 콜백
    const progressCallback = (message) => {
      sseSend(res, { type: 'progress', message });
    };

    const report = await gen.generateAllChapters(
      tocData,
      model || 'claude-opus-4-5-20251101',
      maxTokens || 16000,
      concurrent || 1,
      progressCallback,
      skipCompleted !== false
    );

    // 성공한 챕터 진행 상태 업데이트
    const pm = new ProgressManager(projPath);
    for (const ch of report.chapters || []) {
      if (ch.success) {
        await pm.markChapterCompleted(ch.chapter_id);
      }
    }

    sseSend(res, { type: 'report', report });
    sseSend(res, { type: 'done' });
  } catch (e) {
    sseSend(res, { type: 'error', message: e.message });
  }

  res.end();
}));

// POST /api/projects/:id/chapters/:chapterId/generate - 단일 챕터 생성
router.post('/:chapterId/generate', requireApiKey, asyncHandler(async (req, res) => {
  const { model, maxTokens } = req.body;
  const projPath = projectPath(req.params.id);
  const chapterId = req.params.chapterId;

  const gen = new ChapterGenerator(projPath, req.apiKey);
  await gen.init();

  // TOC에서 챕터 정보 조회
  const info = await gen.findChapterInToc(chapterId);

  const result = await gen.generateChapter(
    chapterId,
    info.chapter_title || chapterId,
    info.part_context || '',
    model || 'claude-opus-4-5-20251101',
    maxTokens || 16000,
    null,
    info.estimated_time || '',
    info.total_chapters || 0,
    info.current_chapter_num || 0
  );

  if (result.success) {
    const pm = new ProgressManager(projPath);
    await pm.markChapterCompleted(chapterId);
  }

  res.json(result);
}));

// POST /api/projects/:id/chapters/:chapterId/chat - 인터랙티브 채팅 (SSE)
router.post('/:chapterId/chat', requireApiKey, asyncHandler(async (req, res) => {
  const { message, model, messages: chatHistory } = req.body;
  const projPath = projectPath(req.params.id);
  const chapterId = req.params.chapterId;

  sseHeaders(res);

  try {
    const gen = new ChapterGenerator(projPath, req.apiKey);
    await gen.init();

    // 현재 챕터 내용 로드
    const currentContent = await gen.readChapter(chapterId) || '';

    // TOC에서 챕터 정보
    const info = await gen.findChapterInToc(chapterId);
    const pc = gen._getPromptConfig();

    const systemPrompt = `당신은 ${pc.role}입니다.

현재 작성 중인 챕터:
- **ID**: ${chapterId}
- **제목**: ${info.chapter_title || chapterId}
${info.part_context ? `- ${info.part_context}` : ''}

현재 내용:
\`\`\`markdown
${currentContent.slice(0, 3000) || '(아직 작성되지 않음)'}
\`\`\`

사용자의 요청에 따라:
1. 교육자료 내용을 제안하거나 수정해주세요
2. ${pc.audience} 눈높이에 맞게 친근하고 쉽게 작성해주세요
3. 실습 코드는 주석을 포함하여 단계별로 설명해주세요
4. 필요시 Mermaid 다이어그램을 사용해주세요
5. 마크다운 형식으로 답변해주세요

전체 챕터 내용을 제시할 때는 \`\`\`markdown 코드블록으로 감싸주세요.`;

    const apiMessages = (chatHistory || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    apiMessages.push({ role: 'user', content: message });

    const client = new Anthropic({ apiKey: req.apiKey });
    const stream = client.messages.stream({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: apiMessages,
    });

    stream.on('text', (text) => {
      sseSend(res, { type: 'text', content: text });
    });

    stream.on('end', () => {
      sseSend(res, { type: 'done' });
      res.end();
    });

    stream.on('error', (err) => {
      sseSend(res, { type: 'error', message: err.message });
      res.end();
    });
  } catch (e) {
    sseSend(res, { type: 'error', message: e.message });
    res.end();
  }
}));

export default router;
