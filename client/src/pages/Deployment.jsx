import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch } from '../api/client';

const TABS = ['🌐 MkDocs 웹사이트', '📄 DOCX 문서', '🔍 미리보기'];

export default function Deployment() {
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
        {activeTab === 0 && <MkDocsTab project={currentProject} status={status} />}
        {activeTab === 1 && <DocxTab project={currentProject} status={status} />}
        {activeTab === 2 && <PreviewTab project={currentProject} />}
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

  useEffect(() => {
    // TOC에서 제목 가져오기
    apiFetch(`/api/projects/${project.name}/toc`)
      .then((d) => setSiteName(d.toc?.title || '교육자료'))
      .catch(() => setSiteName('교육자료'));
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
    } catch (e) {
      setDeployResult({ success: false, message: e.message });
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
          🔨 MkDocs 프로젝트 생성
        </button>
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
                </div>
                <button
                  onClick={handleDeploy}
                  disabled={loading || !repoName.trim()}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  🚀 배포
                </button>
              </div>
              {deployResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${deployResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {deployResult.success ? (
                    <>
                      <p>✅ 배포 완료!</p>
                      <a href={deployResult.site_url} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        🌐 {deployResult.site_url}
                      </a>
                    </>
                  ) : (
                    <p>❌ {deployResult.message}</p>
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

      {/* 메시지 */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
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
// 탭 3: 미리보기
// =============================================
function PreviewTab({ project }) {
  const [chapters, setChapters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [content, setContent] = useState('');

  useEffect(() => {
    apiFetch(`/api/projects/${project.name}/chapters`)
      .then((d) => {
        const chs = (d.chapters || []).filter((ch) => ch.has_content);
        setChapters(chs);
        if (chs.length > 0) {
          loadChapter(chs[0].chapter_id);
        }
      })
      .catch(() => setChapters([]));
  }, [project]);

  const loadChapter = async (chapterId) => {
    setSelectedId(chapterId);
    try {
      const data = await apiFetch(`/api/projects/${project.name}/chapters/${chapterId}`);
      setContent(data.content || '');
    } catch {
      setContent('');
    }
  };

  if (chapters.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">생성된 챕터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      {/* 챕터 선택 */}
      <div className="w-52 bg-white rounded-xl border border-gray-200 p-3">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">📑 챕터</h3>
        <div className="space-y-1">
          {chapters.map((ch) => (
            <button
              key={ch.chapter_id}
              onClick={() => loadChapter(ch.chapter_id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedId === ch.chapter_id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="truncate">{ch.chapter_title}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 미리보기 */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6 overflow-y-auto">
        {content ? (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-gray-400 text-sm text-center mt-8">챕터를 선택하세요</p>
        )}
      </div>
    </div>
  );
}
