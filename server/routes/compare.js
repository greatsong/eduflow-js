import { Router } from 'express';
import { requireApiKey } from '../middleware/apiKey.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { streamChat, chat, detectProvider, resolveApiKey } from '../services/aiProvider.js';

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
 * POST /api/compare/auto-evaluate
 * AI 심사위원(judge)이 각 모델의 응답을 평가하고 순위를 매김
 * body: { models: [...], prompt: "...", judgeModel: "claude-sonnet-4-6" }
 * SSE: generate → evaluate → rank
 */
router.post('/auto-evaluate', requireApiKey, asyncHandler(async (req, res) => {
  const { models, prompt, judgeModel = 'claude-sonnet-4-6' } = req.body;

  if (!models || !Array.isArray(models) || models.length < 2) {
    return res.status(400).json({ message: '2개 이상의 모델을 선택해주세요.' });
  }
  if (!prompt?.trim()) {
    return res.status(400).json({ message: '프롬프트를 입력해주세요.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Phase 1: 각 모델에 프롬프트 전송
  send({ type: 'phase', phase: 'generating', message: '각 모델에 프롬프트를 전송 중...' });

  const responses = {};
  const messages = [{ role: 'user', content: prompt }];

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
        system: '교육 콘텐츠 전문가로서 명확하고 구조화된 답변을 해주세요.',
        apiKey,
        maxTokens: 2048,
        onText: (chunk) => {
          fullText += chunk;
          send({ type: 'text', modelId, content: chunk });
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      responses[modelId] = fullText;
      send({ type: 'complete', modelId, elapsed, charCount: fullText.length });
    } catch (err) {
      send({ type: 'error', modelId, message: err.message });
    }
  });

  await Promise.allSettled(promises);

  // Phase 2: AI 심사위원이 평가
  const validModels = Object.keys(responses).filter((id) => responses[id]?.length > 0);
  if (validModels.length < 2) {
    send({ type: 'evaluate-error', message: '평가할 수 있는 응답이 2개 미만입니다.' });
    send({ type: 'done' });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  send({ type: 'phase', phase: 'evaluating', message: `${judgeModel}이 응답을 평가 중...` });

  const judgeProvider = detectProvider(judgeModel);
  const judgeApiKey = resolveApiKey(judgeProvider, req.apiKeys);

  if (!judgeApiKey) {
    send({ type: 'evaluate-error', message: `심사위원 모델(${judgeModel})의 API 키가 없습니다.` });
    send({ type: 'done' });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // 익명 라벨로 변환 (편향 방지)
  const labels = 'ABCDEFGHIJKLMNOPQRST'.split('');
  const labelMap = {};
  const reverseLabelMap = {};
  validModels.forEach((id, i) => {
    labelMap[id] = labels[i];
    reverseLabelMap[labels[i]] = id;
  });

  const responsesText = validModels.map((id) =>
    `--- 응답 ${labelMap[id]} ---\n${responses[id].slice(0, 3000)}\n`
  ).join('\n');

  const evaluatePrompt = `당신은 교육 콘텐츠 평가 전문가입니다. 아래 프롬프트에 대한 ${validModels.length}개의 익명 응답을 평가해주세요.

[프롬프트]
${prompt}

[응답들]
${responsesText}

다음 기준으로 각 응답을 1~10점으로 평가하고, 종합 순위를 매겨주세요:
1. 정확성 (내용의 정확도)
2. 구조화 (논리적 구성, 가독성)
3. 교육적 가치 (학습에 도움이 되는 정도)
4. 한국어 품질 (자연스럽고 명확한 표현)
5. 창의성 (독창적 접근, 예시의 적절성)

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "evaluations": {
    "A": { "accuracy": 8, "structure": 7, "educational": 9, "korean": 8, "creativity": 7, "total": 39, "comment": "간단한 평가 코멘트" },
    "B": { ... }
  },
  "ranking": ["A", "B", "C"],
  "summary": "전체 평가 요약 (2-3문장)"
}`;

  let evaluateText = '';
  try {
    await streamChat({
      provider: judgeProvider,
      model: judgeModel,
      messages: [{ role: 'user', content: evaluatePrompt }],
      system: '교육 콘텐츠 평가 전문가. JSON 형식으로만 응답하세요.',
      apiKey: judgeApiKey,
      maxTokens: 4096,
      onText: (chunk) => {
        evaluateText += chunk;
        send({ type: 'evaluate-text', content: chunk });
      },
    });

    // JSON 파싱 시도
    const jsonMatch = evaluateText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const evaluation = JSON.parse(jsonMatch[0]);

      // 라벨을 실제 모델 ID로 변환
      const result = {
        evaluations: {},
        ranking: [],
        summary: evaluation.summary || '',
      };

      if (evaluation.evaluations) {
        for (const [label, scores] of Object.entries(evaluation.evaluations)) {
          const modelId = reverseLabelMap[label];
          if (modelId) result.evaluations[modelId] = scores;
        }
      }

      if (evaluation.ranking) {
        result.ranking = evaluation.ranking
          .map((label) => reverseLabelMap[label])
          .filter(Boolean);
      }

      send({ type: 'evaluate-result', result, judgeModel });
    } else {
      send({ type: 'evaluate-error', message: 'AI 평가 결과를 파싱할 수 없습니다.' });
    }
  } catch (err) {
    send({ type: 'evaluate-error', message: `평가 중 오류: ${err.message}` });
  }

  send({ type: 'done' });
  res.write('data: [DONE]\n\n');
  res.end();
}));

export default router;