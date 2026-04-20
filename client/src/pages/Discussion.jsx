import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { apiFetch, apiStreamPost } from '../api/client';
import ChatInterface from '../components/ChatInterface';
import ModelSelector from '../components/ModelSelector';

export default function Discussion() {
  const navigate = useNavigate();
  const { currentProject, refreshProgress } = useProjectStore();
  const { messages, isStreaming, setMessages, addMessage, appendToLastMessage, setStreaming, clearMessages } = useChatStore();

  const [summary, setSummary] = useState(null);
  const [summaryStreaming, setSummaryStreaming] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [loadedProject, setLoadedProject] = useState(null);

  // 프로젝트 변경 시 대화 로드
  useEffect(() => {
    if (!currentProject || currentProject.name === loadedProject) return;
    setLoadedProject(currentProject.name);

    apiFetch(`/api/projects/${currentProject.name}/discussions/1`)
      .then((d) => setMessages(d.messages || []))
      .catch(() => setMessages([]));

    apiFetch(`/api/projects/${currentProject.name}/discussions/1/summary`)
      .then((d) => setSummary(d.summary))
      .catch(() => setSummary(null));
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
        `/api/projects/${currentProject.name}/discussions/1/chat`,
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
    await apiFetch(`/api/projects/${currentProject.name}/discussions/1`, { method: 'DELETE' });
    clearMessages();
  };

  // 요약 생성
  const handleSummarize = async () => {
    if (!currentProject) return;
    setSummaryStreaming(true);
    setSummaryText('');

    try {
      await apiStreamPost(
        `/api/projects/${currentProject.name}/discussions/1/summarize`,
        { model },
        {
          onText: (text) => setSummaryText((prev) => prev + text),
          onDone: () => {
            setSummaryStreaming(false);
            refreshProgress();
          },
          onError: (e) => {
            setSummaryText((prev) => prev + `\n\n❌ 오류: ${e.message}`);
            setSummaryStreaming(false);
          },
        }
      );
    } catch (e) {
      setSummaryText(`❌ 오류: ${e.message}`);
      setSummaryStreaming(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">먼저 프로젝트를 선택하세요</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">💬 Step 1: 방향성 논의</h2>
          <p className="text-sm text-gray-500">Claude와 대화하며 교육자료의 방향성을 논의합니다.</p>
        </div>
        {/* 모델 선택 */}
        <ModelSelector
          value={model}
          onChange={setModel}
          defaultPurpose="conversation"
        />
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* 채팅 영역 (2/3) */}
        <div className="flex-[2] flex flex-col min-h-0 bg-white rounded-xl border border-gray-200 p-4">
          <ChatInterface
            messages={messages}
            isStreaming={isStreaming}
            onSend={handleSend}
            onClear={handleClear}
            placeholder="교육자료에 대해 설명해주세요..."
          />
        </div>

        {/* 요약 영역 (1/3) */}
        <div className="flex-[1] bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
          <h3 className="font-semibold text-gray-900 mb-3">📝 논의 정리</h3>

          {/* 요약 표시 */}
          {summaryText ? (
            <div className="flex-1 overflow-y-auto mb-3">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {summaryText + (summaryStreaming ? '▌' : '')}
                </ReactMarkdown>
              </div>
              {!summaryStreaming && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-700">✅ 요약 완료! master-context.md가 생성되었습니다.</p>
                </div>
              )}
            </div>
          ) : summary ? (
            <div className="flex-1 overflow-y-auto mb-3">
              <div className="p-3 bg-green-50 rounded-lg mb-3">
                <p className="text-sm text-green-700">✅ 저장된 요약이 있습니다</p>
              </div>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-gray-400 text-center">
                {messages.length > 0
                  ? '대화가 충분히 진행되면\n아래 버튼으로 요약하세요'
                  : '대화를 시작하면\n요약할 수 있습니다'}
              </p>
            </div>
          )}

          {/* 요약 버튼 */}
          <button
            onClick={handleSummarize}
            disabled={messages.length === 0 || summaryStreaming || isStreaming}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {summaryStreaming
              ? '요약 생성 중...'
              : summary || summaryText
              ? '🔄 요약 재생성'
              : '✨ 논의 내용 요약하기'}
          </button>

          {/* 다음 단계로 */}
          {(summary || summaryText) && !summaryStreaming && (
            <button
              onClick={() => navigate('/toc')}
              className="w-full mt-2 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              📋 Step 2: 목차 작성으로 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
