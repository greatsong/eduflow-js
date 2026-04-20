/**
 * 멀티 AI 프로바이더 추상화 레이어
 *
 * 지원 프로바이더:
 * - anthropic: Anthropic Claude (@anthropic-ai/sdk)
 * - openai: OpenAI GPT (openai)
 * - google: Google Gemini (@google/genai)
 * - upstage: Upstage Solar (openai SDK, base URL 변경)
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { acquire, release } from './rateLimiter.js';

// 프로바이더별 기본 API 키 환경변수 매핑
const ENV_KEY_MAP = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  upstage: 'UPSTAGE_API_KEY',
};

/**
 * 모델 ID로부터 프로바이더를 추론
 */
export function detectProvider(modelId) {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) return 'openai';
  if (modelId.startsWith('gemini-')) return 'google';
  if (modelId.startsWith('solar-')) return 'upstage';
  return 'anthropic'; // 기본값
}

/**
 * 프로바이더에 맞는 API 키를 결정
 * 1. 명시적으로 전달된 키 (프로바이더별)
 * 2. 환경변수
 */
export function resolveApiKey(provider, keys = {}) {
  // 프로바이더별 키가 있으면 우선
  if (keys[provider]) return keys[provider];
  // 범용 키 (헤더에서 온 것)
  if (keys._default) return keys._default;
  // 환경변수
  return process.env[ENV_KEY_MAP[provider]] || '';
}

/**
 * 비스트리밍 채팅 요청
 * @returns {{ content: string, inputTokens: number, outputTokens: number, stopReason: string }}
 */
export async function chat({ provider, apiKey, model, messages, system, maxTokens = 2048 }) {
  await acquire(provider);
  try {
    let result;
    switch (provider) {
      case 'anthropic':
        result = await _anthropicChat({ apiKey, model, messages, system, maxTokens }); break;
      case 'openai':
        result = await _openaiChat({ apiKey, model, messages, system, maxTokens, baseURL: undefined }); break;
      case 'google':
        result = await _googleChat({ apiKey, model, messages, system, maxTokens }); break;
      case 'upstage':
        result = await _openaiChat({ apiKey, model, messages, system, maxTokens, baseURL: 'https://api.upstage.ai/v1/solar' }); break;
      default:
        throw new Error(`지원하지 않는 프로바이더: ${provider}`);
    }
    return result;
  } finally {
    release(provider);
  }
}

/**
 * 스트리밍 채팅 — SSE res 객체에 직접 쓰기
 * @param {object} opts
 * @param {object} opts.res - Express response (SSE 모드)
 * @param {function} opts.onText - 텍스트 청크 콜백 (res 없을 때)
 * @returns {{ content: string, inputTokens: number, outputTokens: number, stopReason: string }}
 */
export async function streamChat({ provider, apiKey, model, messages, system, maxTokens = 2048, res = null, onText = null }) {
  await acquire(provider);
  try {
    let result;
    switch (provider) {
      case 'anthropic':
        result = await _anthropicStream({ apiKey, model, messages, system, maxTokens, res, onText }); break;
      case 'openai':
        result = await _openaiStream({ apiKey, model, messages, system, maxTokens, res, onText, baseURL: undefined }); break;
      case 'google':
        result = await _googleStream({ apiKey, model, messages, system, maxTokens, res, onText }); break;
      case 'upstage':
        result = await _openaiStream({ apiKey, model, messages, system, maxTokens, res, onText, baseURL: 'https://api.upstage.ai/v1/solar' }); break;
      default:
        throw new Error(`지원하지 않는 프로바이더: ${provider}`);
    }
    return result;
  } finally {
    release(provider);
  }
}

/**
 * Anthropic 메시지 스트리밍 (기존 방식과 동일한 stream 객체 반환)
 * chapterGenerator 등에서 stream 객체가 필요할 때 사용
 */
export function createAnthropicStream({ apiKey, model, messages, system, maxTokens, timeout }) {
  const client = new Anthropic({ apiKey, timeout });
  const opts = { model, max_tokens: maxTokens, messages };
  if (system) opts.system = system;
  return client.messages.stream(opts);
}

