import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch } from '../api/client';
import { getUserInfo, getAuthToken } from '../components/EntryForm';

const TABS = ['🌐 웹사이트', '📄 DOCX 문서', '🔍 미리보기'];

// 장시간 작업 진행 배너 — 경과 시간 + 예상 소요 안내
function BuildProgress({ label, tone = 'emerald', hint }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const elapsed = mm > 0 ? `${mm}분 ${ss}초` : `${ss}초`;
  const tones = {
    emerald: {
      bg: 'bg-emerald-50', border: 'border-emerald-200',
      text: 'text-emerald-800', sub: 'text-emerald-700',
      spin: 'border-emerald-500',
    },
    amber: {
      bg: 'bg-amber-50', border: 'border-amber-200',
      text: 'text-amber-800', sub: 'text-amber-700',
      spin: 'border-amber-500',
    },
  };
  const c = tones[tone] || tones.emerald;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${c.bg} border ${c.border}`}>
      <span className={`mt-0.5 inline-block w-4 h-4 border-2 ${c.spin} border-t-transparent rounded-full animate-spin shrink-0`} />
      <div className="flex-1">
        <p className={`text-sm font-medium ${c.text}`}>{label} · {elapsed} 경과</p>
        {hint && <p className={`text-xs ${c.sub} mt-1`}>{hint}</p>}
      </div>
    </div>
  );
}

export default function Deployment() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const [activeTab, setActiveTab] = useState(0);
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [githubUser, setGithubUser] = useState(null); // { username, avatarUrl }

  // 작업별 상태(로딩/결과/메시지)를 부모가 보관 → 탭 전환에도 유지
  const initialJobs = {
    config: { loading: false },
    build: { loading: false },
    deploy: { loading: false, result: null },
    docx: { loading: false, result: null },
    mkdocsMessage: null, // config/build 공용 상태 메시지
  };
  const [jobs, setJobs] = useState(initialJobs);
  const updateJob = (key, patch) =>
    setJobs((prev) =>
      key === 'mkdocsMessage'
        ? { ...prev, mkdocsMessage: patch }
        : { ...prev, [key]: { ...prev[key], ...patch } }
    );

  // 프로젝트가 바뀌면 이전 프로젝트의 결과가 새 프로젝트에 잘못 남지 않도록 리셋
  useEffect(() => {
    setJobs(initialJobs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.name]);

  const refreshStatus = async () => {
    if (!currentProject) return;
    try {
      const data = await apiFetch(`/api/projects/${currentProject.name}/deploy/status`);
      setStatus(data);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    if (!currentProject) return;
    setStatusLoading(true);
    apiFetch(`/api/projects/${currentProject.name}/deploy/status`)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setStatusLoading(false));
  }, [currentProject]);

  // GitHub 연동 상태 확인
  useEffect(() => {
    apiFetch('/api/auth/github/status')
      .then(data => {
        if (data.connected) {
          setGithubUser({ username: data.username, avatarUrl: data.avatarUrl });
        }
      })
      .catch(() => {});
  }, []);

  if (!currentProject) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">먼저 프로젝트를 선택하세요</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900">🚀 Step 5: 배포 관리</h2>
        <p className="text-sm text-gray-500">생성된 교육자료를 웹사이트나 문서로 배포합니다.</p>
      </div>

      {/* 도구 상태 */}
      {status && (
        <div className="mb-4 flex items-center gap-4 text-xs text-gray-500">
          <span>도구 상태:</span>
          <span className={status.tools.node ? 'text-green-600' : 'text-red-500'}>
            {status.tools.node ? '✅' : '❌'} node
          </span>
          <span className={status.tools.npm ? 'text-green-600' : 'text-red-500'}>
            {status.tools.npm ? '✅' : '❌'} npm
          </span>
          <span className={status.tools.pandoc ? 'text-green-600' : 'text-red-500'}>
            {status.tools.pandoc ? '✅' : '❌'} pandoc
          </span>
          <span className={status.tools.git ? 'text-green-600' : 'text-red-500'}>
            {status.tools.git ? '✅' : '❌'} git
          </span>
          <span className={status.tools.gh ? 'text-green-600' : 'text-red-500'}>
            {status.tools.gh ? '✅' : '❌'} gh
          </span>
          <span className="ml-auto">📁 챕터: {status.chapterCount}개</span>
          {status.ghUser && <span>👤 {status.ghUser}</span>}
        </div>
      )}

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === i
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 0 && (
          <MkDocsTab
            project={currentProject}
            status={status}
            statusLoading={statusLoading}
            githubUser={githubUser}
            setGithubUser={setGithubUser}
            refreshStatus={refreshStatus}
            jobs={jobs}
            updateJob={updateJob}
            goToPreview={() => setActiveTab(2)}
          />
        )}
        {activeTab === 1 && (
          <DocxTab
            project={currentProject}
            status={status}
            statusLoading={statusLoading}
            jobs={jobs}
            updateJob={updateJob}
          />
        )}
        {activeTab === 2 && (
          <PreviewTab
            project={currentProject}
            status={status}
            statusLoading={statusLoading}
            refreshStatus={refreshStatus}
          />
        )}
      </div>

      {/* 포트폴리오로 */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <button
          onClick={() => navigate('/portfolio')}
          className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          📊 포트폴리오로 →
        </button>
      </div>
    </div>
  );
}

// =============================================
// 탭 1: 웹사이트 (Astro Starlight 빌드)
// =============================================
// 레포 이름 추천 함수 (제목 기반)
function suggestRepoNames(projectName, title = '') {
  const sanitize = (name) =>
    name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const suggestions = [];
  const dateMatch = projectName.match(/(\d{6})/);
  const dateStr = dateMatch ? dateMatch[1] : '';

  // 제목에서 영어/숫자 단어 추출
  const engWords = (title.match(/[a-zA-Z0-9]+/g) || []).map(w => w.toLowerCase());
  const engSlug = sanitize(engWords.join('-'));

  // 1. 영어 키워드 기반
  if (engSlug.length >= 2) {
    suggestions.push(`${engSlug}-book`);
    suggestions.push(`${engSlug}-guide`);
    suggestions.push(`eduflow-${engSlug}`);
  }

  // 2. 프로젝트 이름 기반 (짧으면)
  const base = sanitize(projectName);
  if (base.length >= 3 && base.length <= 25) {
    suggestions.push(base);
  }

  // 3. 날짜 기반 변형
  if (dateStr) {
    if (engSlug.length >= 2) suggestions.push(`${engSlug}-${dateStr}`);
    suggestions.push(`${dateStr}-book`);
  }

  // 중복 제거 + 빈 문자열 제거 + 최대 5개
  return [...new Set(suggestions)].filter(s => s && s.length >= 3).slice(0, 5);
}

const COLOR_THEMES = [
  { id: 'indigo', label: '인디고/퍼플', primary: 'indigo', accent: 'deep purple', colors: ['#4f46e5', '#7c3aed'], desc: '고급스럽고 세련된' },
  { id: 'teal', label: '에메랄드/틸', primary: 'teal', accent: 'green', colors: ['#0d9488', '#10b981'], desc: '자연적이고 차분한' },
  { id: 'amber', label: '앰버/오렌지', primary: 'deep orange', accent: 'amber', colors: ['#ea580c', '#f59e0b'], desc: '따뜻하고 친근한' },
  { id: 'blue', label: '블루/스카이', primary: 'blue', accent: 'cyan', colors: ['#2563eb', '#0ea5e9'], desc: '신뢰감 있는 클래식' },
  { id: 'rose', label: '로즈/핑크', primary: 'pink', accent: 'red', colors: ['#e11d48', '#f43f5e'], desc: '부드럽고 감성적인' },
];

// GitHub 아이콘 SVG
const GitHubIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

function MkDocsTab({ project, status, statusLoading, githubUser, setGithubUser, refreshStatus, jobs, updateJob, goToPreview }) {
  const [siteName, setSiteName] = useState('');
  const [theme, setTheme] = useState('material');
  const [colorTheme, setColorTheme] = useState('indigo');
  const [buildTheme, setBuildTheme] = useState('starlight'); // 'starlight' | 'mkdocs'
  const [repoName, setRepoName] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const deployResultRef = useRef(null);

  // 저장된 빌드 테마 복원 (status 로드 후)
  useEffect(() => {
    if (status?.buildTheme === 'starlight' || status?.buildTheme === 'mkdocs') {
      setBuildTheme(status.buildTheme);
    }
  }, [status?.buildTheme]);

  // 작업 상태는 부모에서 주입 (탭 전환 시에도 유지)
  const configLoading = jobs.config.loading;
  const buildLoading = jobs.build.loading;
  const deployLoading = jobs.deploy.loading;
  const message = jobs.mkdocsMessage;
  const deployResult = jobs.deploy.result;
  const setMessage = (m) => updateJob('mkdocsMessage', m);
  const setDeployResult = (r) => updateJob('deploy', { result: r });

  useEffect(() => {
    // TOC에서 제목 가져오기 → 제목 기반 레포 이름 추천
    apiFetch(`/api/projects/${project.name}/toc`)
      .then((d) => {
        const title = d.toc?.title || '교육자료';
        setSiteName(title);
        const names = suggestRepoNames(project.name, title);
        setSuggestions(names);
        if (!repoName && names.length > 0) setRepoName(names[0]);
      })
      .catch(() => {
        setSiteName('교육자료');
        const names = suggestRepoNames(project.name);
        setSuggestions(names);
        if (!repoName && names.length > 0) setRepoName(names[0]);
      });

    // 이전 배포 기록 로드 — 방금 만든 배포 결과가 있으면 덮어쓰지 않음
    if (status?.deploymentInfo && !deployResult) {
      setDeployResult({
        success: true,
        site_url: status.deploymentInfo.site_url,
        repo_url: status.deploymentInfo.repo_url,
        username: status.deploymentInfo.username,
        deployed_at: status.deploymentInfo.deployed_at,
        restored: true, // 이전 기록 복원 표시
      });
      if (status.deploymentInfo.repo_url) {
        const match = status.deploymentInfo.repo_url.match(/\/([^/]+)$/);
        if (match) setRepoName(match[1]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, status]);

  const handleGenerateConfig = async () => {
    updateJob('config', { loading: true });
    setMessage(null);
    try {
      const user = getUserInfo();
      const creator = user ? { name: user.name, affiliation: user.affiliation } : null;
      const result = await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/config`, {
        method: 'POST',
        body: JSON.stringify({ siteName, theme, colorTheme, creator, buildTheme }),
      });
      if (result.success) {
        setMessage({ type: 'success', text: '✅ 웹사이트 설정 생성 완료!' });
        await refreshStatus?.();
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
    updateJob('config', { loading: false });
  };

  const handleBuild = async () => {
    updateJob('build', { loading: true, result: null });
    setMessage(null);
    const MAX_WAIT_MS = 600000; // Fly shared-cpu 기준 빌드 3~6분 소요를 커버 (여유 포함 10분)
    const INTERVAL = 3000;
    const start = Date.now();
    while (true) {
      try {
        const startedAt = Date.now();
        const result = await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/build`, {
          method: 'POST',
          body: JSON.stringify({ theme: buildTheme, colorTheme }),
        });
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        setMessage(result.success
          ? { type: 'success', text: '✅ 웹사이트 빌드 완료!' }
          : { type: 'error', text: result.message || result.error });
        updateJob('build', {
          result: result.success
            ? { success: true, elapsedSec, theme: buildTheme, finishedAt: Date.now() }
            : { success: false, message: result.message || result.error },
        });
        await refreshStatus?.();
        break;
      } catch (e) {
        if (e.status === 409 && Date.now() - start < MAX_WAIT_MS) {
          setMessage({ type: 'info', text: '⏳ 다른 빌드가 진행 중이에요. 잠시 뒤 자동으로 다시 시도합니다…' });
          await new Promise((r) => setTimeout(r, INTERVAL));
          continue;
        }
        setMessage({ type: 'error', text: e.message });
        updateJob('build', { result: { success: false, message: e.message } });
        break;
      }
    }
    updateJob('build', { loading: false });
  };

  const handleGitHubConnect = async () => {
    try {
      const data = await apiFetch('/api/auth/github?returnTo=/deploy');
      const popup = window.open(data.url, 'GitHub 연동', 'width=600,height=700');

      // 팝업에서 postMessage 수신
      const messageHandler = (event) => {
        if (event.data?.type === 'github-auth-success') {
          setGithubUser(event.data.user);
          setDeployTarget('personal');
          popup?.close();
          window.removeEventListener('message', messageHandler);
        }
      };
      window.addEventListener('message', messageHandler);

      // 팝업이 닫히면 리스너 정리 + 상태 재확인
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          // 팝업이 닫혔는데 postMessage를 못 받은 경우 상태 재확인
          if (!githubUser) {
            apiFetch('/api/auth/github/status')
              .then(d => {
                if (d.connected) {
                  setGithubUser({ username: d.username, avatarUrl: d.avatarUrl });
                  setDeployTarget('personal');
                }
              })
              .catch(() => {});
          }
        }
      }, 1000);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const handleGitHubDisconnect = async () => {
    try {
      await apiFetch('/api/auth/github/disconnect', { method: 'POST' });
    } catch {
      // 서버 실패해도 로컬 상태는 정리
    }
    setGithubUser(null);
    setDeployTarget('shared');
  };

  const handleDeploy = async () => {
    if (!repoName.trim()) return;
    updateJob('deploy', { loading: true, result: null });
    try {
      const user = getUserInfo();
      const creator = user ? { name: user.name, affiliation: user.affiliation } : null;
      const body = {
        repoName: repoName.trim(),
        creator,
        deployTarget: 'personal',  // 항상 사용자 GitHub 계정으로 배포
        registerPortfolio: true,    // 포트폴리오 등록 필수
      };

      const result = await apiFetch(`/api/projects/${project.name}/deploy/github`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      updateJob('deploy', { loading: false, result });
      setTimeout(() => deployResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    } catch (e) {
      updateJob('deploy', { loading: false, result: { success: false, message: e.message } });
      setTimeout(() => deployResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  };

  // 배포 URL 미리보기
  const previewDeployUrl = () => {
    if (!repoName || !githubUser) return null;
    return `https://${githubUser.username}.github.io/${repoName}/`;
  };

  if (statusLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-gray-500 text-sm">배포 도구 상태 확인 중...</p>
      </div>
    );
  }

  if (!status?.tools?.node || !status?.tools?.npm) {
    return (
      <div className="bg-amber-50 rounded-xl p-6">
        <h3 className="font-semibold text-amber-800 mb-2">Node.js / npm이 설치되지 않았습니다</h3>
        <p className="text-sm text-amber-700 mb-3">
          Astro Starlight 기반 웹사이트 빌드에는 Node.js와 npm이 필요합니다. 관리자에게 문의해주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 설정 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">🔧 웹사이트 설정</h3>

        {/* 빌드 방식 선택 */}
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-2">빌드 방식</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                id: 'starlight',
                label: 'Astro Starlight',
                tagline: '세련된 디자인',
                desc: '기본 권장. 최신 디자인과 반응형 레이아웃. 빌드는 3~6분 소요.',
              },
              {
                id: 'mkdocs',
                label: 'MkDocs Material',
                tagline: '빠른 빌드',
                desc: '클래식 문서 스타일. 빌드는 보통 30초 이내. mkdocs CLI 필요.',
                warn: status && status.tools && status.tools.mkdocs === false,
              },
            ].map((opt) => {
              const selected = buildTheme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBuildTheme(opt.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    selected
                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${selected ? 'text-emerald-800' : 'text-gray-900'}`}>
                      {opt.label}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      selected ? 'border-emerald-400 text-emerald-700 bg-white' : 'border-gray-200 text-gray-500'
                    }`}>
                      {opt.tagline}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{opt.desc}</p>
                  {opt.warn && (
                    <p className="text-[11px] text-amber-700 mt-1.5">
                      ⚠️ 서버에 mkdocs가 설치되어 있지 않아 이 옵션으로 빌드가 실패할 수 있습니다.
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">사이트 제목</label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* 색상 테마 선택 */}
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-2">색상 테마</label>
          <div className="flex gap-2 flex-wrap">
            {COLOR_THEMES.map((ct) => (
              <button
                key={ct.id}
                onClick={() => setColorTheme(ct.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                  colorTheme === ct.id
                    ? 'border-gray-400 shadow-md ring-2 ring-offset-1 ring-gray-300 scale-105'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex -space-x-1">
                  {ct.colors.map((c, i) => (
                    <div key={i} className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <span>{ct.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {COLOR_THEMES.find(ct => ct.id === colorTheme)?.desc} 느낌의 디자인
          </p>
        </div>

        <button
          onClick={handleGenerateConfig}
          disabled={configLoading}
          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm rounded-xl font-medium hover:from-emerald-700 hover:to-green-700 disabled:opacity-50 transition-all shadow-sm"
        >
          {configLoading ? '생성 중...' : '🔨 웹사이트 프로젝트 생성'}
        </button>

        {message && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700' :
            message.type === 'info' ? 'bg-amber-50 text-amber-700' :
            'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}
      </div>

      {/* 빌드 */}
      {status?.hasMkdocsYml && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">📋 빌드</h3>
          <p className="text-sm text-gray-500 mb-3">
            빌드 후 "미리보기" 탭에서 결과를 확인할 수 있습니다.
          </p>
          <button
            onClick={handleBuild}
            disabled={buildLoading}
            className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {buildLoading ? '빌드 중...' : '📦 빌드'}
          </button>
          {buildLoading && (
            <div className="mt-3">
              <BuildProgress
                label="웹사이트 빌드 중"
                hint={buildTheme === 'mkdocs'
                  ? 'MkDocs는 보통 10~30초 안에 끝납니다.'
                  : 'Fly 환경에서는 astro build 때문에 보통 3~6분 걸립니다. 창을 닫지 말고 기다려주세요.'}
              />
            </div>
          )}
          {!buildLoading && jobs.build.result && (
            <div className={`mt-3 p-3 rounded-lg border flex items-start gap-3 ${
              jobs.build.result.success
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex-1">
                {jobs.build.result.success ? (
                  <>
                    <p className="text-sm font-semibold text-emerald-800">
                      ✅ 빌드 성공!
                    </p>
                    <p className="text-xs text-emerald-700 mt-1">
                      {jobs.build.result.theme === 'mkdocs' ? 'MkDocs Material' : 'Astro Starlight'}
                      {typeof jobs.build.result.elapsedSec === 'number' && (
                        <> · {jobs.build.result.elapsedSec < 60
                          ? `${jobs.build.result.elapsedSec}초`
                          : `${Math.floor(jobs.build.result.elapsedSec / 60)}분 ${jobs.build.result.elapsedSec % 60}초`} 소요</>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-red-800">❌ 빌드 실패</p>
                    <p className="text-xs text-red-700 mt-1">{jobs.build.result.message}</p>
                  </>
                )}
              </div>
              {jobs.build.result.success && goToPreview && (
                <button
                  onClick={goToPreview}
                  className="shrink-0 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium"
                >
                  미리보기 →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* GitHub Pages 배포 */}
      {status?.hasMkdocsYml && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">🚀 GitHub Pages 배포</h3>

          {/* GitHub 연동 상태 표시 */}
          {githubUser && (
            <div className="mb-4 flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              {githubUser.avatarUrl && (
                <img
                  src={githubUser.avatarUrl}
                  alt={githubUser.username}
                  className="w-8 h-8 rounded-full border border-green-300"
                />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">
                  ✅ GitHub 연동됨: @{githubUser.username}
                </p>
              </div>
              <button
                onClick={handleGitHubDisconnect}
                className="text-xs text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
              >
                연동 해제
              </button>
            </div>
          )}

          {/* GitHub 연동 안내 (미연동 시) */}
          {!githubUser && (
            <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-sm text-gray-700 font-medium mb-2">
                GitHub 연동이 필요합니다
              </p>
              <p className="text-xs text-gray-500 mb-3">
                GitHub Pages로 배포하려면 먼저 GitHub 계정을 연동해주세요.
                배포된 사이트는 내 계정.github.io/[저장소명] 주소로 접근할 수 있습니다.
              </p>
              <button
                onClick={handleGitHubConnect}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                <GitHubIcon className="w-4 h-4" />
                GitHub 연동하기
              </button>
            </div>
          )}

          {/* 배포 폼: GitHub 연동 시에만 표시 */}
          {githubUser && (
            <>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">저장소 이름</label>
                  <input
                    type="text"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="my-education-site"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  {/* 추천 chip */}
                  {suggestions.length > 0 && (
                    <div className="flex gap-2 mt-2 items-center">
                      <span className="text-xs text-gray-400">추천:</span>
                      {suggestions.map((name) => (
                        <button
                          key={name}
                          onClick={() => setRepoName(name)}
                          className={`px-2.5 py-0.5 text-xs rounded-full border transition-colors ${
                            repoName === name
                              ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* URL 미리보기 */}
                  {previewDeployUrl() && (
                    <p className="text-xs text-gray-400 mt-1">
                      🌐 {previewDeployUrl()}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleDeploy}
                  disabled={deployLoading || !repoName.trim()}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 min-w-[100px]"
                >
                  {deployLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      배포 중...
                    </span>
                  ) : '🚀 배포'}
                </button>
              </div>

              {/* 포트폴리오 등록 안내 */}
              <p className="text-xs text-gray-400 mt-3">
                📋 배포 시 에듀플로 포트폴리오에 자동 등록됩니다.
              </p>

              {deployLoading && !deployResult && (
                <div className="mt-4">
                  <BuildProgress
                    label="GitHub Pages 배포 중"
                    hint="올바른 경로로 재빌드 → 리포 생성 → 업로드까지 보통 6~10분 걸립니다. 이 화면을 유지해주세요."
                  />
                </div>
              )}
              {deployResult && (
                <div ref={deployResultRef} className={`mt-4 p-4 rounded-xl border-2 ${deployResult.success ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                  {deployResult.success ? (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-semibold text-green-800">
                            ✅ {deployResult.restored ? '이전 배포 기록' : '배포 완료!'}
                          </p>
                          <a href={deployResult.site_url} target="_blank" rel="noopener noreferrer"
                            className="text-green-700 underline font-medium text-sm">
                            🌐 {deployResult.site_url}
                          </a>
                          {deployResult.deployed_at && (
                            <p className="text-xs text-green-600 mt-0.5">
                              📅 {new Date(deployResult.deployed_at).toLocaleString('ko-KR')}
                            </p>
                          )}
                        </div>
                        <a href={deployResult.site_url} target="_blank" rel="noopener noreferrer"
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 whitespace-nowrap">
                          사이트 열기 →
                        </a>
                      </div>
                      {/* 배포 후 수정 안내 */}
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-semibold text-blue-800 mb-2">📝 배포 후 수정 방법</p>
                        <ul className="text-xs text-blue-700 space-y-1.5">
                          <li><strong>GitHub에서 직접 수정</strong>: 저장소의 <code>docs/</code> 폴더에서 마크다운 파일을 편집하면 사이트가 자동 업데이트됩니다.</li>
                          <li><strong>에듀플로에서 수정</strong>: Step 4에서 챕터를 수정한 뒤 다시 배포하세요.</li>
                          <li><strong>검토자 추가</strong>: GitHub 저장소의 README.md에서 검토 항목을 업데이트하세요.</li>
                        </ul>
                        {deployResult.repo_url && (
                          <a href={deployResult.repo_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">
                            <GitHubIcon className="w-3.5 h-3.5" />
                            GitHub 저장소 열기 →
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold text-red-800">❌ 배포 실패</p>
                      <p className="text-sm text-red-700 mt-1">{deployResult.message}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}

// =============================================
// 탭 2: DOCX 문서
// =============================================
function DocxTab({ project, status, statusLoading, jobs, updateJob }) {
  const [title, setTitle] = useState('');
  const loading = jobs.docx.loading;
  const result = jobs.docx.result;
  const setResult = (r) => updateJob('docx', { result: r });

  useEffect(() => {
    apiFetch(`/api/projects/${project.name}/toc`)
      .then((d) => setTitle(d.toc?.title || '교육자료'))
      .catch(() => setTitle('교육자료'));
  }, [project]);

  if (statusLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-gray-500 text-sm">배포 도구 상태 확인 중...</p>
      </div>
    );
  }

  if (!status?.tools?.pandoc) {
    return (
      <div className="bg-amber-50 rounded-xl p-6">
        <h3 className="font-semibold text-amber-800 mb-2">Pandoc이 설치되지 않았습니다</h3>
        <p className="text-sm text-amber-700 mb-3">
          Pandoc을 설치하면 마크다운을 DOCX 문서로 변환할 수 있습니다.
        </p>
        <code className="block bg-amber-100 p-3 rounded text-sm text-amber-900">
          brew install pandoc
        </code>
      </div>
    );
  }

  const handleGenerate = async () => {
    updateJob('docx', { loading: true, result: null });
    try {
      const res = await apiFetch(`/api/projects/${project.name}/deploy/docx`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      updateJob('docx', { loading: false, result: res });
    } catch (e) {
      updateJob('docx', { loading: false, result: { success: false, message: e.message } });
    }
  };

  const handleDownload = async () => {
    try {
      const headers = {};
      const token = getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/projects/${project.name}/deploy/docx/download`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: '다운로드 실패' }));
        setResult({ success: false, message: err.message });
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?(.+?)"?$/);
      const filename = match ? decodeURIComponent(match[1]) : 'document.docx';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setResult({ success: false, message: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">📄 DOCX 문서 생성</h3>
        <p className="text-sm text-gray-500 mb-4">
          Pandoc을 사용하여 마크다운 파일을 DOCX 문서로 변환합니다. 인쇄용이나 오프라인 배포에 적합합니다.
        </p>

        <div className="flex gap-3 items-end mb-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">문서 제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || (status?.chapterCount || 0) === 0}
            className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? '생성 중...' : '📝 DOCX 생성'}
          </button>
        </div>

        {(status?.chapterCount || 0) === 0 && (
          <p className="text-sm text-amber-600">⚠️ 챕터가 없습니다. Step 4에서 챕터를 먼저 생성하세요.</p>
        )}

        {loading && (
          <div className="mt-3">
            <BuildProgress
              label="DOCX 생성 중"
              hint="챕터 수에 따라 수십 초~2분 정도 걸립니다. pandoc이 실패하면 자동으로 JS 폴백으로 재시도합니다."
            />
          </div>
        )}
      </div>

      {result && (
        <div className={`p-4 rounded-xl border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          {result.success ? (
            <>
              <p className="text-sm text-green-700 mb-3">
                ✅ DOCX 생성 완료! ({result.size_mb} MB)
              </p>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                📥 다운로드
              </button>
            </>
          ) : (
            <p className="text-sm text-red-700">❌ {result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================
// 탭 3: 미리보기 (빌드 결과를 Express로 서빙)
// =============================================
function PreviewTab({ project, status, statusLoading, refreshStatus }) {
  const [previewState, setPreviewState] = useState('idle'); // idle | building | waiting | ready | error
  const [errorMsg, setErrorMsg] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const previewUrl = `/api/projects/${project.name}/deploy/preview/index.html`;

  const buildAndPreview = async (cancelled = { current: false }) => {
    const MAX_WAIT_MS = 600000; // Fly shared-cpu 기준 빌드 3~6분 소요를 커버 (여유 포함 10분)
    const INTERVAL = 3000;
    const start = Date.now();
    setPreviewState('building');

    while (!cancelled.current) {
      try {
        const result = await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/build`, {
          method: 'POST',
        });
        if (cancelled.current) return;
        if (result.success) {
          setPreviewState('ready');
          refreshStatus?.();
        } else {
          setErrorMsg(result.message || result.error || '빌드 실패');
          setPreviewState('error');
        }
        return;
      } catch (e) {
        if (cancelled.current) return;
        if (e.status === 409 && Date.now() - start < MAX_WAIT_MS) {
          setPreviewState('waiting');
          await new Promise((r) => setTimeout(r, INTERVAL));
          // 같은 프로젝트 빌드가 방금 끝났다면 site/가 채워졌을 수 있음 →
          // status를 확인해 siteReady면 재빌드 없이 바로 미리보기로 진입.
          try {
            const s = await apiFetch(`/api/projects/${project.name}/deploy/status`);
            if (cancelled.current) return;
            if (s?.siteReady) {
              setPreviewState('ready');
              refreshStatus?.();
              return;
            }
          } catch { /* 확인 실패해도 계속 재시도 */ }
          continue;
        }
        setErrorMsg(e.message);
        setPreviewState('error');
        return;
      }
    }
  };

  useEffect(() => {
    if (statusLoading || !status?.tools?.node || !status?.tools?.npm || !status?.hasMkdocsYml) return;

    const cancelled = { current: false };
    // 사용자가 '새로고침'을 누르지 않았고 빌드된 사이트가 이미 있으면 불필요한 재빌드 생략
    if (retryCount === 0 && status.siteReady) {
      setPreviewState('ready');
    } else {
      buildAndPreview(cancelled);
    }
    return () => { cancelled.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, retryCount, statusLoading, status?.siteReady]);

  if (statusLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-gray-500 text-sm">상태 확인 중...</p>
      </div>
    );
  }

  if (!status?.tools?.node || !status?.tools?.npm) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">Node.js / npm이 설치되지 않았습니다. 관리자에게 문의하세요.</p>
      </div>
    );
  }

  if (!status?.hasMkdocsYml) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">먼저 "웹사이트" 탭에서 프로젝트를 생성하세요.</p>
      </div>
    );
  }

  if (previewState === 'building') {
    return (
      <div className="py-8 px-2">
        <BuildProgress
          label="미리보기 빌드 중"
          hint="Fly 환경에서는 보통 3~6분 걸립니다. 완료되면 자동으로 미리보기를 엽니다. 창을 닫지 마세요."
        />
      </div>
    );
  }

  if (previewState === 'waiting') {
    return (
      <div className="py-8 px-2">
        <BuildProgress
          label="다른 빌드가 진행 중"
          tone="amber"
          hint="기존 빌드가 끝나는 대로 자동으로 다시 시도합니다. 최대 10분까지 기다립니다."
        />
      </div>
    );
  }

  if (previewState === 'error') {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 text-sm mb-2">빌드 실패</p>
        <p className="text-gray-400 text-xs">{errorMsg}</p>
        <button
          onClick={() => { setErrorMsg(''); setRetryCount((c) => c + 1); }}
          className="mt-3 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (previewState === 'ready') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-green-600">
            빌드된 사이트 미리보기
          </span>
          <button
            onClick={() => setRetryCount((c) => c + 1)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            새로고침
          </button>
        </div>
        <iframe
          src={previewUrl}
          className="flex-1 w-full rounded-xl border border-gray-200"
          style={{ minHeight: '500px' }}
          title="웹사이트 미리보기"
        />
      </div>
    );
  }

  return null;
}
