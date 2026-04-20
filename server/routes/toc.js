import { Router } from 'express';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, extname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireApiKey, requireModelAccess } from '../middleware/apiKey.js';
import { chat, detectProvider, resolveApiKey } from '../services/aiProvider.js';
import { TOCGenerator } from '../services/tocGenerator.js';
import { ReferenceManager } from '../services/referenceManager.js';
import { ConversationManager } from '../services/conversationManager.js';
import { ProgressManager } from '../services/progressManager.js';
import { TokenUsageManager } from '../services/tokenUsageManager.js';
import { sanitizeId } from '../middleware/sanitize.js';
import { registerSSE } from '../services/sseManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
const tokenUsage = new TokenUsageManager(DATA_DIR);

const router = Router({ mergeParams: true });

// parse-file용 멀터 (메모리, 80MB 한도 — PDF 50MB + DOCX 20MB + 여유)
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

// 빠른 시작에서 직접 업로드 가능한 포맷
const PARSE_FILE_EXTS = new Set([
  '.md', '.txt', '.markdown', '.text', '.csv', '.json',
  '.pdf', '.docx', '.xlsx', '.xls', '.html', '.htm', '.hwp', '.hwpx',
]);

// 대용량 입력 한도 (문자). 초과 시 앞부분만 사용하고 사용자에게 경고.
const TOC_INPUT_CHAR_LIMIT = 80000; // ~20-25K tokens

/**
 * TOC 분석용 max_tokens를 입력 길이에 따라 동적으로 산정.
 * 짧은 문서는 4K, 긴 문서는 최대 16K까지.
 */
function calcTocMaxTokens(inputLen) {
  if (inputLen < 5000) return 4096;
  if (inputLen < 20000) return 8192;
  if (inputLen < 50000) return 12000;
  return 16000;
}

/**
 * AI 응답에서 JSON을 강건하게 추출. 여러 패턴 시도 + 에러 메시지 풍부화.
 */
function extractTocJson(responseText) {
  const patterns = [
    /```json\s*([\s\S]*?)```/,
    /```\s*([\s\S]*?)```/,
    /(\{[\s\S]*\})/,
  ];
  for (const re of patterns) {
    const match = responseText.match(re);
    if (!match) continue;
    const candidate = (match[1] || match[0]).trim();
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.parts)) {
        return parsed;
      }
    } catch { /* 다음 패턴 시도 */ }
  }
  // 최종 시도: 응답 전체를 JSON으로 파싱
  try {
    const parsed = JSON.parse(responseText.trim());
    if (parsed && Array.isArray(parsed.parts)) return parsed;
  } catch { /* ignore */ }
  return null;
}

function buildTocPrompt(content) {
  return `다음 교육자료를 분석하여 목차(Table of Contents)를 JSON 형식으로 추출해주세요.

## 입력 내용
${content}

## 출력 형식 (반드시 이 JSON 형식을 지켜주세요)
\`\`\`json
{
  "title": "교육자료 제목",
  "target_audience": "대상 독자",
  "description": "설명",
  "total_hours": "총 학습시간",
  "parts": [
    {
      "part_number": 1,
      "part_title": "Part 제목",
      "part_description": "Part 설명",
      "chapters": [
        {
          "chapter_id": "chapter01",
          "chapter_number": 1,
          "chapter_title": "챕터 제목",
          "estimated_time": "50분",
          "learning_objectives": ["목표1", "목표2"],
          "key_topics": ["주제1", "주제2"],
          "outline": "챕터 개요"
        }
      ]
    }
  ]
}
\`\`\`

## 주의사항
- 입력의 구조(# 제목, ## 소제목 등 또는 단락 구조)를 기반으로 Part와 Chapter를 나누세요
- chapter_id는 chapter01, chapter02 형식으로 순차 할당하세요
- estimated_time은 내용량에 따라 20분~90분 사이로 추정하세요
- **반드시 유효한 JSON만 출력하세요** (설명 텍스트·주석·머리말 없이 \`\`\`json 코드블록 안의 JSON만)`;
}

