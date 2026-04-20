import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * 범용 스트리밍 채팅 컴포넌트
 * @param {object} props
 * @param {Array} props.messages - [{role, content}]
 * @param {boolean} props.isStreaming - 스트리밍 중 여부
 * @param {function} props.onSend - (message) => void
 * @param {function} props.onClear - 초기화 콜백
 * @param {string} props.placeholder - 입력 placeholder
 */
export default function ChatInterface({ messages, isStreaming, onSend, onClear, placeholder, renderAfterMessage, contentTransform }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // 새 메시지 시 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    // Enter: 전송 / Shift+Enter: 줄바꿈(기본 동작 유지)
    // IME(한글) 조합 중에는 무시 — 한글 입력 확정용 Enter까지 전송되는 것 방지
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    // 내용에 맞춰 높이 자동 조절
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">💬 Claude와 대화</h3>
        {onClear && (
          <button
            onClick={onClear}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            초기화
          </button>
        )}
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            대화를 시작하세요
          </p>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            <div
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm overflow-hidden ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0 prose-pre:overflow-x-auto prose-code:break-all [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_*]:max-w-full break-words overflow-x-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {(contentTransform ? contentTransform(msg.content, msg) : msg.content) + (isStreaming && i === messages.length - 1 ? '▌' : '')}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
            {renderAfterMessage && renderAfterMessage(msg, i)}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <form onSubmit={handleSubmit} className="pt-3 border-t border-gray-200">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={isStreaming ? '응답 생성 중... 다음 메시지를 미리 입력하세요 (Shift+Enter: 줄바꿈)' : (placeholder || '메시지를 입력하세요... (Shift+Enter: 줄바꿈)')}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none leading-6"
            style={{ minHeight: '44px', maxHeight: '200px' }}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {isStreaming ? '...' : '전송'}
          </button>
        </div>
      </form>
    </div>
  );
}
