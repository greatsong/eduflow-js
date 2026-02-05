import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getModelDisplayOptions,
  getDefaultModel,
  getModelPricing,
} from '../config/modelConfig.js';

const router = Router();

// GET /api/models - 모델 목록 + 가격
router.get('/', asyncHandler(async (req, res) => {
  const models = await getModelDisplayOptions();
  const pricing = await getModelPricing();
  res.json({ models, pricing });
}));

// GET /api/models/default/:purpose - 용도별 기본 모델
router.get('/default/:purpose', asyncHandler(async (req, res) => {
  const modelId = await getDefaultModel(req.params.purpose);
  res.json({ modelId });
}));

export default router;
