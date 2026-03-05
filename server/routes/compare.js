import { Router } from 'express';
import { requireApiKey } from '../middleware/apiKey.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { streamChat, detectProvider, resolveApiKey } from '../services/aiProvider.js';

const router = Router();

/**
 * POST /api/compare
 * 여러 모델에 동일한 프롬프트를 보내고 결과를 SSE로 스트리밍
 * body: { models: ["claude-sonnet-4-6", "gpt-5.1"], prompt: "...", systemPrompt?: "..." }
 */
router.post('/', requireApiKey, asyncHandler(async (req, res) => {
  const { models, prompt, systemPrompt } = req.body;

  if (!models || !Array.isArray(models) || models.length < 2) {
    return res.status(400).json({ message: '2개 이상의 모델을 선택해주세요.' });
  }
  if (models.length > 20) {
    return res.status(400).json({ message: '최대 20개 모델까지 비교할 수 있습니다.' });
  }
  if (!prompt?.trim()) {
    return res.status(400).json({ message: '프롬프트를 입력해주세요.' });
  }

  // SSE 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const messages = [{ role: 'user', content: prompt }];

  // 각 모델을 병렬로 실행
  const promises = models.map(async (modelId) => {
    const provider = detectProvider(modelId);
    const apiKey = resolveApiKey(provider, req.apiKeys);

    if (!apiKey) {
      send({ type: 'error', modelId, message: `${provider} API 키가 설정되지 않았습니다.` });
      return;
    }

    send({ type: 'start', modelId });
    const startTime = Date.now();
    let fullText = '';

    try {
      await streamChat({
        provider,
        model: modelId,
        messages,
        system: systemPrompt || '교육 콘텐츠 전문가로서 명확하고 구조화된 답변을 해주세요.',
        apiKey,
        maxTokens: 2048,
        onText: (chunk) => {
          fullText += chunk;
          send({ type: 'text', modelId, content: chunk });
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      send({
        type: 'complete',
        modelId,
        elapsed,
        charCount: fullText.length,
      });
    } catch (err) {
      send({ type: 'error', modelId, message: err.message });
    }
  });

  await Promise.allSettled(promises);
  send({ type: 'done' });
  res.write('data: [DONE]\n\n');
  res.end();
}));

/**
 * POST /api/compare/judge
 * Claude Sonnet 4.6이 여러 모델의 응답을 평가
 * body: { outputs: [{label, text}], prompt: "..." }
 * returns: { rankings: [{label, rank, score, reasoning}] }
 */
router.post('/judge', requireApiKey, asyncHandler(async (req, res) => {
  const { outputs, prompt } = req.body;

  if (!outputs || !Array.isArray(outputs) || outputs.length < 2) {
    return res.status(400).json({ message: '2개 이상의 응답이 필요합니다.' });
  }

  const anthropicKey = req.apiKeys?.anthropic;
  if (!anthropicKey) {
    return res.status(400).json({ message: 'AI 심사를 위해 Anthropic API 키가 필요합니다.' });
  }

  const outputsText = outputs.map((o) =>
    `=== ${o.label} ===\n${o.text}\n`
  ).join('\n');

  const judgePrompt = `당신은 교육 콘텐츠 품질 심사위원입니다. 아래 프롬프트에 대해 여러 AI 모델이 생성한 응답을 평가해주세요.

## 원본 프롬프트
${prompt}

## 모델별 응답
${outputsText}

## 평가 기준
1. 정확성 - 내용의 정확도와 신뢰성
2. 구조성 - 논리적 구조와 가독성
3. 교육적 가치 - 학습자에게 얼마나 유용한가
4. 한국어 품질 - 자연스럽고 명확한 한국어 표현
5. 창의성 - 독창적이고 흥미로운 접근

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.
{
  "rankings": [
    { "label": "응답 A", "rank": 1, "score": 95, "reasoning": "평가 이유 1-2문장" },
    { "label": "응답 B", "rank": 2, "score": 82, "reasoning": "평가 이유 1-2문장" }
  ],
  "summary": "전체 평가 요약 2-3문장"
}`;

  try {
    let fullText = '';
    await streamChat({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: judgePrompt }],
      system: '당신은 교육 콘텐츠 품질 평가 전문가입니다. 반드시 요청된 JSON 형식으로만 응답하세요.',
      apiKey: anthropicKey,
      maxTokens: 4096,
      onText: (chunk) => { fullText += chunk; },
    });

    // JSON 파싱 시도
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      res.json(parsed);
    } else {
      res.status(500).json({ message: 'AI 심사 결과를 파싱할 수 없습니다.', raw: fullText });
    }
  } catch (err) {
    res.status(500).json({ message: `AI 심사 오류: ${err.message}` });
  }
}));

export default router;