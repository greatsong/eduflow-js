import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import modelsRouter from './routes/models.js';
import projectsRouter from './routes/projects.js';
import discussionsRouter from './routes/discussions.js';
import tocRouter from './routes/toc.js';
import chaptersRouter from './routes/chapters.js';
import deployRouter from './routes/deploy.js';
import portfolioRouter from './routes/portfolio.js';
import betaRouter from './routes/beta.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') }); // 루트 .env 로드

const app = express();
const PORT = process.env.PORT || 7829;

// 미들웨어
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:7830',
}));
app.use(express.json({ limit: '10mb' }));

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 키 상태 확인 (서버 .env에 키가 있는지)
app.get('/api/auth/status', (req, res) => {
  const hasEnvKey = !!process.env.ANTHROPIC_API_KEY;
  res.json({ hasEnvKey });
});

// API 키 검증 (클라이언트에서 보낸 키가 유효한지 Anthropic에 확인)
app.post('/api/auth/verify', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.body.apiKey;
  if (!apiKey) {
    return res.status(400).json({ valid: false, message: 'API 키가 제공되지 않았습니다.' });
  }
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });
    res.json({ valid: true });
  } catch (e) {
    const msg = e.status === 401 ? '유효하지 않은 API 키입니다.' : `검증 실패: ${e.message}`;
    res.json({ valid: false, message: msg });
  }
});

// 라우트
app.use('/api/models', modelsRouter);

// 더 구체적인 프로젝트 서브라우트를 먼저 등록
app.use('/api/projects/:id/discussions', discussionsRouter);
app.use('/api/projects/:id/toc', tocRouter);
app.use('/api/projects/:id/chapters', chaptersRouter);
app.use('/api/projects/:id/deploy', deployRouter);

// 기본 프로젝트 라우트 (context, template-info, references 등 포함)
app.use('/api/projects', projectsRouter);

app.use('/api/portfolio', portfolioRouter);
app.use('/api/beta', betaRouter);

// 에러 핸들링
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[EduFlow] 서버 실행 중: http://localhost:${PORT}`);
  console.log(`[EduFlow] 프로젝트 디렉토리: ${process.env.PROJECTS_DIR || './projects'}`);
});
