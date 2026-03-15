import { Router } from 'express';
import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ServerSettings } from '../services/settings.js';
import { sanitizeId } from '../middleware/sanitize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(__dirname, '..', '..', 'projects');
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');

const settings = new ServerSettings(join(DATA_DIR, 'settings.json'));

const router = Router();

// ============================================================
// 관리자 인증 미들웨어
// ============================================================
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function requireAdmin(req, res, next) {
  if (!req.user?.email || !ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }
  next();
}

// 모든 관리자 라우트에 관리자 인증 적용
router.use(requireAdmin);

// ============================================================
// 사용자 데이터 유틸리티
// ============================================================

/** 사용자 레지스트리 읽기 (data/users.json) */
async function loadUsersRegistry() {
  if (!existsSync(USERS_FILE)) return [];
  try {
    const raw = await readFile(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** 사용자 레지스트리 저장 */
async function saveUsersRegistry(users) {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

/** 사용자 등록/업데이트 (구글 로그인 시 호출할 수 있도록 export) */
export async function upsertUser(userInfo) {
  const users = await loadUsersRegistry();
  const idx = users.findIndex(u => u.googleId === userInfo.googleId);

  if (idx >= 0) {
    // 기존 사용자 업데이트
    users[idx] = {
      ...users[idx],
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture,
      lastLoginAt: new Date().toISOString(),
    };
  } else {
    // 신규 사용자 등록
    users.push({
      googleId: userInfo.googleId,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      affiliation: userInfo.affiliation || '',
      status: 'active', // 'active' | 'inactive'
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });
  }

  await saveUsersRegistry(users);
  return users[idx >= 0 ? idx : users.length - 1];
}

/** 관리자 이메일 목록 export (Layout에서 사용) */
export function getAdminEmails() {
  return ADMIN_EMAILS;
}

// ============================================================
// 프로젝트 스캔 유틸리티
// ============================================================

/** 모든 프로젝트의 config.json 읽기 */
async function scanAllProjects() {
  if (!existsSync(PROJECTS_DIR)) return [];

  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'template') continue;
    const configFile = join(PROJECTS_DIR, entry.name, 'config.json');
    if (!existsSync(configFile)) continue;

    try {
      const raw = await readFile(configFile, 'utf-8');
      const config = JSON.parse(raw);

      // 챕터 수 계산
      const docsDir = join(PROJECTS_DIR, entry.name, 'docs');
      let chapterCount = 0;
      if (existsSync(docsDir)) {
        const docs = await readdir(docsDir);
        chapterCount = docs.filter(f => f.endsWith('.md')).length;
      }

      // 배포 상태 확인
      const siteDir = join(PROJECTS_DIR, entry.name, 'site');
      const deployed = existsSync(siteDir);

      projects.push({
        id: entry.name,
        title: config.title || entry.name,
        author: config.author || '',
        description: config.description || '',
        owner: config.owner || null,
        claude_model: config.claude_model || '',
        template_id: config.template_id || '',
        chapterCount,
        deployed,
        deployUrl: deployed ? `/api/projects/${entry.name}/deploy/preview/index.html` : null,
        created_at: config.created_at || '',
        updated_at: config.updated_at || '',
      });
    } catch { /* skip broken configs */ }
  }

  projects.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return projects;
}

// ============================================================
// API 라우트
// ============================================================

// GET /api/admin/users - 전체 사용자 목록
router.get('/users', asyncHandler(async (req, res) => {
  const users = await loadUsersRegistry();
  const allProjects = await scanAllProjects();

  // UserStore에서 GitHub 연동 정보 추가
  const userStore = req.app.locals.userStore;
  const enriched = await Promise.all(users.map(async (user) => {
    const github = userStore ? await userStore.getGitHubToken(user.googleId) : null;
    const userProjects = allProjects.filter(p => p.owner?.googleId === user.googleId);

    return {
      ...user,
      hasGitHub: !!github,
      githubUsername: github?.username || null,
      projectCount: userProjects.length,
    };
  }));

  res.json(enriched);
}));

// GET /api/admin/users/:id/projects - 특정 사용자의 프로젝트 목록
router.get('/users/:id/projects', asyncHandler(async (req, res) => {
  const googleId = req.params.id;
  const allProjects = await scanAllProjects();
  const userProjects = allProjects.filter(p => p.owner?.googleId === googleId);
  res.json(userProjects);
}));

// PUT /api/admin/users/:id/status - 사용자 활성/비활성화
router.put('/users/:id/status', asyncHandler(async (req, res) => {
  const googleId = req.params.id;
  const { status } = req.body; // 'active' | 'inactive'

  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ message: '상태는 active 또는 inactive 여야 합니다.' });
  }

  const users = await loadUsersRegistry();
  const idx = users.findIndex(u => u.googleId === googleId);
  if (idx < 0) {
    return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
  }

  users[idx].status = status;
  users[idx].updatedAt = new Date().toISOString();
  await saveUsersRegistry(users);

  res.json(users[idx]);
}));

