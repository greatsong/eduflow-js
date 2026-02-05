import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '..', 'model_config.json');

let cachedConfig = null;
let cachedAt = 0;
const CACHE_TTL = 60_000; // 60초 캐시

/**
 * model_config.json 로드 (60초 캐시)
 */
export async function loadModelConfig() {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL) {
    return cachedConfig;
  }

  const raw = await readFile(CONFIG_PATH, 'utf-8');
  cachedConfig = JSON.parse(raw);
  cachedAt = now;
  return cachedConfig;
}

/**
 * 모델 ID 목록
 */
export async function getModelIds() {
  const config = await loadModelConfig();
  return config.models.map((m) => m.id);
}

/**
 * 모델 표시 옵션 (UI 드롭다운용)
 */
export async function getModelDisplayOptions() {
  const config = await loadModelConfig();
  return config.models.map((m) => ({
    id: m.id,
    label: `${m.display_name} (${m.tier})`,
    pricing: m.pricing,
    recommendedFor: m.recommended_for,
  }));
}

/**
 * 용도별 기본 모델 ID
 * @param {'chapter_generation' | 'conversation'} purpose
 */
export async function getDefaultModel(purpose) {
  const config = await loadModelConfig();
  return config.defaults[purpose] || config.models[0].id;
}

/**
 * 모델별 가격 정보
 */
export async function getModelPricing() {
  const config = await loadModelConfig();
  const pricing = {};
  for (const m of config.models) {
    pricing[m.id] = m.pricing;
  }
  return pricing;
}
