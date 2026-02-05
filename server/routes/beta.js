import { Router } from 'express';
import { join, dirname } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../middleware/errorHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.PROJECT_ROOT || join(__dirname, '..', '..');
const BETA_CONFIG_FILE = join(PROJECT_ROOT, 'beta_config.json');

const router = Router();

// 베타 설정 로드
async function loadBetaConfig() {
  if (!existsSync(BETA_CONFIG_FILE)) {
    return { repo_name: 'eduflow', repo_created: false, testers: [], invite_message: '' };
  }
  return JSON.parse(await readFile(BETA_CONFIG_FILE, 'utf-8'));
}

// 베타 설정 저장
async function saveBetaConfig(config) {
  await writeFile(BETA_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// execa 동적 import (ESM 전용 패키지)
async function exec(cmd, args, options = {}) {
  const { execa } = await import('execa');
  return execa(cmd, args, { ...options, reject: false });
}

// GET /api/beta/config - 베타 설정 로드
router.get('/config', asyncHandler(async (req, res) => {
  const config = await loadBetaConfig();
  res.json(config);
}));

// GET /api/beta/github-status - GitHub CLI/Auth 상태
router.get('/github-status', asyncHandler(async (req, res) => {
  // gh 설치 확인
  const whichResult = await exec('which', ['gh']);
  const ghInstalled = whichResult.exitCode === 0;

  if (!ghInstalled) {
    return res.json({ ghInstalled: false, authenticated: false, username: null });
  }

  // 인증 확인
  const authResult = await exec('gh', ['auth', 'status']);
  const authenticated = authResult.exitCode === 0;

  let username = null;
  if (authenticated) {
    const userResult = await exec('gh', ['api', 'user', '-q', '.login']);
    if (userResult.exitCode === 0) {
      username = userResult.stdout.trim();
    }
  }

  res.json({ ghInstalled, authenticated, username });
}));

// POST /api/beta/repo - GitHub 저장소 생성
router.post('/repo', asyncHandler(async (req, res) => {
  const { repoName, visibility = 'private' } = req.body;
  if (!repoName) {
    return res.status(400).json({ message: '저장소 이름이 필요합니다' });
  }

  const config = await loadBetaConfig();

  if (config.repo_created) {
    return res.json({ success: true, message: '이미 생성된 저장소입니다', repoName: config.repo_name });
  }

  // git init
  await exec('git', ['init'], { cwd: PROJECT_ROOT });

  // .gitignore 확인 및 생성
  const gitignorePath = join(PROJECT_ROOT, '.gitignore');
  if (!existsSync(gitignorePath)) {
    const gitignoreContent = `node_modules/
.env
dist/
.DS_Store
`;
    await writeFile(gitignorePath, gitignoreContent, 'utf-8');
  }

  // git add + commit
  await exec('git', ['add', '.'], { cwd: PROJECT_ROOT });
  await exec('git', ['commit', '-m', 'Initial commit: 에듀플로 JS v0.1 Beta'], { cwd: PROJECT_ROOT });

  // gh repo create
  const visFlag = visibility === 'public' ? '--public' : '--private';
  const result = await exec('gh', ['repo', 'create', repoName, visFlag, '--source=.', '--push'], { cwd: PROJECT_ROOT });

  if (result.exitCode === 0) {
    config.repo_name = repoName;
    config.repo_created = true;
    config.created_at = new Date().toISOString();
    await saveBetaConfig(config);

    // 사용자명 가져오기
    const userResult = await exec('gh', ['api', 'user', '-q', '.login']);
    const username = userResult.exitCode === 0 ? userResult.stdout.trim() : '';

    res.json({
      success: true,
      repoName,
      repoUrl: username ? `https://github.com/${username}/${repoName}` : null,
    });
  } else {
    res.status(500).json({ success: false, message: result.stderr || '저장소 생성 실패' });
  }
}));

// POST /api/beta/testers - 테스터 초대
router.post('/testers', asyncHandler(async (req, res) => {
  const { username: testerName } = req.body;
  if (!testerName) {
    return res.status(400).json({ message: 'GitHub 사용자명이 필요합니다' });
  }

  const config = await loadBetaConfig();
  if (!config.repo_created) {
    return res.status(400).json({ message: '먼저 저장소를 생성하세요' });
  }

  // 현재 사용자명 가져오기
  const userResult = await exec('gh', ['api', 'user', '-q', '.login']);
  if (userResult.exitCode !== 0) {
    return res.status(500).json({ message: 'GitHub 인증 정보를 가져올 수 없습니다' });
  }
  const ownerName = userResult.stdout.trim();

  // collaborator 추가
  const result = await exec('gh', [
    'api',
    `repos/${ownerName}/${config.repo_name}/collaborators/${testerName}`,
    '-X', 'PUT',
    '-f', 'permission=push',
  ]);

  if (result.exitCode === 0) {
    const testers = config.testers || [];
    if (!testers.some(t => t.username === testerName)) {
      testers.push({
        username: testerName,
        invited_at: new Date().toISOString(),
        status: 'pending',
      });
      config.testers = testers;
      await saveBetaConfig(config);
    }
    res.json({ success: true, message: `${testerName}님에게 초대를 보냈습니다` });
  } else {
    const errMsg = result.stderr || result.stdout;
    if (errMsg.includes('404')) {
      res.status(404).json({ message: `'${testerName}' 사용자를 찾을 수 없습니다` });
    } else {
      res.status(500).json({ message: `초대 실패: ${errMsg}` });
    }
  }
}));

// DELETE /api/beta/testers/:username - 테스터 제거
router.delete('/testers/:username', asyncHandler(async (req, res) => {
  const testerName = req.params.username;
  const config = await loadBetaConfig();

  if (!config.repo_created) {
    return res.status(400).json({ message: '저장소가 생성되지 않았습니다' });
  }

  // 현재 사용자명
  const userResult = await exec('gh', ['api', 'user', '-q', '.login']);
  const ownerName = userResult.exitCode === 0 ? userResult.stdout.trim() : '';

  // collaborator 제거
  if (ownerName) {
    await exec('gh', [
      'api',
      `repos/${ownerName}/${config.repo_name}/collaborators/${testerName}`,
      '-X', 'DELETE',
    ]);
  }

  // 목록에서 제거
  config.testers = (config.testers || []).filter(t => t.username !== testerName);
  await saveBetaConfig(config);

  res.json({ success: true, message: `${testerName}님을 제거했습니다` });
}));

// POST /api/beta/push - 커밋 & 푸시
router.post('/push', asyncHandler(async (req, res) => {
  const { commitMessage = 'Update: 기능 개선' } = req.body;
  const config = await loadBetaConfig();

  if (!config.repo_created) {
    return res.status(400).json({ message: '먼저 저장소를 생성하세요' });
  }

  // git add
  await exec('git', ['add', '.'], { cwd: PROJECT_ROOT });

  // git commit
  const commitResult = await exec('git', ['commit', '-m', commitMessage], { cwd: PROJECT_ROOT });
  const hasChanges = commitResult.exitCode === 0;

  // git push
  const pushResult = await exec('git', ['push', 'origin', 'HEAD'], { cwd: PROJECT_ROOT });

  if (pushResult.exitCode === 0) {
    res.json({ success: true, message: hasChanges ? '커밋 & 푸시 완료' : '변경사항 없이 푸시 완료' });
  } else {
    res.status(500).json({ success: false, message: pushResult.stderr || '푸시 실패' });
  }
}));

// PUT /api/beta/config - 설정 업데이트 (초대 메시지 등)
router.put('/config', asyncHandler(async (req, res) => {
  const config = await loadBetaConfig();
  const { invite_message, repo_name } = req.body;

  if (invite_message !== undefined) config.invite_message = invite_message;
  if (repo_name !== undefined) config.repo_name = repo_name;

  await saveBetaConfig(config);
  res.json({ success: true });
}));

// DELETE /api/beta/config - 설정 초기화
router.delete('/config', asyncHandler(async (req, res) => {
  if (existsSync(BETA_CONFIG_FILE)) {
    const { unlink } = await import('fs/promises');
    await unlink(BETA_CONFIG_FILE);
  }
  res.json({ success: true, message: '설정이 초기화되었습니다' });
}));

export default router;
