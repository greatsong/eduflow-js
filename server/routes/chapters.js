import { Router } from 'express';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { ChapterGenerator } from '../services/chapterGenerator.js';
import { ProgressManager } from '../services/progressManager.js';
import { streamChat, detectProvider, resolveApiKey } from '../services/aiProvider.js';
import { TokenUsageManager } from '../services/tokenUsageManager.js';
import { sanitizeId } from '../middleware/sanitize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
const tokenUsage = new TokenUsageManager(DATA_DIR);

const router = Router({ mergeParams: true });

function projectPath(id) {
  const safe = sanitizeId(id);
  if (!safe) throw new Error('잘못된 프로젝트 ID입니다.');
  return join(PROJECTS_DIR, safe);
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

// GET /api/projects/:id/chapters/generation-status - 배치 생성 진행 상태
router.get('/generation-status', asyncHandler(async (req, res) => {
  const gen = new ChapterGenerator(projectPath(req.params.id));
  const status = await gen.loadGenerationStatus();
  if (!status) {
    return res.json({ status: 'idle' });
  }
  // 5분 이상 업데이트 없는 running 상태는 stale 처리
  if (status.status === 'running' && status.updated_at) {
    const elapsed = Date.now() - new Date(status.updated_at).getTime();
    if (elapsed > 5 * 60 * 1000) {
      status.status = 'failed';
      status.stale = true;
    }
  }
  res.json(status);
}));

// POST /api/projects/:id/chapters/generation-cancel - 배치 생성 취소
router.post('/generation-cancel', asyncHandler(async (req, res) => {
  const gen = new ChapterGenerator(projectPath(req.params.id));
  const cancelled = await gen.requestCancel();
  res.json({ success: cancelled, message: cancelled ? '취소 요청됨' : '실행 중인 생성이 없습니다' });
}));

// GET /api/projects/:id/chapters/images - 이미지 목록
router.get('/images', asyncHandler(async (req, res) => {
  const imagesDir = join(projectPath(req.params.id), 'docs', 'images');
  if (!existsSync(imagesDir)) {
    return res.json([]);
  }
  const { readdir: rd, stat: st } = await import('fs/promises');
  const files = await rd(imagesDir);
  const images = [];
  for (const f of files) {
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f)) {
      const s = await st(join(imagesDir, f));
      images.push({ name: f, size: s.size, created: s.birthtime });
    }
  }
  res.json(images);
}));

// GET /api/projects/:id/chapters/images/:filename - 이미지 파일 서빙
router.get('/images/:filename', (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, asyncHandler(async (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
  const filePath = join(projectPath(req.params.id), 'docs', 'images', filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ message: '이미지를 찾을 수 없습니다' });
  }
  res.sendFile(filePath);
}));

// GET /api/projects/:id/chapters/chat-history - 전체 대화 기록 로드
router.get('/chat-history', asyncHandler(async (req, res) => {
  const filePath = join(projectPath(req.params.id), 'chat_history.json');
  if (!existsSync(filePath)) return res.json({});
  try {
    const { readFile: rf } = await import('fs/promises');
    const data = JSON.parse(await rf(filePath, 'utf-8'));
    res.json(data);
  } catch {
    res.json({});
  }
}));