/**
 * TOC JSON을 생성한다. 1회 실패 시 자동 재시도.
 */
async function generateTocFromText({ provider, apiKey, model, content, maxTokens, onProgress }) {
  const prompt = buildTocPrompt(content);
  const attempts = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await chat({
      provider, apiKey, model,
      maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    attempts.push({ result });

    const parsed = extractTocJson(result.content);
    const isTruncated = result.stopReason === 'max_tokens' || result.stop_reason === 'max_tokens';

    if (parsed && !isTruncated) {
      return { tocData: parsed, result, truncated: false };
    }

    if (!parsed && attempt < 2) {
      onProgress?.(`⚠️ JSON 파싱 실패 — 재시도 (${attempt}/2)...`);
      continue;
    }

    // 최종: 파싱은 됐지만 잘림 의심 → 사용자 경고와 함께 반환
    if (parsed) {
      return { tocData: parsed, result, truncated: isTruncated };
    }
  }

  // 전부 실패
  const last = attempts[attempts.length - 1]?.result;
  throw new Error(`AI 응답을 JSON으로 파싱할 수 없습니다. 응답 앞부분: ${(last?.content || '').slice(0, 300)}`);
}

function projectPath(id) {
  const safe = sanitizeId(id);
  if (!safe) throw new Error('잘못된 프로젝트 ID입니다.');
  return join(PROJECTS_DIR, safe);
}

// GET /api/projects/:id/toc - 목차 로드
router.get('/', asyncHandler(async (req, res) => {
  const tg = new TOCGenerator(projectPath(req.params.id));
  const toc = await tg.loadToc();
  res.json({ toc });
}));

// PUT /api/projects/:id/toc - 목차 저장 (JSON 편집)
router.put('/', asyncHandler(async (req, res) => {
  const { toc } = req.body;
  if (!toc) {
    return res.status(400).json({ message: 'toc 데이터가 필요합니다' });
  }

  const tg = new TOCGenerator(projectPath(req.params.id));
  await tg.saveToc(toc);
  await tg.generateOutlines(toc);

  res.json({ success: true });
}));

// POST /api/projects/:id/toc/generate - 목차 자동 생성 (SSE)
router.post('/generate', requireApiKey, requireModelAccess, asyncHandler(async (req, res) => {
  const { model, maxTokens } = req.body;
  const projPath = projectPath(req.params.id);

  const sse = registerSSE(req, res);
  if (!sse.ok) return res.status(429).json({ message: '동시 SSE 연결이 너무 많습니다.' });

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // 방향성 논의 요약 로드
    const cm = new ConversationManager(projPath);
    const directionSummary = await cm.loadSummary('1');
    if (!directionSummary) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: '먼저 Step 1에서 방향성 논의를 완료하고 요약을 생성하세요.' })}\n\n`);
      res.end();
      return;
    }

    // 참고자료 로드 (PDF, DOCX, XLSX, HWP 등 모든 포맷 지원)
    const refManager = new ReferenceManager(projPath);
    const refs = await refManager.listFiles();
    const referencesContent = [];
    for (const ref of refs) {
      try {
        const result = await refManager.readFileContent(ref.name);
        if (result.status === 'ok' && result.content) referencesContent.push(result.content);
      } catch { /* skip */ }
    }

    // 목차 생성 (SSE 스트리밍)
    const tg = new TOCGenerator(projPath, req.apiKeys);
    const tocData = await tg.generate(
      referencesContent,
      directionSummary,
      model || 'claude-opus-4-7',
      maxTokens || 16384,
      res
    );

    // 토큰 사용량 기록
    if (tocData._tokenInfo) {
      const ti = tocData._tokenInfo;
      tokenUsage.record({
        userId: req.user?.googleId, userName: req.user?.name,
        userEmail: req.user?.email,
        projectId: req.params.id, action: 'toc',
        provider: ti.provider, model: ti.model,
        inputTokens: ti.inputTokens, outputTokens: ti.outputTokens,
        keySource: req.headers[`x-${ti.provider}-key`] ? 'user' : 'server',
      });
      delete tocData._tokenInfo; // 저장 시 제외
    }

    // 저장
    await tg.saveToc(tocData);
    await tg.generateOutlines(tocData);

    // 진행 상태 업데이트
    const pm = new ProgressManager(projPath);
    await pm.markStep2Completed();

    res.write(`data: ${JSON.stringify({ type: 'toc', toc: tocData })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
  }

  res.end();
}));