// GET /api/admin/projects - 전체 프로젝트 목록
router.get('/projects', asyncHandler(async (req, res) => {
  const projects = await scanAllProjects();
  res.json(projects);
}));

// GET /api/admin/stats - 통계 데이터
router.get('/stats', asyncHandler(async (req, res) => {
  const users = await loadUsersRegistry();
  const projects = await scanAllProjects();

  const totalChapters = projects.reduce((sum, p) => sum + (p.chapterCount || 0), 0);
  const totalDeployed = projects.filter(p => p.deployed).length;

  // 일별 프로젝트 생성 (최근 14일)
  const dailyMap = {};
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dailyMap[key] = 0;
  }
  for (const p of projects) {
    if (p.created_at) {
      const day = p.created_at.split('T')[0];
      if (dailyMap[day] !== undefined) dailyMap[day]++;
    }
  }
  const dailyProjects = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

  // 주별 프로젝트 생성 (최근 8주)
  const weeklyMap = {};
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - (i * 7));
    const weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = weekStart.toISOString().split('T')[0];
    if (!weeklyMap[key]) weeklyMap[key] = 0;
  }
  for (const p of projects) {
    if (p.created_at) {
      const pDate = new Date(p.created_at);
      const weekStart = new Date(pDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = weekStart.toISOString().split('T')[0];
      if (weeklyMap[key] !== undefined) weeklyMap[key]++;
    }
  }
  const weeklyProjects = Object.entries(weeklyMap).map(([weekStart, count]) => ({ weekStart, count }));

  res.json({
    totalUsers: users.length,
    totalProjects: projects.length,
    totalChapters,
    totalDeployed,
    activeUsers: users.filter(u => u.status === 'active').length,
    dailyProjects,
    weeklyProjects,
  });
}));

// 키 마스킹 헬퍼: "sk-ant-abc123xyz" → "sk-a...xyz"
function maskKey(key) {
  if (!key || key.length < 8) return key ? '****' : '';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

// GET /api/admin/settings - 현재 운영 설정
router.get('/settings', asyncHandler(async (req, res) => {
  const current = await settings.get();
  res.json(maskAdminApiKeys(current));
}));

// adminApiKeys를 마스킹하는 공통 헬퍼
function maskAdminApiKeys(settingsObj) {
  const adminKeys = settingsObj.adminApiKeys || {};
  settingsObj.adminApiKeys = {};
  for (const provider of ['anthropic', 'openai', 'google', 'upstage']) {
    const entry = adminKeys[provider] || { key: '', shared: false };
    settingsObj.adminApiKeys[provider] = {
      hasKey: !!entry.key,
      masked: maskKey(entry.key),
      shared: !!entry.shared,
    };
  }
  settingsObj.serverApiKeys = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    google: !!process.env.GOOGLE_API_KEY,
    upstage: !!process.env.UPSTAGE_API_KEY,
  };
  return settingsObj;
}

// PUT /api/admin/settings - 운영 설정 변경
router.put('/settings', asyncHandler(async (req, res) => {
  const { apiMode, serverModeMessage, allowedModels, registrationMode } = req.body;
  const partial = {};

  if (apiMode !== undefined) partial.apiMode = apiMode;
  if (serverModeMessage !== undefined) partial.serverModeMessage = serverModeMessage;
  if (allowedModels !== undefined) partial.allowedModels = allowedModels;
  if (registrationMode !== undefined) partial.registrationMode = registrationMode;

  const updated = await settings.update(partial);
  res.json(maskAdminApiKeys(updated));
}));

// PUT /api/admin/api-keys - 관리자 API 키 저장
router.put('/api-keys', asyncHandler(async (req, res) => {
  const { keys } = req.body;
  if (!keys || typeof keys !== 'object') {
    return res.status(400).json({ message: 'keys 객체가 필요합니다.' });
  }

  const current = await settings.get();
  const adminApiKeys = current.adminApiKeys || {};

  for (const provider of ['anthropic', 'openai', 'google', 'upstage']) {
    if (keys[provider] === undefined) continue;
    const { key, shared } = keys[provider];

    const existing = adminApiKeys[provider] || { key: '', shared: false };

    // 빈 문자열이면 기존 키 유지 (UI에서 마스킹 표시 후 빈값 보낼 수 있음)
    // null이면 키 삭제
    if (key === null) {
      existing.key = '';
    } else if (key && key.length > 0) {
      existing.key = key;
    }
    // shared 상태는 항상 업데이트
    if (shared !== undefined) existing.shared = !!shared;

    adminApiKeys[provider] = existing;
  }

  await settings.update({ adminApiKeys });

  // 마스킹된 응답 반환
  const result = {};
  for (const provider of ['anthropic', 'openai', 'google', 'upstage']) {
    const entry = adminApiKeys[provider] || { key: '', shared: false };
    result[provider] = {
      hasKey: !!entry.key,
      masked: maskKey(entry.key),
      shared: !!entry.shared,
    };
  }

  res.json({ adminApiKeys: result, message: 'API 키가 저장되었습니다.' });
}));

