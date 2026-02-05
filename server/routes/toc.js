import { Router } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { TOCGenerator } from '../services/tocGenerator.js';
import { ReferenceManager } from '../services/referenceManager.js';
import { ConversationManager } from '../services/conversationManager.js';
import { ProgressManager } from '../services/progressManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');

const router = Router({ mergeParams: true });

function projectPath(id) {
  return join(PROJECTS_DIR, id);
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
router.post('/generate', requireApiKey, asyncHandler(async (req, res) => {
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

    // 참고자료 로드
    const refManager = new ReferenceManager(projPath);
    const refs = await refManager.listFiles();
    const referencesContent = [];
    for (const ref of refs) {
      const content = await refManager.readFile(ref.name);
      if (content) referencesContent.push(content);
    }

    // 목차 생성 (SSE 스트리밍)
    const tg = new TOCGenerator(projPath, req.apiKey);
    const tocData = await tg.generate(
      referencesContent,
      directionSummary,
      model || 'claude-opus-4-5-20251101',
      maxTokens || 16384,
      res
    );

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
  await pm.completeStep('step2');

  res.json({ success: true, toc });
}));

// Markdown 목차 → JSON 변환 헬퍼
function parseTocMarkdown(md) {
  const lines = md.split('\n');
  const toc = {
    title: '',
    target_audience: '',
    total_hours: '',
    parts: [],
  };

  let currentPart = null;
  let chapterNum = 0;

  for (const line of lines) {
    const partMatch = line.match(/^#\s+(?:Part\s*\d*\.?\s*)?(.+)/i);
    const chapterMatch = line.match(/^##\s+(?:Chapter\s*\d*\.?\s*)?(.+)/i);
    const metaMatch = line.match(/^-\s*(예상\s*시간|학습\s*목표|목표):\s*(.+)/i);

    if (partMatch) {
      currentPart = {
        part_number: toc.parts.length + 1,
        part_title: partMatch[1].trim(),
        part_summary: '',
        chapters: [],
      };
      toc.parts.push(currentPart);
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
    } else if (metaMatch && currentPart && currentPart.chapters.length > 0) {
      const lastChapter = currentPart.chapters[currentPart.chapters.length - 1];
      const key = metaMatch[1].trim().toLowerCase();
      const value = metaMatch[2].trim();
      if (key.includes('시간')) {
        lastChapter.estimated_time = value;
      } else if (key.includes('목표')) {
        lastChapter.learning_objectives.push(value);
      }
    }
  }

  return toc;
}

export default router;
