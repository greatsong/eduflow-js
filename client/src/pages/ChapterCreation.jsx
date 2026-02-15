import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
// 헬퍼: 챕터를 파트별로 그룹화
// =============================================
function groupChaptersByPart(chapters) {
  const parts = {};
  for (const ch of chapters) {
    const key = ch.part_number || 0;
    if (!parts[key]) {
      parts[key] = { part_number: ch.part_number, part_title: ch.part_title, chapters: [] };
    }
    parts[key].chapters.push(ch);
  }
  return Object.values(parts).sort((a, b) => (a.part_number || 0) - (b.part_number || 0));
}

// =============================================
// 챕터 상태 아이콘 (애니메이션 포함)
// =============================================
function ChapterStatusIcon({ hasContent, isGenerating }) {
  if (hasContent) return <span title="완료">✅</span>;
  if (isGenerating) {
    return (
      <span className="relative flex h-3 w-3" title="생성 중...">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
      </span>
    );
  }
  return <span className="inline-flex h-3 w-3 rounded-full border-2 border-gray-300" title="대기 중" />;
}

// =============================================
// 파트별 챕터 진행 상태 목록
// =============================================
function ChapterProgressList({ chapters, currentGenerating, status, selectedChapters, onToggleSelect, onRegenerate, onSelectAll }) {
  const parts = groupChaptersByPart(chapters);
  const [collapsedParts, setCollapsedParts] = useState({});

  const togglePart = (partNum) => {
    setCollapsedParts((prev) => ({ ...prev, [partNum]: !prev[partNum] }));
  };

  const selectedCount = selectedChapters?.size || 0;
  const allSelected = chapters.length > 0 && selectedCount === chapters.length;

  return (
    <div className="flex flex-col h-full">
      {/* 전체 선택 */}
      {status !== 'running' && chapters.length > 0 && (
        <div className="flex items-center gap-2 pb-2 mb-1 border-b border-gray-100 flex-shrink-0">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onSelectAll?.(!allSelected)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
          />
          <span className="text-xs text-gray-500">
            {allSelected ? '전체 해제' : '전체 선택'} ({selectedCount}/{chapters.length})
          </span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto space-y-2">
        {parts.map((part) => {
          const partCompleted = part.chapters.filter((ch) => ch.has_content).length;
          const partTotal = part.chapters.length;
          const isCollapsed = collapsedParts[part.part_number];

          return (
            <div key={part.part_number} className="border border-gray-100 rounded-lg">
              <button
                onClick={() => togglePart(part.part_number)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 rounded-t-lg"
              >
                <span className="text-xs text-gray-400">{isCollapsed ? '▶' : '▼'}</span>
                <span className="font-medium text-gray-700 truncate">
                  Part {part.part_number}: {part.part_title}
                </span>
                <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                  {partCompleted}/{partTotal}
                </span>
                <div className="w-16 bg-gray-200 rounded-full h-1.5 flex-shrink-0">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${partTotal > 0 ? (partCompleted / partTotal) * 100 : 0}%` }}
                  />
                </div>
              </button>

              {!isCollapsed && (
                <div className="px-3 pb-2 space-y-0.5">
                  {part.chapters.map((ch) => {
                    const isGenerating = status === 'running' && currentGenerating?.has(ch.chapter_id);
                    const isSelected = selectedChapters?.has(ch.chapter_id);
                    return (
                      <div
                        key={ch.chapter_id}
                        onClick={() => status !== 'running' && onToggleSelect?.(ch.chapter_id)}
                        className={`flex items-center gap-2 text-sm py-1 px-2 rounded cursor-pointer transition-colors ${
                          isGenerating ? 'bg-blue-50' : isSelected ? 'bg-amber-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        {status !== 'running' && (
                          <input
                            type="checkbox"
                            checked={isSelected || false}
                            onChange={() => onToggleSelect?.(ch.chapter_id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 flex-shrink-0"
                          />
                        )}
                        <ChapterStatusIcon hasContent={ch.has_content} isGenerating={isGenerating} />
                        <span className={`truncate ${isGenerating ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>
                          {ch.chapter_id}: {ch.chapter_title}
                        </span>
                        {ch.estimated_time && (
                          <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">{ch.estimated_time}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 선택된 챕터 재생성 버튼 */}
      {selectedCount > 0 && status !== 'running' && (
        <div className="pt-3 mt-2 border-t border-gray-100">
          <button
            onClick={onRegenerate}
            className="w-full py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            🔄 선택한 {selectedCount}개 챕터 재생성
          </button>
        </div>
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
  const [maxTokens, setMaxTokens] = useState(8000);
  const [concurrent, setConcurrent] = useState(2);
  const [tpmLimit, setTpmLimit] = useState(40000);
  const [status, setStatus] = useState('idle'); // idle, running, completed, cancelled
  const [logs, setLogs] = useState([]);
  const [currentGenerating, setCurrentGenerating] = useState(new Set());
  const [selectedChapters, setSelectedChapters] = useState(new Set());
  const logEndRef = useRef(null);
  const pollRef = useRef(null);

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

  // 마운트 시 서버 생성 상태 확인 (새로고침 대응)
  useEffect(() => {
    if (!project) return;
    checkGenerationStatus();
    return () => stopPolling();
  }, [project]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const checkGenerationStatus = async () => {
    try {
      const genStatus = await apiFetch(`/api/projects/${project.name}/chapters/generation-status`);
      if (genStatus.status === 'running') {
        setStatus('running');
        setLogs(genStatus.logs || []);
        setCurrentGenerating(new Set(genStatus.current_chapters || (genStatus.current_chapter ? [genStatus.current_chapter] : [])));
        startPolling();
      } else if (genStatus.status === 'completed' || genStatus.status === 'cancelled') {
        if (genStatus.logs?.length > 0) setLogs(genStatus.logs);
        if (genStatus.report) setReport(genStatus.report);
        setStatus(genStatus.status);
      }
    } catch { /* ignore */ }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const genStatus = await apiFetch(`/api/projects/${project.name}/chapters/generation-status`);
        setLogs(genStatus.logs || []);
        setCurrentGenerating(new Set(genStatus.current_chapters || (genStatus.current_chapter ? [genStatus.current_chapter] : [])));

        if (genStatus.status === 'completed' || genStatus.status === 'cancelled' || genStatus.status === 'failed') {
          setStatus(genStatus.status === 'failed' ? 'idle' : genStatus.status);
          if (genStatus.report) setReport(genStatus.report);
          setCurrentGenerating(new Set());
          loadChapters();
          onComplete?.();
          stopPolling();
        }
      } catch { /* ignore */ }
    }, 3000);
  };

  const totalChapters = chapters.length;
  const completedChapters = chapters.filter((ch) => ch.has_content).length;
  const remainingChapters = totalChapters - completedChapters;

  const handleGenerate = async (skipCompleted = true) => {
    setStatus('running');
    setLogs([]);
    setReport(null);
    setCurrentGenerating(new Set());

    try {
      await apiStreamPost(
        `/api/projects/${project.name}/chapters/generate-all`,
        { model, maxTokens, concurrent, skipCompleted, tpmLimit },
        {
          onProgress: (data) => {
            setLogs((prev) => [...prev, data.message]);
            // SSE progress 메시지에서 현재 챕터 추가/제거
            const startMatch = data.message?.match(/📖\s+(chapter\d+)\s+생성 시작/);
            if (startMatch) {
              setCurrentGenerating((prev) => new Set([...prev, startMatch[1]]));
            }
            const doneMatch = data.message?.match(/✅\s+(chapter\d+)\s+(?:완료|재시도 완료)/);
            if (doneMatch) {
              setCurrentGenerating((prev) => { const next = new Set(prev); next.delete(doneMatch[1]); return next; });
              setChapters((prev) => prev.map((ch) =>
                ch.chapter_id === doneMatch[1] ? { ...ch, has_content: true } : ch
              ));
            }
            const failMatch = data.message?.match(/❌\s+(chapter\d+)\s+/);
            if (failMatch) {
              setCurrentGenerating((prev) => { const next = new Set(prev); next.delete(failMatch[1]); return next; });
            }
          },
          onDone: (data) => {
            if (data?.report) setReport(data.report);
            const finalStatus = data?.report?.was_cancelled ? 'cancelled' : 'completed';
            setStatus(finalStatus);
            setCurrentGenerating(new Set());
            loadChapters();
            onComplete?.();
          },
          onError: (err) => {
            setLogs((prev) => [...prev, `❌ 오류: ${err.message}`]);
            setStatus('idle');
            setCurrentGenerating(new Set());
          },
        }
      );
    } catch (err) {
      // SSE 연결 끊어짐 → 폴링으로 전환
      setLogs((prev) => [...prev, `⚠️ 연결이 끊어졌습니다. 서버 상태를 확인합니다...`]);
      startPolling();
    }
  };

  const handleCancel = async () => {
    try {
      await apiFetch(`/api/projects/${project.name}/chapters/generation-cancel`, {
        method: 'POST',
      });
      setLogs((prev) => [...prev, '🛑 취소 요청을 보냈습니다. 현재 생성 중인 챕터가 끝나면 중단됩니다...']);
    } catch (err) {
      setLogs((prev) => [...prev, `❌ 취소 실패: ${err.message}`]);
    }
  };

  const handleToggleSelect = (chapterId) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const handleSelectAll = (selectAll) => {
    if (selectAll) {
      setSelectedChapters(new Set(chapters.map((ch) => ch.chapter_id)));
    } else {
      setSelectedChapters(new Set());
    }
  };

  const handleRegenerateSelected = async () => {
    if (selectedChapters.size === 0) return;
    const ids = [...selectedChapters];
    setSelectedChapters(new Set());
    setStatus('running');
    setLogs([]);
    setReport(null);
    setCurrentGenerating(new Set());

    try {
      await apiStreamPost(
        `/api/projects/${project.name}/chapters/generate-all`,
        { model, maxTokens, concurrent, skipCompleted: false, tpmLimit, chapterIds: ids },
        {
          onProgress: (data) => {
            setLogs((prev) => [...prev, data.message]);
            const startMatch = data.message?.match(/📖\s+(chapter\d+)\s+생성 시작/);
            if (startMatch) {
              setCurrentGenerating((prev) => new Set([...prev, startMatch[1]]));
            }
            const doneMatch = data.message?.match(/✅\s+(chapter\d+)\s+(?:완료|재시도 완료)/);
            if (doneMatch) {
              setCurrentGenerating((prev) => { const next = new Set(prev); next.delete(doneMatch[1]); return next; });
              setChapters((prev) => prev.map((ch) =>
                ch.chapter_id === doneMatch[1] ? { ...ch, has_content: true } : ch
              ));
            }
            const failMatch = data.message?.match(/❌\s+(chapter\d+)\s+/);
            if (failMatch) {
              setCurrentGenerating((prev) => { const next = new Set(prev); next.delete(failMatch[1]); return next; });
            }
          },
          onDone: (data) => {
            if (data?.report) setReport(data.report);
            const finalStatus = data?.report?.was_cancelled ? 'cancelled' : 'completed';
            setStatus(finalStatus);
            setCurrentGenerating(new Set());
            loadChapters();
            onComplete?.();
          },
          onError: (err) => {
            setLogs((prev) => [...prev, `❌ 오류: ${err.message}`]);
            setStatus('idle');
            setCurrentGenerating(new Set());
          },
        }
      );
    } catch (err) {
      setLogs((prev) => [...prev, `⚠️ 연결이 끊어졌습니다. 서버 상태를 확인합니다...`]);
      startPolling();
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 생성 중 취소 바 (항상 보이는 위치) */}
      {status === 'running' && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl flex-shrink-0">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
          </span>
          <span className="text-sm text-blue-700 font-medium flex-1">
            {currentGenerating.size > 0
              ? `✍️ ${[...currentGenerating].join(', ')} 생성 중...`
              : '🚀 배치 생성 진행 중...'}
          </span>
          <button
            onClick={handleCancel}
            className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            🛑 생성 중단
          </button>
        </div>
      )}

      {/* 설정 + 진행 상태 (높이 통일) */}
      <div className={`flex gap-4 ${logs.length > 0 ? 'flex-shrink-0 h-80' : 'flex-1 min-h-[320px]'}`}>
        {/* 설정 패널 */}
        <div className="w-72 bg-white rounded-xl border border-gray-200 p-4 space-y-4 overflow-y-auto">
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
              min={2000}
              max={16000}
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

          {/* 예상 비용 */}
          {remainingChapters > 0 && status !== 'running' && (
            <div className="pt-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs font-medium text-amber-800 mb-1">💰 예상 비용</p>
              <EstimatedCost
                model={model}
                models={models}
                maxTokens={maxTokens}
                chapterCount={remainingChapters}
              />
            </div>
          )}

          {/* 생성 / 취소 버튼 */}
          <div className="space-y-2 pt-2">
            {status === 'running' ? (
              <button
                onClick={handleCancel}
                className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                🛑 생성 중단
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={remainingChapters === 0}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {completedChapters > 0 && remainingChapters > 0
                    ? `▶️ 이어서 생성 (${remainingChapters}개)`
                    : '▶️ 전체 생성 시작'}
                </button>
                <button
                  onClick={() => handleGenerate(false)}
                  className="w-full py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  🔁 처음부터 다시
                </button>
              </>
            )}
          </div>
        </div>

        {/* 목차 + 상태 */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <h3 className="font-semibold text-gray-900 text-sm">📋 목차 및 진행 상태</h3>
            <button onClick={loadChapters} className="text-xs text-blue-600 hover:underline">
              🔄 새로고침
            </button>
          </div>

          {totalChapters === 0 ? (
            <p className="text-sm text-gray-400">목차가 없습니다. Step 2에서 먼저 목차를 생성하세요.</p>
          ) : (
            <>
              {/* 전체 진행률 바 */}
              <div className="mb-3 flex-shrink-0">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>
                    완료: {completedChapters}/{totalChapters}개
                    {status === 'running' && currentGenerating.size > 0 && (
                      <span className="ml-2 text-blue-600 animate-pulse">
                        ✍️ {[...currentGenerating].join(', ')} 생성 중...
                      </span>
                    )}
                  </span>
                  <span>{totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-blue-600'
                    }`}
                    style={{ width: `${totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* 파트별 챕터 목록 */}
              <div className="flex-1 min-h-0">
                <ChapterProgressList
                  chapters={chapters}
                  currentGenerating={currentGenerating}
                  status={status}
                  selectedChapters={selectedChapters}
                  onToggleSelect={handleToggleSelect}
                  onRegenerate={handleRegenerateSelected}
                  onSelectAll={handleSelectAll}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 로그 */}
      {logs.length > 0 && (
        <div className="flex-[2] min-h-[300px] bg-gray-900 rounded-xl p-4 overflow-y-auto font-mono text-sm leading-relaxed text-gray-300">
          {logs.map((log, i) => (
            <div key={i} className="py-0.5">{log}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* 완료 리포트 */}
      {(status === 'completed' || status === 'cancelled' || report) && report && <ReportPanel report={report} />}

      {/* 다음 단계로 */}
      {status === 'completed' && remainingChapters === 0 && (
        <NextStepButton />
      )}
    </div>
  );
}

// =============================================
// 다음 단계로 버튼
// =============================================
function NextStepButton() {
  const navigate = useNavigate();
  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <button
        onClick={() => navigate('/deploy')}
        className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
      >
        🚀 Step 5: 배포 관리로 →
      </button>
    </div>
  );
}

// =============================================
// 예상 비용 컴포넌트
// =============================================
function EstimatedCost({ model, models, maxTokens, chapterCount }) {
  const modelInfo = models.find((m) => m.id === model);
  if (!modelInfo || !modelInfo.pricing) {
    return <p className="text-xs text-gray-400">모델 가격 정보 없음</p>;
  }

  const { input: inputPrice, output: outputPrice } = modelInfo.pricing;
  const estimatedInputPerChapter = 10000; // 평균 입력 토큰 (프롬프트 + 아웃라인 + 참고자료)
  const totalInput = chapterCount * estimatedInputPerChapter;
  const totalOutput = chapterCount * maxTokens;
  const inputCost = (totalInput / 1_000_000) * inputPrice;
  const outputCost = (totalOutput / 1_000_000) * outputPrice;
  const totalCost = inputCost + outputCost;

  return (
    <div className="text-xs text-amber-700 space-y-0.5">
      <p>{chapterCount}개 x 입력 ~{estimatedInputPerChapter.toLocaleString()} + 출력 ~{maxTokens.toLocaleString()} 토큰</p>
      <p className="font-semibold">~${totalCost.toFixed(2)} (입력 ${inputCost.toFixed(2)} + 출력 ${outputCost.toFixed(2)})</p>
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
