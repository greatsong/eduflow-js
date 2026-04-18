import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getModelDisplayOptions,
  getDefaultModel,
  getModelPricing,
  getProviders,
} from '../config/modelConfig.js';

const router = Router();

// GET /api/models - 모델 목록 + 가격 + 프로바이더 정보
router.get('/', asyncHandler(async (req, res) => {
  const models = await getModelDisplayOptions();
  const pricing = await getModelPricing();
  const providers = await getProviders();

  // 어떤 프로바이더에 API 키가 설정되어 있는지 표시
  const availableProviders = {};
  for (const [key, info] of Object.entries(providers)) {
    availableProviders[key] = {
      ...info,
      configured: !!process.env[info.envKey],
    };
  }

  // 로컬 버전: 모든 모델 잠금 없음 (관리자 취급)
  res.json({ models, pricing, providers: availableProviders, userTier: 'master' });
}));

// GET /api/models/default/:purpose - 용도별 기본 모델
router.get('/default/:purpose', asyncHandler(async (req, res) => {
  const modelId = await getDefaultModel(req.params.purpose);
  res.json({ modelId });
}));

export default router;