// GET /api/projects/:id/toc/guidelines - 생성 가이드라인 로드
router.get('/guidelines', asyncHandler(async (req, res) => {
  const filePath = join(projectPath(req.params.id), 'generation_guidelines.md');
  let guidelines = '';
  if (existsSync(filePath)) {
    guidelines = await readFile(filePath, 'utf-8');
  }
  res.json({ guidelines });
}));

// PUT /api/projects/:id/toc/guidelines - 생성 가이드라인 저장
router.put('/guidelines', asyncHandler(async (req, res) => {
  const { guidelines } = req.body;
  const filePath = join(projectPath(req.params.id), 'generation_guidelines.md');
  await writeFile(filePath, guidelines || '', 'utf-8');
  res.json({ success: true });
}));

// POST /api/projects/:id/toc/confirm - 목차 확정
router.post('/confirm', asyncHandler(async (req, res) => {
  const projPath = projectPath(req.params.id);

  // toc_confirmed.txt 생성
  await writeFile(join(projPath, 'toc_confirmed.txt'), 'confirmed', 'utf-8');

  // 진행 상태 업데이트
  const pm = new ProgressManager(projPath);
  await pm.markStep3Confirmed();

  res.json({ success: true });
}));

// POST /api/projects/:id/toc/outlines - 아웃라인 파일 생성
router.post('/outlines', asyncHandler(async (req, res) => {
  const projPath = projectPath(req.params.id);
  const tg = new TOCGenerator(projPath);
  const toc = await tg.loadToc();

  if (!toc) {
    return res.status(400).json({ message: '먼저 목차를 생성하세요' });
  }

  await tg.generateOutlines(toc);
  res.json({ success: true });
}));

// POST /api/projects/:id/toc/direct - 목차 직접 입력 (Markdown → JSON 변환)
router.post('/direct', asyncHandler(async (req, res) => {
  const { toc_md } = req.body;
  if (!toc_md) {
    return res.status(400).json({ message: 'toc_md 데이터가 필요합니다' });
  }

  const projPath = projectPath(req.params.id);
  const tg = new TOCGenerator(projPath);

  // Markdown 파싱하여 JSON으로 변환
  const toc = parseTocMarkdown(toc_md);

  // 저장
  await tg.saveToc(toc);

  // toc.md도 저장
  const tocMdPath = join(projPath, 'toc.md');
  await writeFile(tocMdPath, toc_md, 'utf-8');

  // 아웃라인 생성
  await tg.generateOutlines(toc);

  // progress 업데이트
  const pm = new ProgressManager(projPath);
  await pm.markStep2Completed();

  res.json({ success: true, toc });
}));