// ============================================================
// Anthropic
// ============================================================

async function _anthropicChat({ apiKey, model, messages, system, maxTokens }) {
  const client = new Anthropic({ apiKey });
  const opts = { model, max_tokens: maxTokens, messages };
  if (system) opts.system = system;

  const response = await client.messages.create(opts);
  return {
    content: response.content[0].text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason: response.stop_reason,
  };
}

async function _anthropicStream({ apiKey, model, messages, system, maxTokens, res, onText }) {
  const client = new Anthropic({ apiKey });
  const opts = { model, max_tokens: maxTokens, messages };
  if (system) opts.system = system;

  const stream = client.messages.stream(opts);
  let content = '';

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.text) {
      content += event.delta.text;
      if (res) res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
      if (onText) onText(event.delta.text);
    }
  }

  const finalMessage = await stream.finalMessage();
  return {
    content,
    inputTokens: finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
    stopReason: finalMessage.stop_reason,
  };
}

// ============================================================
// OpenAI (+ Upstage Solar via baseURL)
// ============================================================

function _buildOpenAIMessages(messages, system) {
  const result = [];
  if (system) result.push({ role: 'system', content: system });
  for (const m of messages) {
    result.push({ role: m.role, content: m.content });
  }
  return result;
}

async function _openaiChat({ apiKey, model, messages, system, maxTokens, baseURL }) {
  const client = new OpenAI({ apiKey, ...(baseURL && { baseURL }) });
  const response = await client.chat.completions.create({
    model,
    messages: _buildOpenAIMessages(messages, system),
    max_completion_tokens: maxTokens,
  });

  const choice = response.choices[0];
  return {
    content: choice.message.content,
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    stopReason: choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
  };
}

async function _openaiStream({ apiKey, model, messages, system, maxTokens, res, onText, baseURL }) {
  const client = new OpenAI({ apiKey, ...(baseURL && { baseURL }) });
  const stream = await client.chat.completions.create({
    model,
    messages: _buildOpenAIMessages(messages, system),
    max_completion_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  });

  let content = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = 'end_turn';

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) {
      content += delta.content;
      if (res) res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n\n`);
      if (onText) onText(delta.content);
    }
    if (chunk.choices?.[0]?.finish_reason === 'length') {
      stopReason = 'max_tokens';
    }
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens || 0;
      outputTokens = chunk.usage.completion_tokens || 0;
    }
  }

  // stream_options 미지원 프로바이더용 토큰 추정
  if (inputTokens === 0 && outputTokens === 0) {
    outputTokens = Math.ceil(content.length / 3);
  }

  return { content, inputTokens, outputTokens, stopReason };
}

// ============================================================
// Google Gemini
// ============================================================

function _buildGeminiMessages(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

async function _googleChat({ apiKey, model, messages, system, maxTokens }) {
  const ai = new GoogleGenAI({ apiKey });
  const config = { maxOutputTokens: maxTokens };
  if (system) config.systemInstruction = system;

  const response = await ai.models.generateContent({
    model,
    contents: _buildGeminiMessages(messages),
    config,
  });

  const text = response.text || '';
  return {
    content: text,
    inputTokens: response.usageMetadata?.promptTokenCount || 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    stopReason: response.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
  };
}

async function _googleStream({ apiKey, model, messages, system, maxTokens, res, onText }) {
  const ai = new GoogleGenAI({ apiKey });
  const config = { maxOutputTokens: maxTokens };
  if (system) config.systemInstruction = system;

  const response = await ai.models.generateContentStream({
    model,
    contents: _buildGeminiMessages(messages),
    config,
  });

  let content = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = 'end_turn';

  for await (const chunk of response) {
    const text = chunk.text || '';
    if (text) {
      content += text;
      if (res) res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
      if (onText) onText(text);
    }
    if (chunk.usageMetadata) {
      inputTokens = chunk.usageMetadata.promptTokenCount || 0;
      outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
    }
    if (chunk.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    }
  }

  return { content, inputTokens, outputTokens, stopReason };
}