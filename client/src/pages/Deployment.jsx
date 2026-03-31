import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch } from '../api/client';
// 로컬 버전: 사용자 인증 없음 (웹 배포 버전에서는 EntryForm에서 import)
const getUserInfo = () => null;

const TABS = ['🌐 MkDocs 웹사이트', '📄 DOCX 문서', '🔍 미리보기'];

export default function Deployment() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const [activeTab, setActiveTab] = useState(0);
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    if (!currentProject) return;
    setStatusLoading(true);
    apiFetch(`/api/projects/${currentProject.name}/deploy/status`)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setStatusLoading(false));
  }, [currentProject]);

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
      {statusLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
          <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          배포 도구 상태 확인 중...
        </div>
      )}
      {status?.tools && (
        <div className="mb-4 flex items-center gap-4 text-xs text-gray-500">
          <span>도구 상태:</span>
          <span className={status.tools.mkdocs ? 'text-green-600' : 'text-red-500'}>
            {status.tools.mkdocs ? '✅' : '❌'} mkdocs
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
          <span className="ml-auto">📁 챕터: {status.chapterCount ?? 0}개</span>
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
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 0 && <MkDocsTab project={currentProject} status={status} statusLoading={statusLoading} />}
        {activeTab === 1 && <DocxTab project={currentProject} status={status} statusLoading={statusLoading} />}
        {activeTab === 2 && <PreviewTab project={currentProject} status={status} statusLoading={statusLoading} />}
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
// 탭 1: MkDocs 웹사이트
// =============================================
// 레포 이름 추천 함수
function suggestRepoNames(projectName) {
  const sanitize = (name) =>
    name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const suggestions = [];

  // 1. 프로젝트 이름 그대로 (30자 이하)
  if (projectName && projectName.length <= 30) {
    suggestions.push(sanitize(projectName));
  }

  // 2. 날짜 접미사 제거 (-260207 등)
  const withoutDate = projectName.replace(/-\d{6}$/, '');
  if (withoutDate !== projectName && withoutDate.length >= 3) {
    suggestions.push(sanitize(withoutDate));
  }

  // 3. 숫자 접미사 제거 (-000 등)
  const withoutNum = projectName.replace(/-\d+$/, '');
  if (withoutNum !== projectName && withoutNum !== withoutDate && withoutNum.length >= 3) {
    suggestions.push(sanitize(withoutNum));
  }

  // 4. 너무 길면 첫 2~3 세그먼트만
  if (projectName.length > 30) {
    const segments = projectName.split('-');
    if (segments.length > 2) {
      suggestions.push(sanitize(segments.slice(0, 3).join('-')));
      suggestions.push(sanitize(segments.slice(0, 2).join('-')));
    }
  }

  // 5. -book 또는 -course 변형
  const base = sanitize(withoutDate.length >= 3 ? withoutDate : projectName);
  if (base.length <= 20 && !base.includes('book') && !base.includes('course')) {
    suggestions.push(`${base}-book`);
  }

  // 중복 제거 + 빈 문자열 제거 + 최대 3개
  return [...new Set(suggestions)].filter(Boolean).slice(0, 3);
}

const COLOR_THEMES = [
  { id: 'indigo', label: '인디고/퍼플', primary: 'indigo', accent: 'deep purple', colors: ['#4f46e5', '#7c3aed'], desc: '고급스럽고 세련된' },
  { id: 'teal', label: '에메랄드/틸', primary: 'teal', accent: 'green', colors: ['#0d9488', '#10b981'], desc: '자연적이고 차분한' },
  { id: 'amber', label: '앰버/오렌지', primary: 'deep orange', accent: 'amber', colors: ['#ea580c', '#f59e0b'], desc: '따뜻하고 친근한' },
  { id: 'blue', label: '블루/스카이', primary: 'blue', accent: 'cyan', colors: ['#2563eb', '#0ea5e9'], desc: '신뢰감 있는 클래식' },
  { id: 'rose', label: '로즈/핑크', primary: 'pink', accent: 'red', colors: ['#e11d48', '#f43f5e'], desc: '부드럽고 감성적인' },
];

function MkDocsTab({ project, status, statusLoading }) {
  const [siteName, setSiteName] = useState('');
  const [theme, setTheme] = useState('material');
  const [colorTheme, setColorTheme] = useState('indigo');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [repoName, setRepoName] = useState('');
  const [deployResult, setDeployResult] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const deployResultRef = useRef(null);

  useEffect(() => {
    // TOC에서 제목 가져오기
    apiFetch(`/api/projects/${project.name}/toc`)
      .then((d) => setSiteName(d.toc?.title || '교육자료'))
      .catch(() => setSiteName('교육자료'));

    // 레포 이름 추천 생성
    const names = suggestRepoNames(project.name);
    setSuggestions(names);
    if (!repoName && names.length > 0) {
      setRepoName(names[0]);
    }
  }, [project]);

  const handleGenerateConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const user = getUserInfo();
      const creator = user ? { name: user.name, affiliation: user.affiliation } : null;
      const result = await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/config`, {
        method: 'POST',
        body: JSON.stringify({ siteName, theme, colorTheme, creator }),
      });
      setMessage(result.success
        ? { type: 'success', text: '✅ MkDocs 설정 생성 완료!' }
        : { type: 'error', text: result.message });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  };

  const handleBuild = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/build`, {
        method: 'POST',
      });
      setMessage(result.success
        ? { type: 'success', text: '✅ 웹사이트 빌드 완료!' }
        : { type: 'error', text: result.message || result.error });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  };

  const handleDeploy = async () => {
    if (!repoName.trim()) return;
    setLoading(true);
    setDeployResult(null);
    try {
      const user = getUserInfo();
      const creator = user ? { name: user.name, affiliation: user.affiliation } : null;
      const result = await apiFetch(`/api/projects/${project.name}/deploy/github`, {
        method: 'POST',
        body: JSON.stringify({ repoName: repoName.trim(), creator }),
      });
      setDeployResult(result);
      setTimeout(() => deployResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    } catch (e) {
      setDeployResult({ success: false, message: e.message });
      setTimeout(() => deployResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
    setLoading(false);
  };

  if (statusLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-gray-500 text-sm">배포 도구 상태 확인 중...</p>
      </div>
    );
  }

  if (!status?.tools?.mkdocs) {
    return (
      <div className="bg-amber-50 rounded-xl p-6">
        <h3 className="font-semibold text-amber-800 mb-2">MkDocs가 설치되지 않았습니다</h3>
        <p className="text-sm text-amber-700 mb-3">
          MkDocs를 설치하면 마크다운을 아름다운 웹사이트로 변환할 수 있습니다.
        </p>
        <code className="block bg-amber-100 p-3 rounded text-sm text-amber-900">
          pip install mkdocs mkdocs-material
        </code>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 설정 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">🔧 MkDocs 설정</h3>
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
          disabled={loading}
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-sm"
        >
          {loading ? '생성 중...' : '🔨 MkDocs 프로젝트 생성'}
        </button>

        {message && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
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
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '빌드 중...' : '📦 빌드'}
          </button>
        </div>
      )}

      {/* GitHub Pages */}
      {status?.hasMkdocsYml && status?.tools?.gh && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">🚀 GitHub Pages 배포</h3>
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-sm text-blue-800">
              에듀플로 웹 버전으로 만든 교육자료는 <strong>greatsong</strong>의 GitHub에 함께 배포됩니다.
              제작자 정보(이름, 소속)가 사이트 푸터와 README에 자동으로 표시됩니다.
              <br /><span className="text-blue-600">(로컬 버전은 선생님의 GitHub를 통해 배포됩니다)</span>
            </p>
          </div>
          {status.ghUser ? (
            <>
              <p className="text-sm text-gray-500 mb-3">
                ✅ GitHub 로그인됨: @{status.ghUser}
              </p>
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
                              ? 'bg-blue-100 border-blue-300 text-blue-700'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* URL 미리보기 */}
                  {repoName && status?.ghUser && (
                    <p className="text-xs text-gray-400 mt-1">
                      🌐 https://{status.ghUser}.github.io/{repoName}/
                    </p>
                  )}
                </div>
                <button
                  onClick={handleDeploy}
                  disabled={loading || !repoName.trim()}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 min-w-[100px]"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      배포 중...
                    </span>
                  ) : '🚀 배포'}
                </button>
              </div>
              {loading && !deployResult && (
                <div className="mt-4 p-4 rounded-xl border-2 border-blue-200 bg-blue-50">
                  <div className="flex items-center gap-3">
                    <span className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <div>
                      <p className="font-semibold text-blue-800">GitHub Pages 배포 진행 중...</p>
                      <p className="text-xs text-blue-600 mt-1">리포지토리 생성 → 빌드 → 배포까지 1~2분 정도 걸립니다. 이 화면을 유지해주세요.</p>
                    </div>
                  </div>
                </div>
              )}
              {deployResult && (
                <div ref={deployResultRef} className={`mt-4 p-4 rounded-xl border-2 ${deployResult.success ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                  {deployResult.success ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-green-800">✅ 배포 완료!</p>
                        <a href={deployResult.site_url} target="_blank" rel="noopener noreferrer"
                          className="text-green-700 underline font-medium text-sm">
                          🌐 {deployResult.site_url}
                        </a>
                      </div>
                      <a href={deployResult.site_url} target="_blank" rel="noopener noreferrer"
                        className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 whitespace-nowrap">
                        사이트 열기 →
                      </a>
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
          ) : (
            <p className="text-sm text-amber-600">
              ⚠️ GitHub 로그인이 필요합니다. <code>gh auth login</code> 실행 후 새로고침하세요.
            </p>
          )}
        </div>
      )}

    </div>
  );
}

// =============================================
// 탭 2: DOCX 문서
// =============================================
function DocxTab({ project, status, statusLoading }) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    apiFetch(`/api/projects/${project.name}/toc`)
      .then((d) => setTitle(d.toc?.title || '교육자료'))
      .catch(() => setTitle('교육자료'));
  }, [project]);

  if (statusLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
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
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch(`/api/projects/${project.name}/deploy/docx`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      setResult(res);
    } catch (e) {
      setResult({ success: false, message: e.message });
    }
    setLoading(false);
  };

  const handleDownload = () => {
    const url = `/api/projects/${project.name}/deploy/docx/download`;
    window.open(url, '_blank');
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
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '생성 중...' : '📝 DOCX 생성'}
          </button>
        </div>

        {(status?.chapterCount || 0) === 0 && (
          <p className="text-sm text-amber-600">⚠️ 챕터가 없습니다. Step 4에서 챕터를 먼저 생성하세요.</p>
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
function PreviewTab({ project, status, statusLoading }) {
  const [previewState, setPreviewState] = useState('idle'); // idle | building | ready | error
  const [errorMsg, setErrorMsg] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const previewUrl = `/api/projects/${project.name}/deploy/preview/index.html`;

  const buildAndPreview = async (cancelled = { current: false }) => {
    setPreviewState('building');
    try {
      const result = await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/build`, {
        method: 'POST',
      });

      if (cancelled.current) return;

      if (result.success) {
        setPreviewState('ready');
      } else {
        setErrorMsg(result.message || result.error || '빌드 실패');
        setPreviewState('error');
      }
    } catch (e) {
      if (!cancelled.current) {
        setErrorMsg(e.message);
        setPreviewState('error');
      }
    }
  };

  useEffect(() => {
    if (statusLoading || !status?.tools?.mkdocs || !status?.hasMkdocsYml) return;

    const cancelled = { current: false };
    buildAndPreview(cancelled);
    return () => { cancelled.current = true; };
  }, [project, retryCount, statusLoading]);

  if (statusLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-gray-500 text-sm">상태 확인 중...</p>
      </div>
    );
  }

  if (!status?.tools?.mkdocs) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">MkDocs가 설치되지 않았습니다.</p>
      </div>
    );
  }

  if (!status?.hasMkdocsYml) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">먼저 "MkDocs 웹사이트" 탭에서 MkDocs 프로젝트를 생성하세요.</p>
      </div>
    );
  }

  if (previewState === 'building') {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-gray-500 text-sm">MkDocs 빌드 중...</p>
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
          className="mt-3 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
          title="MkDocs Preview"
        />
      </div>
    );
  }

  return null;
}
