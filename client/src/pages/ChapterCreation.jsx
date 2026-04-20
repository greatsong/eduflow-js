import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch, apiStreamPost, API_BASE } from '../api/client';
import { getAuthToken } from '../components/EntryForm';
import ModelSelector from '../components/ModelSelector';

const TABS = ['💬 대화형 모드', '🤖 배치 자동화', '✏️ 챕터 편집'];

// 이미지 라이트박스 모달
function ImageLightbox({ src, alt, onClose }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <div className="relative max-w-5xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <img src={src} alt={alt} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
        <p className="text-white/80 text-sm text-center mt-2 px-4">{alt}</p>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full text-gray-800 text-lg flex items-center justify-center shadow-lg hover:bg-gray-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// 전역 라이트박스 상태를 위한 이벤트
let _openLightbox = null;

// 마크다운 이미지를 API 경로로 변환하는 커스텀 컴포넌트
function makeMarkdownComponents(projectName) {
  return {
    img: ({ src, alt, ...props }) => {
      if (src && src.startsWith('images/')) {
        const token = getAuthToken();
        const apiSrc = `${API_BASE}/api/projects/${projectName}/chapters/images/${src.replace('images/', '')}${token ? '?token=' + token : ''}`;
        return (
          <img
            src={apiSrc} alt={alt}
            style={{ maxWidth: '100%', borderRadius: 8, cursor: 'pointer' }}
            onClick={() => _openLightbox?.({ src: apiSrc, alt })}
            title="클릭하여 크게 보기"
            {...props}
          />
        );
      }
      return <img src={src} alt={alt} {...props} />;
    },
  };
}

export default function ChapterCreation() {
  const { currentProject, refreshProgress } = useProjectStore();
  const [activeTab, setActiveTab] = useState(0);
  const [lightboxImg, setLightboxImg] = useState(null);

  // 전역 라이트박스 열기 함수 등록
  useEffect(() => {
    _openLightbox = setLightboxImg;
    return () => { _openLightbox = null; };
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
      {/* 이미지 라이트박스 */}
      {lightboxImg && (
        <ImageLightbox
          src={lightboxImg.src}
          alt={lightboxImg.alt}
          onClose={() => setLightboxImg(null)}
        />
      )}

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
                ? 'border-emerald-600 text-emerald-600'
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
// 대화 기록 서버 저장 헬퍼
async function saveChatToServer(projectName, chapterId, messages) {
  if (!chapterId) return;
  try {
    await apiFetch(`/api/projects/${projectName}/chapters/chat-history`, {
      method: 'PUT',
      body: JSON.stringify({ chapterId, messages }),
    });
  } catch { /* fire-and-forget */ }
}
async function loadAllChatsFromServer(projectName) {
  try {
    return await apiFetch(`/api/projects/${projectName}/chapters/chat-history`);
  } catch { return {}; }
}

function InteractiveTab({ project }) {
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!project) return;
    apiFetch(`/api/projects/${project.name}/chapters`)
      .then((d) => setChapters(d.chapters || []))
      .catch(() => setChapters([]));
  }, [project]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const chatHistoryRef = useRef({}); // { chapterId: messages[] } 캐시
  const saveTimerRef = useRef(null);

  // 프로젝트 로드 시 서버에서 전체 대화 기록 로드
  useEffect(() => {
    if (!project) return;
    loadAllChatsFromServer(project.name).then((history) => {
      chatHistoryRef.current = history || {};
    });
  }, [project]);

  // 대화 변경 시 서버에 디바운스 저장 (1초)
  useEffect(() => {
    if (!selectedChapter || isStreaming) return;
    if (chatMessages.length > 0) {
      chatHistoryRef.current[selectedChapter.chapter_id] = chatMessages;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveChatToServer(project.name, selectedChapter.chapter_id, chatMessages);
      }, 1000);
    }
    return () => clearTimeout(saveTimerRef.current);
  }, [chatMessages, isStreaming, selectedChapter, project]);

  const handleSelectChapter = async (ch) => {
    // 현재 챕터의 대화를 캐시에 저장
    if (selectedChapter && chatMessages.length > 0) {
      chatHistoryRef.current[selectedChapter.chapter_id] = chatMessages;
      saveChatToServer(project.name, selectedChapter.chapter_id, chatMessages);
    }

    setSelectedChapter(ch);

    // 캐시에서 대화 복원
    const savedMessages = chatHistoryRef.current[ch.chapter_id] || [];
    setChatMessages(savedMessages);

    try {
      const data = await apiFetch(`/api/projects/${project.name}/chapters/${ch.chapter_id}`);
      setPreviewContent(data.content || '');
    } catch {
      setPreviewContent('');
    }
  };

  const handleClearChat = () => {
    if (selectedChapter) {
      chatHistoryRef.current[selectedChapter.chapter_id] = [];
      saveChatToServer(project.name, selectedChapter.chapter_id, []);
    }
    setChatMessages([]);
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
        <ModelSelector
          value={model}
          onChange={setModel}
          defaultPurpose="conversation"
          className="px-3 py-1.5"
        />
      </div>

      {!selectedChapter ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          위에서 챕터를 선택하면 AI와 대화하며 내용을 작성할 수 있습니다
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
                  onClick={handleClearChat}
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
                        ? 'bg-emerald-600 text-white'
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
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={isStreaming}
                    className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={makeMarkdownComponents(project.name)}>{previewContent}</ReactMarkdown>
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
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
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
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
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
            className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600"
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
                    className="bg-emerald-500 h-1.5 rounded-full transition-all"
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
                          isGenerating ? 'bg-emerald-50' : isSelected ? 'bg-amber-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        {status !== 'running' && (
                          <input
                            type="checkbox"
                            checked={isSelected || false}
                            onChange={() => onToggleSelect?.(ch.chapter_id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 flex-shrink-0"
                          />
                        )}
                        <ChapterStatusIcon hasContent={ch.has_content} isGenerating={isGenerating} />
                        <span className={`truncate ${isGenerating ? 'text-emerald-700 font-medium' : 'text-gray-600'}`}>
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
  const [model, setModel] = useState('claude-opus-4-7');
  const [charTarget, setCharTarget] = useState(6000); // 챕터당 목표 글자 수
  const maxTokens = Math.round(charTarget * 1.15); // 한국어: 1토큰≈1자 + 15% 마크다운 버퍼
  const [concurrent, setConcurrent] = useState(5);
  const [tpmLimit, setTpmLimit] = useState(200000);
  const [status, setStatus] = useState('idle'); // idle, running, completed, cancelled
  const [logs, setLogs] = useState([]);
  const [currentGenerating, setCurrentGenerating] = useState(new Set());
  const [selectedChapters, setSelectedChapters] = useState(new Set());
  const logEndRef = useRef(null);
  const pollRef = useRef(null);

  // 샘플 챕터 관련 상태
  const [samplePhase, setSamplePhase] = useState('select'); // select, generating, review
  const [sampleChapterId, setSampleChapterId] = useState('');
  const [sampleContent, setSampleContent] = useState('');
  const [sampleTokens, setSampleTokens] = useState(null);
  const [sampleProgress, setSampleProgress] = useState('');
  const [sampleElapsed, setSampleElapsed] = useState(0);
  const [guidelines, setGuidelines] = useState('');
  const [guidelinesSaved, setGuidelinesSaved] = useState(true);
  const [showSample, setShowSample] = useState(true);
  const [models, setModels] = useState([]);

  // 기본 모델 + 모델 목록 로드
  useEffect(() => {
    apiFetch('/api/models/default/generation')
      .then((r) => setModel(r.modelId))
      .catch(() => {});
    apiFetch('/api/models')
      .then((r) => setModels(r.models || []))
      .catch(() => {});
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

  // 가이드라인 로드
  useEffect(() => {
    if (!project) return;
    apiFetch(`/api/projects/${project.name}/toc/guidelines`)
      .then((r) => { setGuidelines(r.guidelines || ''); setGuidelinesSaved(true); })
      .catch(() => {});
  }, [project]);

  // 샘플 챕터 생성 (SSE 진행 스트리밍)
  const handleGenerateSample = async () => {
    if (!sampleChapterId) return;
    setSamplePhase('generating');
    setSampleContent('');
    setSampleTokens(null);
    setSampleProgress('🔬 생성 준비 중...');
    setSampleElapsed(0);
    const startTs = Date.now();
    const elapsedTimer = setInterval(() => {
      setSampleElapsed(Math.floor((Date.now() - startTs) / 1000));
    }, 1000);

    try {
      let finalResult = null;
      await apiStreamPost(
        `/api/projects/${project.name}/chapters/${sampleChapterId}/generate`,
        { model, maxTokens },
        {
          onProgress: (data) => {
            if (data.message) setSampleProgress(data.message);
          },
          onDone: (data) => { finalResult = data?.result || null; },
          onError: (err) => { throw err; },
        }
      );

      if (finalResult?.success) {
        const data = await apiFetch(`/api/projects/${project.name}/chapters/${sampleChapterId}`);
        setSampleContent(data.content || '');
        setSampleTokens({ input: finalResult.input_tokens || 0, output: finalResult.output_tokens || 0 });
        setSamplePhase('review');
        loadChapters();
      } else {
        setSampleContent(`❌ 생성 실패: ${finalResult?.error || finalResult?.message || '알 수 없는 오류'}`);
        setSamplePhase('review');
      }
    } catch (err) {
      setSampleContent(`❌ 오류: ${err.message}`);
      setSamplePhase('review');
    } finally {
      clearInterval(elapsedTimer);
    }
  };

  // 내용 가이드라인 저장
  const handleSaveGuidelines = async () => {
    try {
      await apiFetch(`/api/projects/${project.name}/toc/guidelines`, {
        method: 'PUT',
        body: { guidelines },
      });
      setGuidelinesSaved(true);
    } catch (err) {
      alert(`가이드라인 저장 실패: ${err.message}`);
    }
  };

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
      setLogs((prev) => [...prev, '🛑 취소 요청을 보냈습니다...']);
      // 5초 후에도 상태가 running이면 강제로 cancelled로 전환
      setTimeout(() => {
        setStatus((prev) => {
          if (prev === 'running') {
            stopPolling();
            setCurrentGenerating(new Set());
            loadChapters();
            return 'cancelled';
          }
          return prev;
        });
      }, 5000);
    } catch (err) {
      setLogs((prev) => [...prev, `❌ 취소 실패: ${err.message}`]);
      // 취소 API 실패해도 UI는 풀어줌
      setStatus('cancelled');
      setCurrentGenerating(new Set());
      stopPolling();
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
        <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex-shrink-0">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <span className="text-sm text-emerald-700 font-medium flex-1">
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

      {/* 🔬 샘플 챕터 미리보기 */}
      {status !== 'running' && totalChapters > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex-shrink-0">
          <button
            onClick={() => setShowSample(!showSample)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">🔬 샘플 챕터 미리보기</span>
              <span className="text-xs text-gray-400">전체 생성 전 샘플로 결과를 확인하고 가이드를 다듬으세요</span>
            </div>
            <span className="text-gray-400 text-sm">{showSample ? '▲' : '▼'}</span>
          </button>

          {showSample && (
            <div className="px-4 pb-4 border-t border-gray-100 space-y-4">
              {/* 워크플로 단계 표시 */}
              <div className="flex items-center gap-1.5 pt-3 text-xs">
                <span className={`px-2 py-1 rounded-full ${samplePhase === 'select' ? 'bg-emerald-100 text-emerald-700 font-bold' : samplePhase !== 'select' ? 'bg-green-100 text-green-700' : 'text-gray-400'}`}>
                  ① 챕터 선택
                </span>
                <span className="text-gray-300">→</span>
                <span className={`px-2 py-1 rounded-full ${samplePhase === 'generating' ? 'bg-emerald-100 text-emerald-700 font-bold animate-pulse' : samplePhase === 'review' ? 'bg-green-100 text-green-700' : 'text-gray-400'}`}>
                  ② 샘플 생성
                </span>
                <span className="text-gray-300">→</span>
                <span className={`px-2 py-1 rounded-full ${samplePhase === 'review' ? 'bg-emerald-100 text-emerald-700 font-bold' : 'text-gray-400'}`}>
                  ③ 검토 & 가이드 조정
                </span>
                <span className="text-gray-300">→</span>
                <span className="px-2 py-1 rounded-full text-gray-400">④ 전체 생성</span>
              </div>

              <div className="flex gap-4">
                {/* 왼쪽: 샘플 생성 + 결과 */}
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <select
                      value={sampleChapterId}
                      onChange={(e) => { setSampleChapterId(e.target.value); if (samplePhase !== 'generating') setSamplePhase('select'); }}
                      disabled={samplePhase === 'generating'}
                      className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">샘플로 생성할 챕터 선택...</option>
                      {chapters.map((ch) => (
                        <option key={ch.chapter_id} value={ch.chapter_id}>
                          {ch.chapter_id}: {ch.chapter_title} {ch.has_content ? '(완료)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleGenerateSample}
                      disabled={!sampleChapterId || samplePhase === 'generating'}
                      className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap transition-colors flex items-center gap-1.5"
                    >
                      {samplePhase === 'generating' ? (
                        <><span className="animate-spin inline-block">⏳</span> 생성 중...</>
                      ) : samplePhase === 'review' ? '🔄 재생성' : '🔬 샘플 생성'}
                    </button>
                  </div>

                  {/* 샘플 결과 미리보기 */}
                  {samplePhase === 'generating' && (
                    <div className="flex-1 flex items-center justify-center py-8 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="text-center w-full px-6">
                        <div className="animate-spin text-3xl mb-3">🔬</div>
                        <p className="text-sm font-medium text-gray-700 mb-2 break-words">
                          {sampleProgress || '샘플 챕터를 생성하고 있습니다...'}
                        </p>
                        <p className="text-xs text-gray-400">
                          모델: {model} · 경과: {Math.floor(sampleElapsed / 60)}분 {sampleElapsed % 60}초
                        </p>
                      </div>
                    </div>
                  )}

                  {sampleContent && samplePhase === 'review' && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                        <span className="text-xs font-medium text-gray-700">📄 샘플 결과: {sampleChapterId}</span>
                        {sampleTokens && (
                          <span className="text-xs text-gray-400">
                            입력 {sampleTokens.input.toLocaleString()} + 출력 {sampleTokens.output.toLocaleString()} 토큰
                          </span>
                        )}
                      </div>
                      <div className="p-4 max-h-[400px] overflow-y-auto prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{sampleContent}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {!sampleContent && samplePhase === 'select' && (
                    <div className="flex-1 flex items-center justify-center py-8 border border-dashed border-gray-300 rounded-lg">
                      <p className="text-sm text-gray-400">위에서 챕터를 선택하고 샘플을 생성하세요</p>
                    </div>
                  )}
                </div>

                {/* 오른쪽: 내용 가이드라인 편집 */}
                <div className="w-80 flex-shrink-0 flex flex-col">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="px-2 py-1 text-xs rounded-lg bg-emerald-100 text-emerald-700 font-medium">
                      📝 내용 가이드
                      {!guidelinesSaved && <span className="ml-1 text-amber-600">●</span>}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={handleSaveGuidelines}
                      disabled={guidelinesSaved}
                      className="px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      💾 저장
                    </button>
                  </div>

                  <textarea
                    value={guidelines}
                    onChange={(e) => { setGuidelines(e.target.value); setGuidelinesSaved(false); }}
                    placeholder={"내용 가이드라인을 입력하세요...\n\n예시:\n- 모든 챕터에 실습 예제를 포함\n- 코드 블록에는 항상 주석\n- 각 섹션 끝에 핵심 정리\n- 학생 수준은 고등학교 1학년"}
                    className="flex-1 min-h-[200px] w-full text-sm border border-gray-300 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    💡 텍스트와 구성 요소에 대한 가이드. 모든 챕터 생성 시 AI에게 전달됩니다.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 설정 + 진행 상태 (높이 통일) */}
      <div className={`flex gap-4 ${logs.length > 0 ? 'flex-shrink-0 h-80' : 'flex-1 min-h-[320px]'}`}>
        {/* 설정 패널 */}
        <div className="w-72 bg-white rounded-xl border border-gray-200 p-4 space-y-4 overflow-y-auto">
          <h3 className="font-semibold text-gray-900 text-sm">⚙️ 배치 생성 설정</h3>

          <div>
            <label className="block text-xs text-gray-500 mb-1">AI 모델</label>
            <ModelSelector
              value={model}
              onChange={setModel}
              defaultPurpose="generation"
              className="w-full px-3 py-1.5"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              챕터당 목표 글자 수: ~{charTarget.toLocaleString()}자
              <span className="text-gray-400 ml-1">(토큰: {maxTokens.toLocaleString()})</span>
            </label>
            <input
              type="range"
              min={2000}
              max={12000}
              step={500}
              value={charTarget}
              onChange={(e) => setCharTarget(Number(e.target.value))}
              disabled={status === 'running'}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>간결 (2,000자)</span>
              <span>표준 (6,000자)</span>
              <span>상세 (12,000자)</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">동시 실행: {concurrent}개</label>
            <input
              type="range"
              min={1}
              max={20}
              value={concurrent}
              onChange={(e) => setConcurrent(Number(e.target.value))}
              disabled={status === 'running'}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              출력 TPM 제한: {tpmLimit > 0 ? `${(tpmLimit / 1000).toFixed(0)}K/분` : '없음'}
            </label>
            <input
              type="range"
              min={0}
              max={800000}
              step={10000}
              value={tpmLimit}
              onChange={(e) => setTpmLimit(Number(e.target.value))}
              disabled={status === 'running'}
              className="w-full"
            />
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <p className="text-xs text-gray-400">
                {tpmLimit === 0 ? '제한 없음 (rate limit 시 자동 재시도)' :
                 tpmLimit <= 40000 ? 'Tier 1~2' :
                 tpmLimit <= 80000 ? 'Tier 3' :
                 tpmLimit <= 200000 ? 'Tier 4 (Opus/Sonnet)' :
                 tpmLimit <= 400000 ? 'Tier 4 최대 (Opus/Sonnet)' : 'Tier 4 (Haiku 800K)'}
              </p>
              {status !== 'running' && (
                <div className="flex gap-1 ml-auto">
                  {[
                    { label: 'T4', value: 200000 },
                    { label: 'Max', value: 400000 },
                    { label: '없음', value: 0 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setTpmLimit(preset.value)}
                      className={`px-1.5 py-0.5 text-[10px] rounded border ${
                        tpmLimit === preset.value
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                          : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                  className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
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
            <button onClick={loadChapters} className="text-xs text-emerald-600 hover:underline">
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
                      <span className="ml-2 text-emerald-600 animate-pulse">
                        ✍️ {[...currentGenerating].join(', ')} 생성 중...
                      </span>
                    )}
                  </span>
                  <span>{totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-600'
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
  // 실제 프롬프트: 시스템(3~5K) + docStructure(2~4K) + templateAddition(2~4K) + 아웃라인(1~3K) + 참고자료(5~20K) + 이전챕터참조(10~30K)
  const estimatedInputPerChapter = 40000;
  // 한국어: 출력 토큰 ≈ 글자 수 (1:1). 서버에서 시간 기반 캡 적용됨
  const estimatedOutputPerChapter = Math.round(maxTokens * 0.85);
  const totalInput = chapterCount * estimatedInputPerChapter;
  const totalOutput = chapterCount * estimatedOutputPerChapter;
  const inputCost = (totalInput / 1_000_000) * inputPrice;
  const outputCost = (totalOutput / 1_000_000) * outputPrice;
  const totalCost = inputCost + outputCost;

  // 원화 환산 (1달러 ≈ 1,450원)
  const krwTotal = Math.round(totalCost * 1450);

  return (
    <div className="text-xs text-amber-700 space-y-0.5">
      <p>{chapterCount}개 챕터 × ~{estimatedOutputPerChapter.toLocaleString()}자 출력</p>
      <p className="font-semibold">~${totalCost.toFixed(2)} (약 {krwTotal.toLocaleString()}원)</p>
      <p className="text-amber-600">입력 ${inputCost.toFixed(2)} + 출력 ${outputCost.toFixed(2)}</p>
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
          <div className="text-xl font-bold text-emerald-600">{totalCompleted}/{report.total}</div>
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
          <div className="text-xs text-amber-500">약 {Math.round((cost.total_cost || 0) * 1450).toLocaleString()}원</div>
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
                  ? 'bg-emerald-50 text-emerald-700 font-medium'
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
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 min-w-0 overflow-y-auto">
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
                showPreview ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {showPreview ? '📝 편집' : '👁️ 미리보기'}
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              💾 저장
            </button>
          </div>
        </div>

        {/* 내용 */}
        <div className="min-h-[300px]" style={{ height: 'clamp(300px, 55vh, 600px)' }}>
          {showPreview ? (
            <div className="h-full overflow-y-auto p-6">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={makeMarkdownComponents(project.name)}>{content}</ReactMarkdown>
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
