import { useState } from 'react';
import { apiFetch, getApiKey, setApiKey } from '../api/client';

export default function ApiKeyModal({ open, onClose, onSaved }) {
  const [key, setKey] = useState(getApiKey());
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError('API 키를 입력해주세요.');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const result = await apiFetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'x-api-key': trimmed },
      });

      if (result.valid) {
        setApiKey(trimmed);
        onSaved?.();
        onClose();
      } else {
        setError(result.message || '유효하지 않은 API 키입니다.');
      }
    } catch (e) {
      setError(`검증 실패: ${e.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleRemove = () => {
    setApiKey('');
    setKey('');
    onSaved?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900 mb-1">API 키 설정</h3>
        <p className="text-sm text-gray-500 mb-4">
          Anthropic API 키를 입력하세요. 키는 브라우저에만 저장됩니다.
        </p>

        <input
          type="password"
          value={key}
          onChange={(e) => { setKey(e.target.value); setError(''); }}
          placeholder="sk-ant-api03-..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          autoFocus
        />

        {error && (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        )}

        <p className="text-xs text-gray-400 mt-2">
          API 키는 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">console.anthropic.com</a>에서 발급받을 수 있습니다.
        </p>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={verifying}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {verifying ? '검증 중...' : '저장'}
          </button>
          {getApiKey() && (
            <button
              onClick={handleRemove}
              className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors"
            >
              삭제
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