// POST /api/projects/:id/toc/parse-md - MD 파일 내용을 Claude로 분석하여 TOC 생성 (SSE)
router.post('/parse-md', requireApiKey, requireModelAccess, asyncHandler(async (req, res) => {
  const { content, model, saveAsReference } = req.body;
  if (!content) {
    return res.status(400).json({ message: 'content가 필요합니다' });
  }

  const projPath = projectPath(req.params.id);

  const sse = registerSSE(req, res);
  if (!sse.ok) return res.status(429).json({ message: '동시 SSE 연결이 너무 많습니다.' });

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sseSend = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sseSend({ type: 'progress', message: '📄 파일 분석 중...' });

    // 입력 길이 점검 + 필요 시 절단
    const originalLen = content.length;
    let inputText = content;
    if (originalLen > TOC_INPUT_CHAR_LIMIT) {
      inputText = content.slice(0, TOC_INPUT_CHAR_LIMIT);
      sseSend({
        type: 'progress',
        message: `⚠️ 문서가 큽니다 (${originalLen.toLocaleString()}자). 목차 분석에는 앞부분 ${TOC_INPUT_CHAR_LIMIT.toLocaleString()}자만 사용하며, 챕터 생성에는 전체 내용이 참고자료로 사용됩니다.`,
      });
    }

    // 참고자료로도 저장 (옵션) — 챕터 생성 시 전체 내용 활용
    if (saveAsReference) {
      const refsDir = join(projPath, 'references');
      if (!existsSync(refsDir)) await mkdir(refsDir, { recursive: true });
      const refFileName = `uploaded-${Date.now()}.md`;
      await writeFile(join(refsDir, refFileName), content, 'utf-8');
      sseSend({ type: 'progress', message: `📚 참고자료로 저장: ${refFileName}` });
    }

    // AI API로 → JSON TOC 변환 (멀티 프로바이더)
    const useModel = model || 'claude-sonnet-4-6';
    const provider = detectProvider(useModel);
    const apiKey = resolveApiKey(provider, req.apiKeys);
    const tocMaxTokens = calcTocMaxTokens(inputText.length);

    sseSend({ type: 'progress', message: `🤖 AI가 목차를 분석하고 있습니다... (max_tokens=${tocMaxTokens})` });

    const { tocData, result, truncated } = await generateTocFromText({
      provider, apiKey, model: useModel, content: inputText, maxTokens: tocMaxTokens,
      onProgress: (m) => sseSend({ type: 'progress', message: m }),
    });

    // 토큰 사용량 기록
    tokenUsage.record({
      userId: req.user?.googleId, userName: req.user?.name,
      userEmail: req.user?.email,
      projectId: req.params.id, action: 'toc',
      provider, model: useModel,
      inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0,
      keySource: req.headers[`x-${provider}-key`] ? 'user' : 'server',
    });

    if (truncated) {
      sseSend({
        type: 'progress',
        message: '⚠️ AI 응답이 max_tokens에 도달해 일부 챕터가 누락되었을 수 있습니다. 목차를 검토 후 필요 시 수동 보완해주세요.',
      });
    }

    sseSend({ type: 'progress', message: `✅ 목차 분석 완료: ${tocData.parts?.length || 0}개 Part` });

    // 저장 (트랜잭션적 처리 — 실패 시 Step 완료 처리하지 않음)
    const tg = new TOCGenerator(projPath);
    await tg.saveToc(tocData);
    await tg.generateOutlines(tocData);

    // progress 업데이트 (Step 1, 2, 3 모두 완료 처리)
    const pm = new ProgressManager(projPath);
    await pm.markStep1Completed();
    await pm.markStep2Completed();
    await pm.markStep3Confirmed();
    await writeFile(join(projPath, 'toc_confirmed.txt'), 'confirmed', 'utf-8');

    sseSend({ type: 'progress', message: '✅ 목차 저장 및 아웃라인 생성 완료!' });
    sseSend({ type: 'progress', message: '✅ Step 1~3 자동 완료 처리됨 → 바로 챕터 제작 가능!' });
    sseSend({ type: 'toc', toc: tocData });
    sseSend({ type: 'done' });
  } catch (e) {
    sseSend({ type: 'error', message: `분석 실패: ${e.message}` });
  }

  res.end();
}));

