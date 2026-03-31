import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { apiFetch, apiStreamPost } from '../api/client';
import ChatInterface from '../components/ChatInterface';

// AI 응답에서 json:toc-update 코드블록 감지
function extractTocUpdate(text) {
  const match = text.match(/```json:toc-update\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed.parts && Array.isArray(parsed.parts)) return parsed;
  } catch {}
  return null;
}

// json:toc-update 블록을 짧은 안내문으로 교체 (렌더링용)
function stripTocUpdateBlock(content) {
  return content.replace(
    /```json:toc-update\s*[\s\S]*?```/g,
    '> 📋 **수정된 목차 JSON** — 아래 버튼으로 적용할 수 있습니다.'
  );
}

export default function Feedback() {
  const navigate = useNavigate();
  const { currentProject, refreshProgress } = useProjectStore();
  const { messages, isStreaming, setMessages, addMessage, appendToLastMessage, setStreaming, clearMessages } = useChatStore();

  const [toc, setToc] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [models, setModels] = useState([]);
  const [loadedProject, setLoadedProject] = useState(null);
  const [applyingToc, setApplyingToc] = useState(false);
  const [tocAppliedMsgIdx, setTocAppliedMsgIdx] = useState(new Set());
  const [guidelines, setGuidelines] = useState('');
  const [guidelinesSaved, setGuidelinesSaved] = useState(true);
  const [showGuidelines, setShowGuidelines] = useState(false);

  // 모델 목록 로드
  useEffect(() => {
    apiFetch('/api/models').then((d) => {
      setModels(d.models);
      apiFetch('/api/models/default/conversation').then((r) => setModel(r.modelId));
    }).catch((err) => console.error('모델 목록 로드 실패', err));
  }, []);

  // TOC는 페이지 방문할 때마다 최신으로 로드 (Step 2에서 재생성 반영)
  useEffect(() => {
    if (!currentProject) return;
    apiFetch(`/api/projects/${currentProject.name}/toc`)
      .then((d) => setToc(d.toc))
      .catch(() => {
        setToc(null);
        console.error('목차 로드 실패');
      });
    apiFetch(`/api/projects/${currentProject.name}/progress`)
      .then((d) => setConfirmed(d.step3_confirmed || false))
      .catch(() => {
        setConfirmed(false);
        console.error('확인 상태 로드 실패');
      });
    apiFetch(`/api/projects/${currentProject.name}/toc/guidelines`)
      .then((d) => { setGuidelines(d.guidelines || ''); setGuidelinesSaved(true); })
      .catch(() => {
        console.error('가이드라인 로드 실패');
      });
  }, [currentProject]);

  // 대화는 프로젝트 변경 시에만 로드 (채팅 상태 유지)
  useEffect(() => {
    if (!currentProject || currentProject.name === loadedProject) return;
    setLoadedProject(currentProject.name);
    apiFetch(`/api/projects/${currentProject.name}/discussions/3`)
      .then((d) => setMessages(d.messages || []))
      .catch(() => setMessages([]));
  }, [currentProject]);

  // 채팅 전송
  const handleSend = useCallback(async (message) => {
    if (!currentProject) return;

    addMessage('user', message);
    addMessage('assistant', '');
    setStreaming(true);

    try {
      const allMessages = [...messages, { role: 'user', content: message }];

      await apiStreamPost(
        `/api/projects/${currentProject.name}/discussions/3/chat`,
        { message, model, messages: allMessages },
        {
          onText: (text) => appendToLastMessage(text),
          onDone: () => setStreaming(false),
          onError: (e) => {
            appendToLastMessage(`\n\n❌ 오류: ${e.message}`);
            setStreaming(false);
          },
        }
      );
    } catch (e) {
      appendToLastMessage(`\n\n❌ 오류: ${e.message}`);
      setStreaming(false);
    }
  }, [currentProject, model, messages]);

  // 대화 초기화
  const handleClear = async () => {
    if (!currentProject) return;
    await apiFetch(`/api/projects/${currentProject.name}/discussions/3`, { method: 'DELETE' });
    clearMessages();
  };

  // AI 응답에서 목차 수정 적용
  const handleApplyTocUpdate = async (tocData, msgIdx) => {
    if (!currentProject || applyingToc) return;
    setApplyingToc(true);
    try {
      await apiFetch(`/api/projects/${currentProject.name}/toc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toc: tocData }),
      });
      setToc(tocData);
      setTocAppliedMsgIdx((prev) => new Set([...prev, msgIdx]));
      setConfirmed(false); // 목차 변경 시 확정 상태 리셋
    } catch (e) {
      alert(`목차 적용 실패: ${e.message}`);
    } finally {
      setApplyingToc(false);
    }
  };

  // 가이드라인 저장
  const handleSaveGuidelines = async () => {
    if (!currentProject) return;
    try {
      await apiFetch(`/api/projects/${currentProject.name}/toc/guidelines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guidelines }),
      });
      setGuidelinesSaved(true);
    } catch (e) {
      alert(`저장 실패: ${e.message}`);
    }
  };

  // 목차 확정
  const handleConfirm = async () => {
    if (!currentProject) return;
    try {
      await apiFetch(`/api/projects/${currentProject.name}/toc/confirm`, { method: 'POST' });
      setConfirmed(true);
      refreshProgress();
    } catch (e) {
      alert(`확정 실패: ${e.message}`);
    }
  };

  if (!currentProject) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">먼저 프로젝트를 선택하세요</p>
      </div>
    );
  }

  if (!toc) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">먼저 Step 2에서 목차를 생성하세요</p>
      </div>
    );
  }

  const totalChapters = (toc.parts || []).reduce((sum, p) => sum + (p.chapters || []).length, 0);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">✅ Step 3: 피드백 & 컨펌</h2>
          <p className="text-sm text-gray-500">생성된 목차를 검토하고 Claude와 함께 개선합니다.</p>
        </div>
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

      {/* 메인: 채팅 + 목차 */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* 채팅 영역 (1/2) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-gray-200 p-4">
          <ChatInterface
            messages={messages}
            isStreaming={isStreaming}
            onSend={handleSend}
            onClear={handleClear}
            placeholder="목차에 대한 의견을 말씀해주세요..."
            contentTransform={stripTocUpdateBlock}
            renderAfterMessage={(msg, idx) => {
              if (msg.role !== 'assistant') return null;
              const tocUpdate = extractTocUpdate(msg.content || '');
              if (!tocUpdate) return null;
              const applied = tocAppliedMsgIdx.has(idx);
              return (
                <div className={`mt-2 p-3 rounded-lg border ${applied ? 'bg-green-50 border-green-200' : 'bg-indigo-50 border-indigo-200'}`}>
                  {applied ? (
                    <p className="text-sm text-green-700 font-medium">✅ 수정된 목차가 적용되었습니다!</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-indigo-700 flex-1">
                        📋 AI가 수정된 목차를 제안했습니다 ({tocUpdate.parts?.length || 0}개 Part,{' '}
                        {(tocUpdate.parts || []).reduce((s, p) => s + (p.chapters || []).length, 0)}개 Chapter)
                      </p>
                      <button
                        onClick={() => handleApplyTocUpdate(tocUpdate, idx)}
                        disabled={applyingToc}
                        className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {applyingToc ? '적용 중...' : '✏️ 목차에 적용'}
                      </button>
                    </div>
                  )}
                </div>
              );
            }}
          />
        </div>

        {/* 목차 + 확정 영역 (1/2) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">📋 현재 목차</h3>

          {/* 목차 표시 */}
          <div className="flex-1 overflow-y-auto mb-4 space-y-3">
            <div className="space-y-1 text-sm">
              <p><span className="font-medium text-gray-700">제목:</span> {toc.title}</p>
              <p><span className="font-medium text-gray-700">대상:</span> {toc.target_audience}</p>
              <p className="text-blue-600 font-medium">
                {(toc.parts || []).length}개 Part, {totalChapters}개 Chapter
              </p>
            </div>

            <hr className="border-gray-200" />

            {(toc.parts || []).map((part) => (
              <div key={part.part_number} className="space-y-1">
                <p className="font-medium text-gray-900 text-sm">
                  📚 Part {part.part_number}: {part.part_title}
                </p>
                <p className="text-xs text-gray-500 italic">{part.part_description}</p>
                {(part.chapters || []).map((ch) => (
                  <div key={ch.chapter_id} className="ml-4 text-sm text-gray-700 flex justify-between">
                    <span>{ch.chapter_id}: {ch.chapter_title}</span>
                    <span className="text-xs text-gray-400">{ch.estimated_time}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 생성 가이드라인 */}
          <div className="border-t border-gray-200 pt-3 mb-3">
            <button
              onClick={() => setShowGuidelines(!showGuidelines)}
              className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              <span>{showGuidelines ? '▼' : '▶'}</span>
              <span>📝 콘텐츠 생성 가이드라인</span>
              {guidelines.trim() && <span className="text-xs text-indigo-400">(작성됨)</span>}
            </button>
            {showGuidelines && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-gray-500">
                  챕터 생성 시 AI가 참고할 지침을 작성하세요. (예: 톤, 에피소드, 금지 사항 등)
                </p>
                <textarea
                  value={guidelines}
                  onChange={(e) => { setGuidelines(e.target.value); setGuidelinesSaved(false); }}
                  placeholder="예시:&#10;- 교양과학 베스트셀러 톤으로 작성&#10;- 각 챕터마다 재미있는 에피소드 포함&#10;- 코드 블록 사용 금지&#10;- 힌튼-불 가문 연결고리 언급"
                  className="w-full h-28 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={handleSaveGuidelines}
                  disabled={guidelinesSaved}
                  className={`w-full py-2 text-sm font-medium rounded-lg transition-colors ${
                    guidelinesSaved
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {guidelinesSaved ? '✅ 저장됨' : '💾 가이드라인 저장'}
                </button>
              </div>
            )}
          </div>

          {/* 확정 버튼 */}
          <div className="border-t border-gray-200 pt-3">
            {confirmed ? (
              <div className="space-y-2">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-700 font-medium">✅ 목차가 확정되었습니다!</p>
                  <p className="text-xs text-green-600 mt-1">이제 챕터 제작 단계로 넘어갈 수 있습니다.</p>
                </div>
                <button
                  onClick={() => navigate('/chapters')}
                  className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  ✍️ Step 4: 챕터 제작으로 →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  목차가 만족스러우신가요? 확정 후에도 Step 2에서 수정할 수 있습니다.
                </p>
                <button
                  onClick={handleConfirm}
                  disabled={isStreaming}
                  className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  ✅ 목차 확정하기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