// ============================================================
// 프로젝트 삭제 (에듀플로 + 포트폴리오 + GitHub 리포)
// ============================================================

// DELETE /api/admin/projects/:id - 프로젝트 완전 삭제
// query: ?deleteRepo=true&deletePortfolio=true
router.delete('/projects/:id', asyncHandler(async (req, res) => {
  const projectId = sanitizeId(req.params.id);
  if (!projectId) {
    return res.status(400).json({ message: '잘못된 프로젝트 ID입니다.' });
  }

  const projPath = join(PROJECTS_DIR, projectId);
  if (!existsSync(projPath)) {
    return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다.' });
  }

  const { deleteRepo, deletePortfolio } = req.query;
  const results = { project: false, portfolio: false, repo: false };

  // 배포 정보 읽기 (GitHub 리포/포트폴리오 삭제에 필요)
  let deployInfo = null;
  const deployInfoPath = join(projPath, 'deployment_info.json');
  if (existsSync(deployInfoPath)) {
    try {
      deployInfo = JSON.parse(await readFile(deployInfoPath, 'utf-8'));
    } catch { /* skip */ }
  }

  // config.json에서 프로젝트 이름 읽기
  let config = {};
  const configPath = join(projPath, 'config.json');
  if (existsSync(configPath)) {
    try { config = JSON.parse(await readFile(configPath, 'utf-8')); } catch { /* skip */ }
  }

  // 1. 포트폴리오에서 제거
  if (deletePortfolio === 'true' && deployInfo) {
    try {
      const repoName = deployInfo.site_url
        ? deployInfo.site_url.split('/').filter(Boolean).pop()
        : null;

      if (repoName) {
        const portfolioToken = process.env.PORTFOLIO_GITHUB_TOKEN;
        if (portfolioToken) {
          const PORTFOLIO_REPO = 'greatsong/eduflow-portfolio';
          const fileRes = await fetch(
            `https://api.github.com/repos/${PORTFOLIO_REPO}/contents/projects.json`,
            {
              headers: {
                'Authorization': `Bearer ${portfolioToken}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'EduFlow',
              },
            }
          );

          if (fileRes.ok) {
            const fileData = await fileRes.json();
            const projects = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
            const filtered = projects.filter(p => p.name !== repoName);

            if (filtered.length < projects.length) {
              const content = Buffer.from(JSON.stringify(filtered, null, 2)).toString('base64');
              const updateRes = await fetch(
                `https://api.github.com/repos/${PORTFOLIO_REPO}/contents/projects.json`,
                {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${portfolioToken}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'EduFlow',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    message: `Remove from portfolio: ${config.title || repoName}`,
                    content,
                    sha: fileData.sha,
                  }),
                }
              );
              results.portfolio = updateRes.ok;
            } else {
              results.portfolio = true; // 이미 없음
            }
          }
        }
      }
    } catch (e) {
      console.error('[EduFlow] 포트폴리오 삭제 실패:', e.message);
    }
  }

  // 2. GitHub 리포 삭제 (배포된 사용자의 토큰 사용)
  if (deleteRepo === 'true' && deployInfo?.username && deployInfo?.repo_url) {
    try {
      const repoName = deployInfo.repo_url.split('/').pop();
      const owner = deployInfo.username;

      // 프로젝트 owner의 GitHub 토큰 조회
      const userStore = req.app.locals.userStore;
      const ownerGoogleId = config.owner?.googleId;
      let token = null;

      if (userStore && ownerGoogleId) {
        const github = await userStore.getGitHubToken(ownerGoogleId);
        token = github?.token;
      }

      if (token) {
        const delRes = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'EduFlow',
            },
          }
        );
        results.repo = delRes.ok || delRes.status === 404;
      } else {
        results.repo = false; // 토큰 없어 삭제 불가
      }
    } catch (e) {
      console.error('[EduFlow] GitHub 리포 삭제 실패:', e.message);
    }
  }

  // 3. 에듀플로 프로젝트 폴더 삭제
  await rm(projPath, { recursive: true, force: true });
  results.project = true;

  console.log(`[EduFlow] 프로젝트 삭제: ${projectId}`, results);
  res.json({ success: true, results });
}));

// GET /api/admin/check - 관리자 여부 확인 (프론트엔드용)
router.get('/check', (req, res) => {
  res.json({ isAdmin: true });
});

export default router;
export { requireAdmin };
