import { Router } from 'express';
import { join, dirname } from 'path';
import { readdir, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');

const router = Router();

// 프로젝트 데이터 로드 헬퍼
async function loadProjectData(projectPath, projectName) {
  const data = { name: projectName };

  // config.json
  const configPath = join(projectPath, 'config.json');
  if (!existsSync(configPath)) return null;
  data.config = JSON.parse(await readFile(configPath, 'utf-8'));

  // toc.json
  const tocPath = join(projectPath, 'toc.json');
  if (existsSync(tocPath)) {
    data.toc = JSON.parse(await readFile(tocPath, 'utf-8'));
  }

  // progress.json
  const progressPath = join(projectPath, 'progress.json');
  if (existsSync(progressPath)) {
    data.progress = JSON.parse(await readFile(progressPath, 'utf-8'));
  }

  // generation_report.json
  const reportPath = join(projectPath, 'generation_report.json');
  if (existsSync(reportPath)) {
    data.report = JSON.parse(await readFile(reportPath, 'utf-8'));
  }

  // docs/ 챕터 파일
  const docsPath = join(projectPath, 'docs');
  if (existsSync(docsPath)) {
    const files = await readdir(docsPath);
    const chapterFiles = files.filter(f => f.startsWith('chapter') && f.endsWith('.md')).sort();
    data.chapterFiles = chapterFiles;

    let totalChars = 0;
    for (const f of chapterFiles) {
      const s = await stat(join(docsPath, f));
      totalChars += s.size;
    }
    data.totalChars = totalChars;
  } else {
    data.chapterFiles = [];
    data.totalChars = 0;
  }

  // DOCX 파일 (output/ 또는 프로젝트 루트)
  data.docxFile = null;
  const outputPath = join(projectPath, 'output');
  if (existsSync(outputPath)) {
    const outputFiles = await readdir(outputPath);
    data.docxFile = outputFiles.find(f => f.endsWith('.docx')) || null;
  }
  if (!data.docxFile) {
    const rootFiles = await readdir(projectPath);
    data.docxFile = rootFiles.find(f => f.endsWith('.docx')) || null;
  }

  // site/index.html 존재 확인
  data.hasSite = existsSync(join(projectPath, 'site', 'index.html'));

  return data;
}

// 목차에서 파트/챕터 수 카운트
function countChapters(toc) {
  if (!toc) return { partCount: 0, chapterCount: 0 };
  const parts = toc.parts || [];
  const partCount = parts.length;
  const chapterCount = parts.reduce((sum, p) => sum + (p.chapters || []).length, 0);
  return { partCount, chapterCount };
}

// 진행 상태 판단
function getProgressStatus(progress, toc, chapterFiles) {
  if (!toc) return { completed: 0, total: 0, status: '미시작' };

  const { chapterCount: total } = countChapters(toc);
  if (total === 0) return { completed: 0, total: 0, status: '목차 없음' };

  // progress.json 기준 완료 수
  let progressCompleted = 0;
  if (progress) {
    const chapters = progress.chapters || {};
    progressCompleted = Object.values(chapters).filter(c => c.status === 'completed').length;
  }

  // 실제 파일 기준 완료 수
  let fileCompleted = 0;
  if (chapterFiles && chapterFiles.length > 0) {
    const fileStems = new Set(chapterFiles.map(f => f.replace('.md', '')));
    for (const part of (toc.parts || [])) {
      for (const ch of (part.chapters || [])) {
        if (fileStems.has(ch.chapter_id)) fileCompleted++;
      }
    }
  }

  const completed = Math.max(progressCompleted, fileCompleted);

  if (completed >= total) return { completed, total, status: '완료' };
  if (completed > 0) return { completed, total, status: '진행중' };

  if (!progress) return { completed: 0, total, status: '미시작' };

  if (progress.step2_completed) return { completed: 0, total, status: '목차 완료' };
  if (progress.step1_completed) return { completed: 0, total, status: '방향 설정됨' };

  return { completed: 0, total, status: '미시작' };
}

// 비용 추정
function estimateCost(report) {
  if (!report) return 0;

  const costInfo = report.estimated_cost;
  if (costInfo && typeof costInfo === 'object' && costInfo.total_cost > 0) {
    return costInfo.total_cost;
  }

  const totalTokens = report.total_tokens || 0;
  if (totalTokens <= 0) return 0;

  const model = report.model || '';
  let inputPrice, outputPrice;
  if (model.toLowerCase().includes('opus')) {
    inputPrice = 15.0; outputPrice = 75.0;
  } else {
    inputPrice = 3.0; outputPrice = 15.0;
  }

  const inputTokens = report.total_input_tokens;
  const outputTokens = report.total_output_tokens;

  if (inputTokens && outputTokens) {
    return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
  }

  return (totalTokens * 0.4 / 1_000_000) * inputPrice + (totalTokens * 0.6 / 1_000_000) * outputPrice;
}

// GET /api/portfolio - 전체 프로젝트 통계 + 카드 데이터
router.get('/', asyncHandler(async (req, res) => {
  if (!existsSync(PROJECTS_DIR)) {
    return res.json({ projects: [], stats: { totalProjects: 0, completed: 0, totalChapters: 0, totalPages: 0, totalCost: 0 } });
  }

  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  const projectDirs = entries
    .filter(e => e.isDirectory() && e.name !== 'template')
    .map(e => e.name)
    .sort();

  const projects = [];
  for (const name of projectDirs) {
    const data = await loadProjectData(join(PROJECTS_DIR, name), name);
    if (!data) continue;

    const { partCount, chapterCount } = countChapters(data.toc);
    const progressStatus = getProgressStatus(data.progress, data.toc, data.chapterFiles);
    const cost = estimateCost(data.report);
    const a4Pages = data.totalChars > 0 ? Math.max(1, Math.round(data.totalChars / 1800)) : 0;

    projects.push({
      name: data.name,
      title: data.config.title || data.name,
      description: data.config.description || '',
      author: data.config.author || '',
      createdAt: data.config.created_at || '',
      template: data.config.template || '',
      partCount,
      chapterCount,
      completedChapters: progressStatus.completed,
      totalChapters: progressStatus.total,
      status: progressStatus.status,
      totalChars: data.totalChars,
      a4Pages,
      totalTokens: data.report?.total_tokens || 0,
      cost,
      elapsedTime: data.report?.elapsed_time || 0,
      model: data.report?.model || '',
      generatedAt: data.report?.generated_at || '',
      hasSite: data.hasSite,
      hasDocx: !!data.docxFile,
      hasChapters: data.chapterFiles.length > 0,
      toc: data.toc || null,
      chapterFiles: data.chapterFiles,
    });
  }

  // 집계 통계
  const stats = {
    totalProjects: projects.length,
    completed: projects.filter(p => p.status === '완료').length,
    totalChapters: projects.reduce((s, p) => s + p.chapterCount, 0),
    totalPages: projects.reduce((s, p) => s + p.a4Pages, 0),
    totalCost: projects.reduce((s, p) => s + p.cost, 0),
    totalTokens: projects.reduce((s, p) => s + p.totalTokens, 0),
  };

  res.json({ projects, stats });
}));

// GET /api/portfolio/:id/report - 특정 프로젝트 상세 리포트
router.get('/:id/report', asyncHandler(async (req, res) => {
  const projectPath = join(PROJECTS_DIR, req.params.id);

  if (!existsSync(projectPath)) {
    return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다' });
  }

  const data = await loadProjectData(projectPath, req.params.id);
  if (!data) {
    return res.status(404).json({ message: '유효하지 않은 프로젝트입니다' });
  }

  res.json(data);
}));

// GET /api/portfolio/:id/chapter/:chapterId - 챕터 미리보기
router.get('/:id/chapter/:chapterId', asyncHandler(async (req, res) => {
  const docsPath = join(PROJECTS_DIR, req.params.id, 'docs');
  const filePath = join(docsPath, `${req.params.chapterId}.md`);

  if (!existsSync(filePath)) {
    return res.status(404).json({ message: '챕터 파일을 찾을 수 없습니다' });
  }

  const content = await readFile(filePath, 'utf-8');
  res.json({ content, chars: content.length });
}));

export default router;
