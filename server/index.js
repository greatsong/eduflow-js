import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import modelsRouter from './routes/models.js';
import projectsRouter from './routes/projects.js';
import discussionsRouter from './routes/discussions.js';
import tocRouter from './routes/toc.js';
import chaptersRouter from './routes/chapters.js';
import deployRouter from './routes/deploy.js';
import portfolioRouter from './routes/portfolio.js';
import betaRouter from './routes/beta.js';
import { errorHandler } from './middleware/errorHandler.js';

config(); // .env 로드

const app = express();
const PORT = process.env.PORT || 3001;

// 미들웨어
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
}));
app.use(express.json({ limit: '10mb' }));

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 라우트
app.use('/api/models', modelsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:id/discussions', discussionsRouter);
app.use('/api/projects/:id/toc', tocRouter);
app.use('/api/projects/:id/chapters', chaptersRouter);
app.use('/api/projects/:id/deploy', deployRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/beta', betaRouter);

// 에러 핸들링
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[EduFlow] 서버 실행 중: http://localhost:${PORT}`);
  console.log(`[EduFlow] 프로젝트 디렉토리: ${process.env.PROJECTS_DIR || './projects'}`);
});
