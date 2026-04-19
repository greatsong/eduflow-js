import { Router } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { chat, detectProvider, resolveApiKey } from '../services/aiProvider.js';
import { TOCGenerator } from '../services/tocGenerator.js';
import { ReferenceManager } from '../services/referenceManager.js';
import { ConversationManager } from '../services/conversationManager.js';
import { ProgressManager } from '../services/progressManager.js';
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
router.post('/generate', requireApiKey,  asyncHandler(async (req, res) => {
  const { model, maxTokens } = req.body;
  const projPath = projectPath(req.params.id);

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

    // BUG-013: 목차 생성 전 API 키 검증
    const useGenModel = model || 'claude-opus-4-7';
    const genProvider = detectProvider(useGenModel);
    const genApiKey = resolveApiKey(genProvider, req.apiKeys);
    if (!genApiKey) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `${genProvider} API 키가 설정되지 않았습니다. 설정에서 API 키를 확인해주세요.` })}\n\n`);
      res.end();
      return;
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
router.post('/parse-md', requireApiKey,  asyncHandler(async (req, res) => {
  const { content, model, saveAsReference } = req.body;
  if (!content) {
    return res.status(400).json({ message: 'content가 필요합니다' });
  }

  const projPath = projectPath(req.params.id);

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sseSend = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sseSend({ type: 'progress', message: '📄 MD 파일 분석 중...' });

    // 참고자료로도 저장 (옵션)
    if (saveAsReference) {
      const refManager = new ReferenceManager(projPath);
      const refFileName = `uploaded-${Date.now()}.md`;
      const refsDir = join(projPath, 'references');
      const { mkdir } = await import('fs/promises');
      if (!existsSync(refsDir)) await mkdir(refsDir, { recursive: true });
      await writeFile(join(refsDir, refFileName), content, 'utf-8');
      sseSend({ type: 'progress', message: `📚 참고자료로 저장: ${refFileName}` });
    }

    // AI API로 MD → JSON TOC 변환 (멀티 프로바이더)
    const useModel = model || 'claude-sonnet-4-6';
    const provider = detectProvider(useModel);
    const apiKey = resolveApiKey(provider, req.apiKeys);

    sseSend({ type: 'progress', message: '🤖 AI가 목차를 분석하고 있습니다...' });

    const result = await chat({
      provider, apiKey, model: useModel,
      maxTokens: 4096,
      messages: [{ role: 'user', content: `다음 마크다운 교육자료를 분석하여 목차(Table of Contents)를 JSON 형식으로 추출해주세요.

## 입력 내용
${content.slice(0, 50000)}

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
- 마크다운의 구조(# 제목, ## 소제목 등)를 기반으로 Part와 Chapter를 나누세요
- chapter_id는 chapter01, chapter02 형식으로 순차 할당하세요
- estimated_time은 내용량에 따라 20분~90분 사이로 추정하세요
- 반드시 유효한 JSON만 출력하세요 (설명 텍스트 없이 JSON 코드블록만)` }],
    });

    // BUG-013: AI 호출 결과 검증
    if (!result || !result.content) {
      sseSend({ type: 'error', message: 'AI 응답이 비어 있습니다. 잠시 후 다시 시도해주세요.' });
      res.end();
      return;
    }

    const responseText = result.content;

    // 토큰 사용량 기록
    tokenUsage.record({
      userId: req.user?.googleId, userName: req.user?.name,
      userEmail: req.user?.email,
      projectId: req.params.id, action: 'toc',
      provider, model: useModel,
      inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0,
      keySource: req.headers[`x-${provider}-key`] ? 'user' : 'server',
    });

    // JSON 추출 — 파싱 실패 방어 (BUG-013)
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/) || responseText.match(/\{[\s\S]*\}/);
    let tocData;

    try {
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        tocData = JSON.parse(jsonStr);
      } else {
        tocData = JSON.parse(responseText);
      }
    } catch (parseErr) {
      console.error('[toc/parse-md] JSON 파싱 실패:', parseErr.message);
      sseSend({ type: 'error', message: 'AI 응답에서 유효한 JSON을 추출할 수 없습니다. 다시 시도해주세요.' });
      res.end();
      return;
    }

    sseSend({ type: 'progress', message: `✅ 목차 분석 완료: ${tocData.parts?.length || 0}개 Part` });

    // 저장
    const tg = new TOCGenerator(projPath);
    await tg.saveToc(tocData);
    await tg.generateOutlines(tocData);

    // progress 업데이트 (Step 1, 2, 3 모두 완료 처리)
    const pm = new ProgressManager(projPath);
    await pm.markStep1Completed();
    await pm.markStep2Completed();
    await pm.markStep3Confirmed();

    // toc_confirmed.txt 생성
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