// POST /api/projects/:id/toc/parse-file - 모든 포맷(PDF/DOCX/HWP/MD/TXT 등) 업로드 → TOC 자동 생성 (SSE)
// multipart/form-data: fields = { model?, saveAsReference? }, files = [file]
router.post('/parse-file', fileUpload.single('file'), requireApiKey, requireModelAccess, asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: '파일이 필요합니다' });

  const ext = extname(file.originalname).toLowerCase();
  if (!PARSE_FILE_EXTS.has(ext)) {
    return res.status(400).json({ message: `지원하지 않는 포맷입니다: ${ext}` });
  }

  const { model } = req.body;
  const saveAsReference = req.body.saveAsReference === 'true' || req.body.saveAsReference === true;
  const projPath = projectPath(req.params.id);

  const sse = registerSSE(req, res);
  if (!sse.ok) return res.status(429).json({ message: '동시 SSE 연결이 너무 많습니다.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sseSend = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    sseSend({ type: 'progress', message: `📄 ${file.originalname} 파싱 중... (${(file.size / 1024).toFixed(0)}KB)` });

    // 참고자료로 먼저 저장 (요청 시) — 챕터 생성에서 원본 파일 활용
    let parsedContent;
    const rm = new ReferenceManager(projPath);
    if (saveAsReference) {
      const savedPath = await rm.saveFile(file.buffer, file.originalname);
      const savedName = savedPath.split('/').pop();
      sseSend({ type: 'progress', message: `📚 참고자료로 저장: ${savedName}` });
      const parsedSaved = await rm.readFileContent(savedName);
      if (parsedSaved.status !== 'ok' || !parsedSaved.content) {
        sseSend({ type: 'error', message: `파싱 실패: ${parsedSaved.error || '알 수 없는 오류'}` });
        return res.end();
      }
      parsedContent = parsedSaved.content;
    } else {
      // 임시 디렉터리에 저장 후 파싱 (ReferenceManager는 경로 기반)
      const tmpDir = join(projPath, '.tmp-parse');
      if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });
      const tmpPath = join(tmpDir, file.originalname);
      await writeFile(tmpPath, file.buffer);
      const tmpRm = new ReferenceManager(projPath);
      tmpRm.referencesPath = tmpDir;
      const parsed = await tmpRm.readFileContent(file.originalname);
      try { await (await import('fs/promises')).unlink(tmpPath); } catch { /* ignore */ }
      if (parsed.status !== 'ok' || !parsed.content) {
        sseSend({ type: 'error', message: `파싱 실패: ${parsed.error || '알 수 없는 오류'}` });
        return res.end();
      }
      parsedContent = parsed.content;
    }

    const originalLen = parsedContent.length;
    sseSend({ type: 'progress', message: `✅ 파싱 완료 (${originalLen.toLocaleString()}자 추출)` });

    let inputText = parsedContent;
    if (originalLen > TOC_INPUT_CHAR_LIMIT) {
      inputText = parsedContent.slice(0, TOC_INPUT_CHAR_LIMIT);
      sseSend({
        type: 'progress',
        message: `⚠️ 문서가 큽니다 (${originalLen.toLocaleString()}자). 목차 분석에는 앞부분 ${TOC_INPUT_CHAR_LIMIT.toLocaleString()}자만 사용합니다.`,
      });
    }

    const useModel = model || 'claude-sonnet-4-6';
    const provider = detectProvider(useModel);
    const apiKey = resolveApiKey(provider, req.apiKeys);
    const tocMaxTokens = calcTocMaxTokens(inputText.length);

    sseSend({ type: 'progress', message: `🤖 AI가 목차를 분석하고 있습니다... (max_tokens=${tocMaxTokens})` });

    const { tocData, result, truncated } = await generateTocFromText({
      provider, apiKey, model: useModel, content: inputText, maxTokens: tocMaxTokens,
      onProgress: (m) => sseSend({ type: 'progress', message: m }),
    });

    tokenUsage.record({
      userId: req.user?.googleId, userName: req.user?.name,
      userEmail: req.user?.email,
      projectId: req.params.id, action: 'toc',
      provider, model: useModel,
      inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0,
      keySource: req.headers[`x-${provider}-key`] ? 'user' : 'server',
    });

    if (truncated) {
      sseSend({
        type: 'progress',
        message: '⚠️ AI 응답이 max_tokens에 도달해 일부 챕터가 누락되었을 수 있습니다. 목차를 검토 후 필요 시 수동 보완해주세요.',
      });
    }

    sseSend({ type: 'progress', message: `✅ 목차 분석 완료: ${tocData.parts?.length || 0}개 Part` });

    const tg = new TOCGenerator(projPath);
    await tg.saveToc(tocData);
    await tg.generateOutlines(tocData);

    const pm = new ProgressManager(projPath);
    await pm.markStep1Completed();
    await pm.markStep2Completed();
    await pm.markStep3Confirmed();
    await writeFile(join(projPath, 'toc_confirmed.txt'), 'confirmed', 'utf-8');

    sseSend({ type: 'progress', message: '✅ 목차 저장 및 아웃라인 생성 완료!' });
    sseSend({ type: 'progress', message: '✅ Step 1~3 자동 완료 처리됨 → 바로 챕터 제작 가능!' });
    sseSend({ type: 'toc', toc: tocData });
    sseSend({ type: 'done' });
  } catch (e) {
    sseSend({ type: 'error', message: `분석 실패: ${e.message}` });
  }
  res.end();
}));

