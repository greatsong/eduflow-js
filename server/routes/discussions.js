import { Router } from 'express';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { ConversationManager } from '../services/conversationManager.js';
import { ReferenceManager } from '../services/referenceManager.js';
import { ProgressManager } from '../services/progressManager.js';
import { TOCGenerator } from '../services/tocGenerator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');

const router = Router({ mergeParams: true }); // mergeParams로 :id 접근

function projectPath(id) {
  return join(PROJECTS_DIR, id);
}

// GET /api/projects/:id/discussions/:step - 대화 로드
router.get('/:step', asyncHandler(async (req, res) => {
  const cm = new ConversationManager(projectPath(req.params.id));
  const messages = await cm.loadConversation(req.params.step);
  res.json({ messages });
}));

// POST /api/projects/:id/discussions/:step/messages - 메시지 저장
router.post('/:step/messages', asyncHandler(async (req, res) => {
  const { role, content } = req.body;
  if (!role || !content) {
    return res.status(400).json({ message: 'role과 content가 필요합니다' });
  }
  const cm = new ConversationManager(projectPath(req.params.id));
  await cm.saveMessage(req.params.step, role, content);
  res.json({ success: true });
}));

// DELETE /api/projects/:id/discussions/:step - 대화 초기화
router.delete('/:step', asyncHandler(async (req, res) => {
  const cm = new ConversationManager(projectPath(req.params.id));
  await cm.clearConversation(req.params.step);
  res.json({ success: true });
}));

// GET /api/projects/:id/discussions/:step/summary - 요약 조회
router.get('/:step/summary', asyncHandler(async (req, res) => {
  const cm = new ConversationManager(projectPath(req.params.id));
  const summary = await cm.loadSummary(req.params.step);
  res.json({ summary });
}));

// POST /api/projects/:id/discussions/:step/summarize - 요약 생성 (SSE)
router.post('/:step/summarize', requireApiKey, asyncHandler(async (req, res) => {
  const { model } = req.body;
  const projPath = projectPath(req.params.id);
  const step = req.params.step;

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const cm = new ConversationManager(projPath, req.apiKey);
    await cm.summarizeConversation(step, model || 'claude-sonnet-4-20250514', res);

    // Step 1이면 진행 상태 업데이트
    if (step === '1') {
      const pm = new ProgressManager(projPath);
      await pm.markStep1Completed();
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
  }

  res.end();
}));

// POST /api/projects/:id/discussions/:step/chat - 스트리밍 채팅 (SSE)
router.post('/:step/chat', requireApiKey, asyncHandler(async (req, res) => {
  const { message, model, messages: clientMessages } = req.body;
  const projPath = projectPath(req.params.id);
  const step = req.params.step;

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const cm = new ConversationManager(projPath, req.apiKey);

    // 사용자 메시지 저장
    await cm.saveMessage(step, 'user', message);

    // 프로젝트 정보 로드
    let projectInfoText = '';
    const configFile = join(projPath, 'config.json');
    if (existsSync(configFile)) {
      const config = JSON.parse(await readFile(configFile, 'utf-8'));
      projectInfoText = `
# 프로젝트 기본 정보
- 프로젝트 제목: ${config.title || ''}
- 작성자: ${config.author || ''}
- 설명: ${config.description || ''}`;
    }

    // master-context.md 로드
    let masterContextText = '';
    const mcFile = join(projPath, 'master-context.md');
    if (existsSync(mcFile)) {
      const mcContent = (await readFile(mcFile, 'utf-8')).trim();
      if (mcContent) {
        masterContextText = `\n\n# 기존 논의/컨텍스트\n\n${mcContent}`;
      }
    }

    // 참고자료 로드
    let referencesText = '';
    const refManager = new ReferenceManager(projPath);
    const refs = await refManager.listFiles();
    if (refs.length > 0) {
      const refContents = [];
      for (const ref of refs) {
        const content = await refManager.readFile(ref.name);
        if (content) refContents.push(`[${ref.name}]\n${content}`);
      }
      if (refContents.length) {
        referencesText = '\n\n# 업로드된 참고자료\n\n' + refContents.join('\n\n---\n\n');
      }
    }

    // 시스템 프롬프트 (단계별 분기)
    let systemPrompt;

    if (step === '3') {
      // Step 3: 피드백 & 컨펌 - TOC 검토 전용 프롬프트
      let tocJsonText = '';
      const tg = new TOCGenerator(projPath);
      const tocData = await tg.loadToc();
      if (tocData) {
        tocJsonText = JSON.stringify(tocData, null, 2);
      }

      systemPrompt = `당신은 교육 커리큘럼 검토 전문가입니다.

사용자가 생성한 교육자료 목차를 함께 검토하고 개선하고 있습니다.

# 현재 목차

\`\`\`json
${tocJsonText}
\`\`\`

# 역할

1. 목차의 장단점을 분석하고 피드백 제공
2. 사용자의 수정 요청을 구체적인 JSON 수정안으로 제시
3. 전체 흐름, 난이도 순서, 학습 경험 관점에서 조언

# 피드백 원칙

- 구체적이고 실행 가능한 조언
- 긍정적인 부분도 함께 언급
- 수정이 필요하면 구체적인 JSON 수정안 제시
- 사용자의 의도를 존중하며 제안

친근하고 격려하는 톤으로 대화하세요.`;
    } else {
      // Step 1: 방향성 논의 프롬프트 (기본)
      systemPrompt = `당신은 교육 커리큘럼 설계 전문가입니다.

## 현재 단계: 방향성 논의 (Step ${step})
이 단계의 목표는 사용자가 만들고자 하는 교육자료의 **방향성**을 함께 논의하는 것입니다.

## 중요 원칙
⚠️ **절대 금지사항**: 이 단계에서는 교육자료(챕터 내용, 코드 예시, 상세 커리큘럼)를 직접 작성하지 마세요.
- 여기서는 오직 **질문과 대화**를 통해 방향성을 명확히 하는 것이 목표입니다.
${projectInfoText}
${masterContextText}

## 파악해야 할 사항
1. 교육자료의 목적과 목표
2. 대상 학습자 (연령, 배경 지식 수준)
3. 다룰 주제와 범위
4. 교육 방식과 접근법
5. 강조할 핵심 개념
${referencesText}

## 대화 방식
- 이미 프로젝트 정보나 기존 컨텍스트가 있다면, 그 내용을 바탕으로 대화를 이어가세요
- 질문을 던지며 사용자의 생각을 구체화하도록 도와주세요
- 친근하고 격려하는 톤으로 대화하세요
- 사용자의 아이디어를 정리해서 확인해주세요
- 충분히 논의되면 "논의 내용 요약하기" 버튼을 누르도록 안내해주세요`;
    }

    // 대화 히스토리 구성
    const allMessages = clientMessages || await cm.loadConversation(step);

    // Claude 스트리밍 호출
    const client = new Anthropic({ apiKey: req.apiKey });
    const stream = client.messages.stream({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: allMessages,
    });

    let fullResponse = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
      }
    }

    // 어시스턴트 응답 저장
    await cm.saveMessage(step, 'assistant', fullResponse);

    res.write(`data: ${JSON.stringify({ type: 'done', content: fullResponse })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
  }

  res.end();
}));

export default router;
