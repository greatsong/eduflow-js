import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { apiFetch, apiStreamPost } from '../api/client';
import ChatInterface from '../components/ChatInterface';

export default function Feedback() {
  const { currentProject, refreshProgress } = useProjectStore();
  const { messages, isStreaming, setMessages, addMessage, appendToLastMessage, setStreaming, clearMessages } = useChatStore();

  const [toc, setToc] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [models, setModels] = useState([]);
  const [loadedProject, setLoadedProject] = useState(null);

  // 모델 목록 로드
  useEffect(() => {
    apiFetch('/api/models').then((d) => {
      setModels(d.models);
      apiFetch('/api/models/default/conversation').then((r) => setModel(r.modelId));
    }).catch(() => {});
  }, []);

  // 프로젝트 변경 시 데이터 로드
  useEffect(() => {
    if (!currentProject || currentProject.name === loadedProject) return;
    setLoadedProject(currentProject.name);

    // TOC 로드
    apiFetch(`/api/projects/${currentProject.name}/toc`)
      .then((d) => setToc(d.toc))
      .catch(() => setToc(null));

    // Step 3 대화 로드
    apiFetch(`/api/projects/${currentProject.name}/discussions/3`)
      .then((d) => setMessages(d.messages || []))
      .catch(() => setMessages([]));

    // 확정 상태 확인
    apiFetch(`/api/projects/${currentProject.name}/progress`)
      .then((d) => setConfirmed(d.step3_confirmed || false))
      .catch(() => setConfirmed(false));
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

          {/* 확정 버튼 */}
          <div className="border-t border-gray-200 pt-3">
            {confirmed ? (
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-700 font-medium">✅ 목차가 확정되었습니다!</p>
                <p className="text-xs text-green-600 mt-1">이제 챕터 제작 단계로 넘어갈 수 있습니다.</p>
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