// Markdown 목차 → JSON 변환 헬퍼
function parseTocMarkdown(md) {
  const lines = md.split('\n');
  const toc = {
    title: '',
    description: '',
    target_audience: '',
    total_hours: '',
    parts: [],
  };

  let currentPart = null;
  let chapterNum = 0;
  let foundFirstH1 = false;

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/);
    const chapterMatch = line.match(/^##\s+(?:Chapter\s*\d*\.?\s*)?(.+)/i);
    const metaMatch = line.match(/^-\s*(예상\s*시간|학습\s*목표|목표|대상|설명):\s*(.+)/i);

    if (h1Match) {
      const text = h1Match[1].trim();
      // "Part"로 시작하는 H1만 Part로 인식, 그 외 첫 H1은 제목
      const isPartH1 = /^Part\s*\d/i.test(text);

      if (!foundFirstH1 && !isPartH1) {
        // 첫 번째 H1이면서 Part가 아니면 → 교재 제목으로 처리
        toc.title = text;
        foundFirstH1 = true;
      } else {
        // Part H1 또는 두 번째 이후 H1 → Part로 처리
        foundFirstH1 = true;
        const partTitle = text.replace(/^Part\s*\d*\.?\s*/i, '').trim();
        currentPart = {
          part_number: toc.parts.length + 1,
          part_title: partTitle || text,
          part_summary: '',
          chapters: [],
        };
        toc.parts.push(currentPart);
      }
    } else if (chapterMatch && currentPart) {
      chapterNum++;
      const chapterId = `chapter${String(chapterNum).padStart(2, '0')}`;
      currentPart.chapters.push({
        chapter_id: chapterId,
        chapter_number: chapterNum,
        chapter_title: chapterMatch[1].trim(),
        estimated_time: '',
        learning_objectives: [],
        key_topics: [],
      });
    } else if (metaMatch) {
      const key = metaMatch[1].trim().toLowerCase();
      const value = metaMatch[2].trim();
      if (key.includes('대상')) {
        toc.target_audience = value;
      } else if (key === '설명') {
        toc.description = value;
      } else if (currentPart && currentPart.chapters.length > 0) {
        const lastChapter = currentPart.chapters[currentPart.chapters.length - 1];
        if (key.includes('시간')) {
          lastChapter.estimated_time = value;
        } else if (key.includes('목표')) {
          lastChapter.learning_objectives.push(value);
        }
      }
    }
  }

  return toc;
}

export default router;
