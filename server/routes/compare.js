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
    const apiKey = resolveApiKey(req.apiKeys, provider);

    if (!apiKey) {
      send({ type: 'error', modelId, message: `${provider} API 키가 설정되지 않았습니다.` });
      return;
    }

    send({ type: 'start', modelId });
    const startTime = Date.now();
    let fullText = '';

    try {
      await streamChat({
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

export default router;