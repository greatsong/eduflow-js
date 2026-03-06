import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch } from '../api/client';

const TABS = ['⭐ Starlight 웹사이트', '🌐 MkDocs 웹사이트', '📄 DOCX 문서', '🔍 미리보기'];

export default function Deployment() {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const [activeTab, setActiveTab] = useState(0);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!currentProject) return;
    apiFetch(`/api/projects/${currentProject.name}/deploy/status`)
      .then(setStatus)
      .catch(() => setStatus(null));
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
      {status && (
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
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 0 && <StarlightTab project={currentProject} status={status} />}
        {activeTab === 1 && <MkDocsTab project={currentProject} status={status} />}
        {activeTab === 2 && <DocxTab project={currentProject} status={status} />}
        {activeTab === 3 && <PreviewTab project={currentProject} status={status} />}
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
// 탭 0: Starlight 웹사이트
// =============================================

// 레포 이름 추천 함수 (공용)
function suggestRepoNames(projectName) {
  const sanitize = (name) =>
    name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const suggestions = [];

  if (projectName && projectName.length <= 30) {
    suggestions.push(sanitize(projectName));
  }

  const withoutDate = projectName.replace(/-\d{6}$/, '');
  if (withoutDate !== projectName && withoutDate.length >= 3) {
    suggestions.push(sanitize(withoutDate));
  }

  const withoutNum = projectName.replace(/-\d+$/, '');
  if (withoutNum !== projectName && withoutNum !== withoutDate && withoutNum.length >= 3) {
    suggestions.push(sanitize(withoutNum));
  }

  if (projectName.length > 30) {
    const segments = projectName.split('-');
    if (segments.length > 2) {
      suggestions.push(sanitize(segments.slice(0, 3).join('-')));
      suggestions.push(sanitize(segments.slice(0, 2).join('-')));
    }
  }

  const base = sanitize(withoutDate.length >= 3 ? withoutDate : projectName);
  if (base.length <= 20 && !base.includes('book') && !base.includes('course')) {
    suggestions.push(`${base}-book`);
  }

  return [...new Set(suggestions)].filter(Boolean).slice(0, 3);
}

function StarlightTab({ project, status }) {
  const [siteName, setSiteName] = useState('');
  const [repoName, setRepoName] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);

  useEffect(() => {
    apiFetch(`/api/projects/${project.name}/toc`)
      .then((d) => setSiteName(d.toc?.title || '교육자료'))
      .catch(() => setSiteName('교육자료'));

    const names = suggestRepoNames(project.name);
    setSuggestions(names);
    if (!repoName && names.length > 0) setRepoName(names[0]);
  }, [project]);

  const handleOneDeploy = async () => {
    if (!repoName.trim()) return;
    setLoading(true);
    setResult(null);
    setStep('프로젝트 생성 → 의존성 설치 → 빌드 → 배포');

    try {
      const res = await apiFetch(`/api/projects/${project.name}/deploy/starlight/github`, {
        method: 'POST',
        body: JSON.stringify({ siteName, repoName: repoName.trim() }),
      });
      setResult(res);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    } catch (e) {
      setResult({ success: false, message: e.message });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
    setStep('');
    setLoading(false);
  };

  const handleBuildOnly = async () => {
    setLoading(true);
    setResult(null);

    try {
      setStep('프로젝트 생성');
      await apiFetch(`/api/projects/${project.name}/deploy/starlight/config`, {
        method: 'POST',
        body: JSON.stringify({ siteName, repoName: repoName.trim() }),
      });

      setStep('의존성 설치');
      await apiFetch(`/api/projects/${project.name}/deploy/starlight/install`, {
        method: 'POST',
      });

      setStep('빌드');
      const buildRes = await apiFetch(`/api/projects/${project.name}/deploy/starlight/build`, {
        method: 'POST',
      });

      setResult(buildRes.success
        ? { success: true, buildOnly: true, message: '빌드 완료! 미리보기 탭에서 확인하세요.' }
        : { success: false, message: buildRes.message }
      );
    } catch (e) {
      setResult({ success: false, message: e.message });
    }
    setStep('');
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-5">
        <h3 className="font-semibold text-indigo-900 mb-1">⭐ Astro Starlight</h3>
        <p className="text-sm text-indigo-700 mb-4">
          최신 문서 프레임워크로 검색, 다크모드, 반응형이 기본 제공됩니다.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">사이트 제목</label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">저장소 이름</label>
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="my-education-site"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {suggestions.length > 0 && (
              <div className="flex gap-2 mt-2 items-center">
                <span className="text-xs text-gray-400">추천:</span>
                {suggestions.map((name) => (
                  <button
                    key={name}
                    onClick={() => setRepoName(name)}
                    className={`px-2.5 py-0.5 text-xs rounded-full border transition-colors ${
                      repoName === name
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {repoName && status?.ghUser && (
          <p className="text-xs text-indigo-500 mb-4">
            🌐 https://{status.ghUser}.github.io/{repoName}/
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleOneDeploy}
            disabled={loading || !repoName.trim() || !status?.tools?.gh || !status?.ghUser}
            className="px-5 py-2.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                배포 중...
              </span>
            ) : '⭐ Starlight로 배포'}
          </button>
          <button
            onClick={handleBuildOnly}
            disabled={loading}
            className="px-4 py-2.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            📦 빌드만
          </button>
        </div>

        {loading && step && (
          <div className="mt-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
            <div className="flex items-center gap-3">
              <span className="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-indigo-700 font-medium">{step}...</span>
            </div>
          </div>
        )}

        {result && (
          <div ref={resultRef} className={`mt-4 p-4 rounded-xl border-2 ${result.success ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
            {result.success ? (
              result.buildOnly ? (
                <p className="text-sm text-green-700 font-medium">✅ {result.message}</p>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-green-800">✅ Starlight 배포 완료!</p>
                    <a href={result.site_url} target="_blank" rel="noopener noreferrer"
                      className="text-green-700 underline font-medium text-sm">
                      🌐 {result.site_url}
                    </a>
                    <p className="text-xs text-gray-500 mt-1">GitHub Pages 반영까지 1~2분 소요될 수 있습니다.</p>
                  </div>
                  <a href={result.site_url} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 whitespace-nowrap">
                    사이트 열기 →
                  </a>
                </div>
              )
            ) : (
              <div>
                <p className="font-semibold text-red-800">❌ 실패</p>
                <p className="text-sm text-red-700 mt-1">{result.message}</p>
              </div>
            )}
          </div>
        )}

        {!status?.ghUser && (
          <p className="mt-3 text-sm text-amber-600">
            ⚠️ GitHub 배포에는 로그인이 필요합니다. <code className="bg-amber-100 px-1 rounded">gh auth login</code>
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================
// 탭 1: MkDocs 웹사이트
// =============================================
function MkDocsTab({ project, status }) {
  const [siteName, setSiteName] = useState('');
  const [theme, setTheme] = useState('material');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [repoName, setRepoName] = useState('');
  const [deployResult, setDeployResult] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const deployResultRef = useRef(null);

  useEffect(() => {
    apiFetch(`/api/projects/${project.name}/toc`)
      .then((d) => setSiteName(d.toc?.title || '교육자료'))
      .catch(() => setSiteName('교육자료'));

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
      const result = await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/config`, {
        method: 'POST',
        body: JSON.stringify({ siteName, theme }),
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

  const handleServe = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/serve`, {
        method: 'POST',
        body: JSON.stringify({ port: 8000 }),
      });
      if (result.success) {
        setMessage({ type: 'success', text: `✅ 서버 실행됨! 브라우저에서 ${result.url} 을 열어주세요 (PID: ${result.pid})` });
      } else {
        setMessage({ type: 'error', text: result.message });
      }
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
      const result = await apiFetch(`/api/projects/${project.name}/deploy/github`, {
        method: 'POST',
        body: JSON.stringify({ repoName: repoName.trim() }),
      });
      setDeployResult(result);
      setTimeout(() => deployResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    } catch (e) {
      setDeployResult({ success: false, message: e.message });
      setTimeout(() => deployResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
    setLoading(false);
  };

  if (!status?.tools?.mkdocs) {
    return (
      <div className="bg-amber-50 rounded-xl p-6">
        <h3 className="font-semibold text-amber-800 mb-2">⚠️ MkDocs가 설치되지 않았습니다</h3>
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
          <div className="w-48">
            <label className="block text-xs text-gray-500 mb-1">테마</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="material">Material (추천)</option>
              <option value="readthedocs">Read the Docs</option>
              <option value="mkdocs">MkDocs 기본</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerateConfig}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '생성 중...' : '🔨 MkDocs 프로젝트 생성'}
        </button>

        {message && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}
      </div>

      {/* 빌드 & 미리보기 */}
      {status?.hasMkdocsYml && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">📋 빌드 & 미리보기</h3>
          <div className="flex gap-3">
            <button
              onClick={handleServe}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              🔍 로컬 미리보기
            </button>
            <button
              onClick={handleBuild}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              📦 빌드
            </button>
          </div>
        </div>
      )}

      {/* GitHub Pages */}
      {status?.hasMkdocsYml && status?.tools?.gh && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">🚀 GitHub Pages 배포</h3>
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
function DocxTab({ project, status }) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    apiFetch(`/api/projects/${project.name}/toc`)
      .then((d) => setTitle(d.toc?.title || '교육자료'))
      .catch(() => setTitle('교육자료'));
  }, [project]);

  if (!status?.tools?.pandoc) {
    return (
      <div className="bg-amber-50 rounded-xl p-6">
        <h3 className="font-semibold text-amber-800 mb-2">⚠️ Pandoc이 설치되지 않았습니다</h3>
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
// 탭 3: 미리보기 (Starlight / MkDocs 자동 선택)
// =============================================
function PreviewTab({ project, status }) {
  const [serveState, setServeState] = useState('idle');
  const [serveUrl, setServeUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [engine, setEngine] = useState('auto');

  const effectiveEngine = engine === 'auto'
    ? (status?.hasStarlightDist ? 'starlight' : 'mkdocs')
    : engine;

  const startServe = async (cancelled = { current: false }) => {
    setServeState('starting');
    try {
      if (effectiveEngine === 'starlight') {
        const result = await apiFetch(`/api/projects/${project.name}/deploy/starlight/serve`, {
          method: 'POST',
          body: JSON.stringify({ port: 4321 }),
        });
        if (cancelled.current) return;
        if (result.success) {
          await new Promise((r) => setTimeout(r, 2000));
          setServeUrl(result.url);
          setServeState('running');
        } else {
          setErrorMsg(result.message || '서버 실행 실패');
          setServeState('error');
        }
      } else {
        await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/build`, { method: 'POST' });
        if (cancelled.current) return;

        const result = await apiFetch(`/api/projects/${project.name}/deploy/mkdocs/serve`, {
          method: 'POST',
          body: JSON.stringify({ port: 8000 }),
        });
        if (cancelled.current) return;
        if (result.success) {
          await new Promise((r) => setTimeout(r, 2000));
          setServeUrl(result.url);
          setServeState('running');
        } else {
          setErrorMsg(result.message || '서버 실행 실패');
          setServeState('error');
        }
      }
    } catch (e) {
      if (!cancelled.current) {
        setErrorMsg(e.message);
        setServeState('error');
      }
    }
  };

  const hasAnyPreview = status?.hasStarlightDist || (status?.tools?.mkdocs && status?.hasMkdocsYml);

  useEffect(() => {
    if (!hasAnyPreview) return;
    const cancelled = { current: false };
    startServe(cancelled);
    return () => { cancelled.current = true; };
  }, [project, retryCount, effectiveEngine]);

  if (!hasAnyPreview) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">
          미리보기를 사용하려면 Starlight 빌드 또는 MkDocs 프로젝트가 필요합니다.
        </p>
      </div>
    );
  }

  if (serveState === 'starting') {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-gray-500 text-sm">
          {effectiveEngine === 'starlight' ? 'Starlight' : 'MkDocs'} 서버 시작 중...
        </p>
      </div>
    );
  }

  if (serveState === 'error') {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 text-sm mb-2">서버 실행 실패</p>
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

  if (serveState === 'running' && serveUrl) {
    const bothAvailable = status?.hasStarlightDist && status?.tools?.mkdocs && status?.hasMkdocsYml;

    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-green-600">
              {effectiveEngine === 'starlight' ? '⭐ Starlight' : '🌐 MkDocs'} 서버: {serveUrl}
            </span>
            {bothAvailable && (
              <select
                value={engine}
                onChange={(e) => { setEngine(e.target.value); setServeState('idle'); setRetryCount((c) => c + 1); }}
                className="text-xs border border-gray-300 rounded px-2 py-0.5 bg-white"
              >
                <option value="auto">자동</option>
                <option value="starlight">Starlight</option>
                <option value="mkdocs">MkDocs</option>
              </select>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setRetryCount((c) => c + 1)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              새로고침
            </button>
            <a href={serveUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline">
              새 탭에서 열기 →
            </a>
          </div>
        </div>
        <iframe
          src={serveUrl}
          className="flex-1 w-full rounded-xl border border-gray-200"
          title="Preview"
        />
      </div>
    );
  }

  return null;
}