// PUT /api/projects/:id/chapters/chat-history - 대화 기록 저장
router.put('/chat-history', asyncHandler(async (req, res) => {
  const { chapterId, messages } = req.body;
  if (!chapterId) return res.status(400).json({ message: 'chapterId 필요' });

  const filePath = join(projectPath(req.params.id), 'chat_history.json');
  let history = {};
  if (existsSync(filePath)) {
    try {
      const { readFile: rf } = await import('fs/promises');
      history = JSON.parse(await rf(filePath, 'utf-8'));
    } catch { /* start fresh */ }
  }

  if (messages && messages.length > 0) {
    // 최근 100개 메시지 저장 (BUG-022: 50→100으로 완화, 긴 대화 지원)
    const maxMessages = parseInt(process.env.CHAT_HISTORY_LIMIT, 10) || 100;
    history[chapterId] = messages.slice(-maxMessages);
  } else {
    delete history[chapterId];
  }

  const { writeFile: wf } = await import('fs/promises');
  await wf(filePath, JSON.stringify(history, null, 2), 'utf-8');
  res.json({ success: true });
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
router.post('/generate-all', requireApiKey,  asyncHandler(async (req, res) => {
  const { model, maxTokens, concurrent, skipCompleted, tpmLimit, chapterIds } = req.body;
  const projPath = projectPath(req.params.id);

  sseHeaders(res);

  try {
    const gen = new ChapterGenerator(projPath, req.apiKeys);
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
      model || 'claude-opus-4-7',
      maxTokens || 12000,
      concurrent || 1,
      progressCallback,
      skipCompleted !== false,
      tpmLimit || 0,  // TPM 제한 (0이면 비활성화)
      chapterIds || null  // 특정 챕터만 생성 (null이면 전체)
    );

    // 성공한 챕터 진행 상태 업데이트 + 토큰 사용량 기록
    const pm = new ProgressManager(projPath);
    const useModel = model || 'claude-opus-4-7';
    const provider = detectProvider(useModel);
    for (const ch of report.chapters || []) {
      if (ch.success) {
        await pm.markChapterCompleted(ch.chapter_id);
        // 개별 챕터 토큰 기록
        tokenUsage.record({
          userId: req.user?.googleId, userName: req.user?.name,
          userEmail: req.user?.email,
          projectId: req.params.id, action: 'chapter',
          provider, model: useModel,
          inputTokens: ch.input_tokens || 0, outputTokens: ch.output_tokens || 0,
          keySource: req.headers[`x-${provider}-key`] ? 'user' : 'server',
        });
      }
    }

    sseSend(res, { type: 'done', report });
  } catch (e) {
    // BUG-012: 에러 유형별 사용자 친화적 메시지 제공
    let userMessage;
    const msg = e.message || '';
    if (msg.includes('API key') || msg.includes('api_key') || msg.includes('401') || msg.includes('authentication')) {
      userMessage = 'API 키를 확인해주세요. 키가 유효하지 않거나 만료되었을 수 있습니다.';
    } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNABORTED')) {
      userMessage = '응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    } else {
      userMessage = '챕터 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    }
    console.error('[chapters/generate-all] 에러:', msg);
    sseSend(res, { type: 'error', message: userMessage });
  }

  res.end();
}));

// POST /api/projects/:id/chapters/:chapterId/generate - 단일 챕터 생성
router.post('/:chapterId/generate', requireApiKey,  asyncHandler(async (req, res) => {
  const { model, maxTokens } = req.body;
  const projPath = projectPath(req.params.id);
  const chapterId = req.params.chapterId;

  const gen = new ChapterGenerator(projPath, req.apiKeys);
  await gen.init();

  // TOC에서 챕터 정보 조회
  const info = await gen.findChapterInToc(chapterId);

  const useModel = model || 'claude-opus-4-7';
  const result = await gen.generateChapter(
    chapterId,
    info.chapter_title || chapterId,
    info.part_context || '',
    useModel,
    maxTokens || 12000,
    null,
    info.estimated_time || '',
    info.total_chapters || 0,
    info.current_chapter_num || 0
  );

  if (result.success) {
    const pm = new ProgressManager(projPath);
    await pm.markChapterCompleted(chapterId);

    // 토큰 사용량 기록
    const provider = detectProvider(useModel);
    tokenUsage.record({
      userId: req.user?.googleId, userName: req.user?.name,
      userEmail: req.user?.email,
      projectId: req.params.id, action: 'chapter',
      provider, model: useModel,
      inputTokens: result.input_tokens, outputTokens: result.output_tokens,
      keySource: req.headers[`x-${provider}-key`] ? 'user' : 'server',
    });
  }

  res.json(result);
}));

// POST /api/projects/:id/chapters/:chapterId/chat - 인터랙티브 채팅 (SSE)
router.post('/:chapterId/chat', requireApiKey,  asyncHandler(async (req, res) => {
  const { message, model, messages: chatHistory } = req.body;
  const projPath = projectPath(req.params.id);
  const chapterId = req.params.chapterId;

  sseHeaders(res);

  try {
    const gen = new ChapterGenerator(projPath, req.apiKeys);
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
${currentContent.slice(0, 8000) || '(아직 작성되지 않음)'}
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

    const useModel = model || 'claude-sonnet-4-6';
    const provider = detectProvider(useModel);
    const apiKey = resolveApiKey(provider, req.apiKeys);

    // API 키 검증: 키가 없으면 SSE 에러 전송 후 종료
    if (!apiKey) {
      sseSend(res, { type: 'error', message: `${provider} API 키가 설정되지 않았습니다. 설정에서 API 키를 확인해주세요.` });
      res.end();
      return;
    }

    const result = await streamChat({
      provider, apiKey, model: useModel,
      messages: apiMessages,
      system: systemPrompt,
      maxTokens: 4096, res,
    });

    // 토큰 사용량 기록
    tokenUsage.record({
      userId: req.user?.googleId, userName: req.user?.name,
      userEmail: req.user?.email,
      projectId: req.params.id, action: 'chat',
      provider, model: useModel,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      keySource: req.headers[`x-${provider}-key`] ? 'user' : 'server',
    });

    sseSend(res, { type: 'done' });
    res.end();
  } catch (e) {
    // BUG-012: 에러 유형별 사용자 친화적 메시지 제공
    let userMessage;
    const msg = e.message || '';
    if (msg.includes('API key') || msg.includes('api_key') || msg.includes('401') || msg.includes('authentication')) {
      userMessage = 'API 키를 확인해주세요. 키가 유효하지 않거나 만료되었을 수 있습니다.';
    } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNABORTED')) {
      userMessage = '응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    } else {
      userMessage = '챕터 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    }
    console.error('[chapters/chat] 에러:', msg);
    sseSend(res, { type: 'error', message: userMessage });
    res.end();
  }
}));

// POST /api/projects/:id/chapters/:chapterId/image-chat - 이미지 프롬프트 개선 채팅 (SSE)
router.post('/:chapterId/image-chat', requireApiKey,  asyncHandler(async (req, res) => {
  const { message, imagePrompt, model, messages: clientMessages } = req.body;

  sseHeaders(res);

  try {
    const useModel = model || 'claude-sonnet-4-6';
    const provider = detectProvider(useModel);
    const apiKey = resolveApiKey(provider, req.apiKeys);

    // API 키 검증: 키가 없으면 SSE 에러 전송 후 종료
    if (!apiKey) {
      sseSend(res, { type: 'error', message: `${provider} API 키가 설정되지 않았습니다. 설정에서 API 키를 확인해주세요.` });
      res.end();
      return;
    }

    const systemPrompt = `당신은 AI 이미지 생성 프롬프트 전문가이자 교육 시각 자료 컨설턴트입니다.

## 현재 이미지 프롬프트
${imagePrompt}

## 역할
1. 프롬프트의 강점과 약점을 교육적 관점에서 분석
2. 사용자의 개선 아이디어를 반영한 구체적인 대안 제시
3. 교육용 이미지로서의 효과를 극대화하도록 조언

## 좋은 이미지 프롬프트의 조건
- 구체적 시각 요소 (색상, 레이블, 구도)
- 교육 목적 명시 ("~를 보여주는", "~를 비교하는")
- 대상 학습자 수준 고려
- 스타일 지정 (일러스트, 다이어그램, 사진 등)

## 응답 형식
개선된 프롬프트를 제안할 때는 반드시 아래 형식을 사용하세요:
\`\`\`image-prompt
개선된 이미지 프롬프트 내용
\`\`\`

이 형식으로 출력하면 사용자가 "적용" 버튼 한 번으로 교체할 수 있습니다.
친근하고 구체적인 톤으로 답변하세요. 한국어로 답변하세요.`;

    const result = await streamChat({
      provider, apiKey, model: useModel,
      messages: clientMessages || [{ role: 'user', content: message }],
      system: systemPrompt,
      maxTokens: 1024, res,
    });

    tokenUsage.record({
      userId: req.user?.googleId, userName: req.user?.name,
      userEmail: req.user?.email,
      projectId: req.params.id, action: 'image-chat',
      provider, model: useModel,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      keySource: req.headers[`x-${provider}-key`] ? 'user' : 'server',
    });

    sseSend(res, { type: 'done', content: result.content });
  } catch (e) {
    sseSend(res, { type: 'error', message: e.message });
  }
  res.end();
}));

// POST /api/projects/:id/chapters/:chapterId/regenerate-image - 이미지 재생성
router.post('/:chapterId/regenerate-image', requireApiKey, asyncHandler(async (req, res) => {
  const { imageName, newPrompt } = req.body;
  if (!imageName || !newPrompt) {
    return res.status(400).json({ message: 'imageName과 newPrompt가 필요합니다' });
  }

  const googleApiKey = resolveApiKey('google', req.apiKeys);
  if (!googleApiKey) {
    return res.status(400).json({ message: 'Google API 키가 필요합니다' });
  }

  try {
    const { ImageGenerator } = await import('../services/imageGenerator.js');
    const imgGen = new ImageGenerator(googleApiKey, undefined, tokenUsage, {
      userId: req.user?.googleId,
      userName: req.user?.name,
      userEmail: req.user?.email,
      projectId: req.params.id,
    });
    const docsPath = join(projectPath(req.params.id), 'docs');
    const result = await imgGen.generateSingle(newPrompt, imageName, docsPath);

    // 이미지 생성도 토큰 사용량으로 기록
    tokenUsage.record({
      userId: req.user?.googleId, userName: req.user?.name,
      userEmail: req.user?.email,
      projectId: req.params.id, action: 'image-regenerate',
      provider: 'google', model: imgGen.model,
      inputTokens: 0, outputTokens: 0,
      keySource: 'server',
    });

    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ message: `이미지 생성 실패: ${e.message}` });
  }
}));

export default router;
