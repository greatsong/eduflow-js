import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch, apiStreamPost } from '../api/client';

const TABS = ['💬 대화형 모드', '🤖 배치 자동화', '✏️ 챕터 편집'];

export default function ChapterCreation() {
  const { currentProject, refreshProgress } = useProjectStore();
  const [activeTab, setActiveTab] = useState(0);

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
        <h2 className="text-2xl font-bold text-gray-900">✍️ Step 4: 챕터 제작</h2>
        <p className="text-sm text-gray-500">대화형으로 챕터를 작성하거나, 여러 챕터를 자동으로 생성하세요.</p>
      </div>

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

      {/* 탭 내용 */}
      <div className="flex-1 min-h-0">
        {activeTab === 0 && <InteractiveTab project={currentProject} />}
        {activeTab === 1 && <BatchTab project={currentProject} onComplete={refreshProgress} />}
        {activeTab === 2 && <EditorTab project={currentProject} />}
      </div>
    </div>
  );
}

// =============================================
// 탭 1: 대화형 모드
// =============================================
function InteractiveTab({ project }) {
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [models, setModels] = useState([]);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/models').then((d) => {
      setModels(d.models);
      apiFetch('/api/models/default/conversation').then((r) => setModel(r.modelId)).catch(() => {});
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!project) return;
    apiFetch(`/api/projects/${project.name}/chapters`)
      .then((d) => setChapters(d.chapters || []))
      .catch(() => setChapters([]));
  }, [project]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSelectChapter = async (ch) => {
    setSelectedChapter(ch);
    setChatMessages([]);
    try {
      const data = await apiFetch(`/api/projects/${project.name}/chapters/${ch.chapter_id}`);
      setPreviewContent(data.content || '');
    } catch {
      setPreviewContent('');
    }
  };

  const handleSend = useCallback(async (e) => {
    e.preventDefault();
    const input = inputRef.current;
    const message = input?.value?.trim();
    if (!message || !selectedChapter || isStreaming) return;
    input.value = '';

    const userMsg = { role: 'user', content: message };
    const assistantMsg = { role: 'assistant', content: '' };
    setChatMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      await apiStreamPost(
        `/api/projects/${project.name}/chapters/${selectedChapter.chapter_id}/chat`,
        { message, model, messages: [...chatMessages, userMsg] },
        {
          onText: (text) => {
            setChatMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: updated[updated.length - 1].content + text,
              };
              return updated;
            });
          },
          onDone: () => setIsStreaming(false),
          onError: (err) => {
            setChatMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: updated[updated.length - 1].content + `\n\n❌ 오류: ${err.message}`,
              };
              return updated;
            });
            setIsStreaming(false);
          },
        }
      );
    } catch (err) {
      setChatMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `❌ 오류: ${err.message}`,
        };
        return updated;
      });
      setIsStreaming(false);
    }
  }, [project, selectedChapter, model, chatMessages, isStreaming]);

  // 마크다운 코드블록에서 챕터 내용 추출
  const extractMarkdown = (text) => {
    const match = text.match(/```markdown\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  };

  const handleApplyContent = () => {
    const lastAssistant = [...chatMessages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;
    const extracted = extractMarkdown(lastAssistant.content);
    if (extracted) {
      setPreviewContent(extracted);
    }
  };

  const handleSaveChapter = async () => {
    if (!selectedChapter || !previewContent) return;
    try {
      await apiFetch(`/api/projects/${project.name}/chapters/${selectedChapter.chapter_id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: previewContent }),
      });
      setChapters((prev) =>
        prev.map((ch) =>
          ch.chapter_id === selectedChapter.chapter_id ? { ...ch, has_content: true } : ch
        )
      );
    } catch (err) {
      alert(`저장 실패: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 상단: 챕터 선택 + 모델 */}
      <div className="flex items-center gap-3">
        <select
          value={selectedChapter?.chapter_id || ''}
          onChange={(e) => {
            const ch = chapters.find((c) => c.chapter_id === e.target.value);
            if (ch) handleSelectChapter(ch);
          }}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">📁 챕터를 선택하세요</option>
          {chapters.map((ch) => (
            <option key={ch.chapter_id} value={ch.chapter_id}>
              {ch.has_content ? '✅' : '⬜'} {ch.chapter_id}: {ch.chapter_title}
            </option>
          ))}
        </select>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {!selectedChapter ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          위에서 챕터를 선택하면 Claude와 대화하며 내용을 작성할 수 있습니다
        </div>
      ) : (
        <>
          {/* 2컬럼: 채팅 + 미리보기 */}
          <div className="flex-1 flex gap-4 min-h-0">
            {/* 채팅 */}
            <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200">
              <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">💬 Claude와 대화</span>
                <button
                  onClick={() => setChatMessages([])}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  초기화
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <p className="text-sm text-gray-400 text-center mt-8">
                    아래 입력창에 요청을 입력하세요
                  </p>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content + (isStreaming && i === chatMessages.length - 1 ? '▌' : '')}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSend} className="p-3 border-t border-gray-100">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="챕터 내용에 대해 요청하세요..."
                    disabled={isStreaming}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={isStreaming}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    전송
                  </button>
                </div>
              </form>
            </div>

            {/* 미리보기 */}
            <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200">
              <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">👁️ 미리보기</span>
                <span className="text-xs text-gray-400">
                  {previewContent ? `${previewContent.length.toLocaleString()}자` : ''}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {previewContent ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center mt-8">아직 작성된 내용이 없습니다</p>
                )}
              </div>
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleApplyContent}
              disabled={chatMessages.length === 0 || isStreaming}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              📥 응답 내용 적용
            </button>
            <button
              onClick={handleSaveChapter}
              disabled={!previewContent}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              💾 파일로 저장
            </button>
            {previewContent && (
              <span className="text-xs text-green-600">
                ✅ {previewContent.length.toLocaleString()}자 작성됨
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================
// 탭 2: 배치 자동화 모드
// =============================================
function BatchTab({ project, onComplete }) {
  const [chapters, setChapters] = useState([]);
  const [report, setReport] = useState(null);
  const [model, setModel] = useState('claude-opus-4-5-20251101');
  const [models, setModels] = useState([]);
  const [maxTokens, setMaxTokens] = useState(16000);
  const [concurrent, setConcurrent] = useState(3);
  const [tpmLimit, setTpmLimit] = useState(40000); // TPM 제한 (Tier 2 기본값)
  const [status, setStatus] = useState('idle'); // idle, running, completed
  const [logs, setLogs] = useState([]);
  const logEndRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/models').then((d) => {
      setModels(d.models);
      apiFetch('/api/models/default/generation').then((r) => setModel(r.modelId)).catch(() => {});
    }).catch(() => {});
  }, []);

  const loadChapters = useCallback(async () => {
    if (!project) return;
    try {
      const data = await apiFetch(`/api/projects/${project.name}/chapters`);
      setChapters(data.chapters || []);
      if (data.report) setReport(data.report);
    } catch { /* skip */ }
  }, [project]);

  useEffect(() => { loadChapters(); }, [loadChapters]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const totalChapters = chapters.length;
  const completedChapters = chapters.filter((ch) => ch.has_content).length;
  const remainingChapters = totalChapters - completedChapters;

  const handleGenerate = async (skipCompleted = true) => {
    setStatus('running');
    setLogs([]);
    setReport(null);

    try {
      await apiStreamPost(
        `/api/projects/${project.name}/chapters/generate-all`,
        { model, maxTokens, concurrent, skipCompleted, tpmLimit },
        {
          onProgress: (data) => {
            setLogs((prev) => [...prev, data.message]);
          },
          onDone: (data) => {
            if (data?.report) setReport(data.report);
            setStatus('completed');
            loadChapters();
            onComplete?.();
          },
          onError: (err) => {
            setLogs((prev) => [...prev, `❌ 오류: ${err.message}`]);
            setStatus('idle');
          },
        }
      );
    } catch (err) {
      setLogs((prev) => [...prev, `❌ 오류: ${err.message}`]);
      setStatus('idle');
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 설정 + 진행 상태 */}
      <div className="flex gap-4">
        {/* 설정 패널 */}
        <div className="w-72 bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h3 className="font-semibold text-gray-900 text-sm">⚙️ 배치 생성 설정</h3>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Claude 모델</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={status === 'running'}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">최대 토큰: {maxTokens.toLocaleString()}</label>
            <input
              type="range"
              min={4000}
              max={32000}
              step={1000}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              disabled={status === 'running'}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">동시 실행: {concurrent}개</label>
            <input
              type="range"
              min={1}
              max={10}
              value={concurrent}
              onChange={(e) => setConcurrent(Number(e.target.value))}
              disabled={status === 'running'}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              TPM 제한: {tpmLimit > 0 ? `${(tpmLimit / 1000).toFixed(0)}K/분` : '없음'}
            </label>
            <input
              type="range"
              min={0}
              max={200000}
              step={10000}
              value={tpmLimit}
              onChange={(e) => setTpmLimit(Number(e.target.value))}
              disabled={status === 'running'}
              className="w-full"
            />
            <p className="text-xs text-gray-400 mt-1">
              {tpmLimit === 0 ? '제한 없음 (rate limit 시 자동 재시도)' :
               tpmLimit <= 20000 ? 'Tier 1 (Free)' :
               tpmLimit <= 40000 ? 'Tier 2' :
               tpmLimit <= 80000 ? 'Tier 3' : 'Tier 4+'}
            </p>
          </div>

          {/* 생성 버튼 */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => handleGenerate(true)}
              disabled={status === 'running' || remainingChapters === 0}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {completedChapters > 0 && remainingChapters > 0
                ? `▶️ 이어서 생성 (${remainingChapters}개)`
                : '▶️ 전체 생성 시작'}
            </button>
            <button
              onClick={() => handleGenerate(false)}
              disabled={status === 'running'}
              className="w-full py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              🔁 처음부터 다시
            </button>
          </div>
        </div>

        {/* 목차 + 상태 */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">📋 목차 및 진행 상태</h3>

          {totalChapters === 0 ? (
            <p className="text-sm text-gray-400">목차가 없습니다. Step 2에서 먼저 목차를 생성하세요.</p>
          ) : (
            <>
              {/* 진행률 바 */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>완료: {completedChapters}/{totalChapters}개</span>
                  <span>{totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* 챕터 목록 */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {chapters.map((ch) => (
                  <div key={ch.chapter_id} className="flex items-center gap-2 text-sm py-1">
                    <span>{ch.has_content ? '✅' : '⬜'}</span>
                    <span className="text-gray-600">
                      {ch.chapter_id}: {ch.chapter_title}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={loadChapters}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                🔄 상태 새로고침
              </button>
            </>
          )}
        </div>
      </div>

      {/* 로그 */}
      {logs.length > 0 && (
        <div className="flex-1 min-h-0 bg-gray-900 rounded-xl p-4 overflow-y-auto font-mono text-xs text-gray-300">
          {logs.map((log, i) => (
            <div key={i} className="py-0.5">{log}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* 완료 리포트 */}
      {(status === 'completed' || report) && report && <ReportPanel report={report} />}
    </div>
  );
}

// =============================================
// 리포트 패널
// =============================================
function ReportPanel({ report }) {
  const cost = report.estimated_cost || {};
  // 이번 실행에서 시도한 개수 (전체 - 건너뜀)
  const attempted = (report.total || 0) - (report.skipped || 0);
  // 전체 완료 개수 (성공 + 건너뜀)
  const totalCompleted = (report.success || 0) + (report.skipped || 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 text-sm mb-3">🎉 생성 리포트</h3>

      <div className="grid grid-cols-5 gap-4 mb-4">
        <div className="text-center">
          <div className="text-xl font-bold text-green-600">{report.success}/{attempted}</div>
          <div className="text-xs text-gray-500">✅ 신규 성공</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-blue-600">{totalCompleted}/{report.total}</div>
          <div className="text-xs text-gray-500">📊 전체 완료</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-700">{report.elapsed_time?.toFixed(1)}초</div>
          <div className="text-xs text-gray-500">⏱️ 소요 시간</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-700">{(report.total_tokens || 0).toLocaleString()}</div>
          <div className="text-xs text-gray-500">🪙 총 토큰</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-amber-600">~${cost.total_cost?.toFixed(4) || '0'}</div>
          <div className="text-xs text-gray-500">💰 추정 비용</div>
        </div>
      </div>

      {/* 비용 상세 */}
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">💰 비용 상세 보기</summary>
        <div className="mt-2 p-3 bg-gray-50 rounded-lg">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b"><th className="py-1">항목</th><th>토큰 수</th><th>추정 비용</th></tr>
            </thead>
            <tbody>
              <tr><td className="py-1">입력</td><td>{(report.total_input_tokens || 0).toLocaleString()}</td><td>${cost.input_cost?.toFixed(4) || '0'}</td></tr>
              <tr><td className="py-1">출력</td><td>{(report.total_output_tokens || 0).toLocaleString()}</td><td>${cost.output_cost?.toFixed(4) || '0'}</td></tr>
              <tr className="font-medium border-t"><td className="py-1">합계</td><td>{(report.total_tokens || 0).toLocaleString()}</td><td>~${cost.total_cost?.toFixed(4) || '0'}</td></tr>
            </tbody>
          </table>
        </div>
      </details>

      {/* 에러 목록 */}
      {report.errors?.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-medium text-red-600 mb-2">❌ 실패한 챕터</h4>
          {report.errors.map((err, i) => (
            <div key={i} className="text-xs text-red-500 py-1">
              {err.chapter_id}: {err.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================
// 탭 3: 챕터 편집
// =============================================
function EditorTab({ project }) {
  const [chapters, setChapters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!project) return;
    apiFetch(`/api/projects/${project.name}/chapters`)
      .then((d) => {
        const chs = (d.chapters || []).filter((ch) => ch.has_content);
        setChapters(chs);
        if (chs.length > 0 && !selectedId) {
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
      setSavedContent(data.content || '');
    } catch {
      setContent('');
      setSavedContent('');
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      await apiFetch(`/api/projects/${project.name}/chapters/${selectedId}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
      setSavedContent(content);
    } catch (err) {
      alert(`저장 실패: ${err.message}`);
    }
  };

  const hasChanges = content !== savedContent;

  if (chapters.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">생성된 챕터가 없습니다. 대화형 또는 배치 모드에서 먼저 챕터를 생성하세요.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      {/* 챕터 목록 사이드바 */}
      <div className="w-56 bg-white rounded-xl border border-gray-200 p-3 flex flex-col">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">📑 챕터 목록</h3>
        <div className="flex-1 overflow-y-auto space-y-1">
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
              {ch.chapter_id}
              <div className="text-xs text-gray-400 truncate">{ch.chapter_title}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 편집 영역 */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200">
        {/* 툴바 */}
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">
              {selectedId || '챕터 선택'}
            </span>
            {hasChanges && <span className="text-xs text-amber-600">⚠️ 변경사항 있음</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`px-3 py-1 text-xs rounded-lg border ${
                showPreview ? 'bg-blue-50 text-blue-600 border-blue-200' : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {showPreview ? '📝 편집' : '👁️ 미리보기'}
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              💾 저장
            </button>
          </div>
        </div>

        {/* 내용 */}
        <div className="flex-1 min-h-0">
          {showPreview ? (
            <div className="h-full overflow-y-auto p-6">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full p-4 text-sm font-mono resize-none border-none outline-none"
              placeholder="마크다운 내용..."
            />
          )}
        </div>

        {/* 통계 바 */}
        <div className="p-2 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
          <span>📊 {content.length.toLocaleString()}자</span>
          <span>{(content.match(/\n/g) || []).length + 1}줄</span>
          <span>{Math.floor((content.match(/```/g) || []).length / 2)} 코드블록</span>
        </div>
      </div>
    </div>
  );
}
