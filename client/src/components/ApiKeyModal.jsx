import { useState, useEffect } from 'react';
import { apiFetch, getApiKey, setApiKey } from '../api/client';

const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    placeholder: 'sk-ant-api03-...',
    url: 'https://console.anthropic.com/settings/keys',
    color: 'bg-orange-100 text-orange-800',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    placeholder: 'sk-...',
    url: 'https://platform.openai.com/api-keys',
    color: 'bg-green-100 text-green-800',
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    placeholder: 'AI...',
    url: 'https://aistudio.google.com/apikey',
    color: 'bg-blue-100 text-blue-800',
  },
  {
    id: 'upstage',
    name: 'Upstage (Solar)',
    placeholder: 'up_...',
    url: 'https://console.upstage.ai',
    color: 'bg-purple-100 text-purple-800',
  },
];

export default function ApiKeyModal({ open, onClose, onSaved }) {
  const [keys, setKeys] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      const loaded = {};
      for (const p of PROVIDERS) {
        loaded[p.id] = getApiKey(p.id);
      }
      setKeys(loaded);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    const hasAny = Object.values(keys).some((v) => v.trim());
    if (!hasAny) {
      setError('최소 하나의 API 키를 입력해주세요.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      for (const p of PROVIDERS) {
        setApiKey(keys[p.id]?.trim() || '', p.id);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(`저장 실패: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = () => {
    for (const p of PROVIDERS) {
      setApiKey('', p.id);
    }
    setKeys({});
    onSaved?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900 mb-1">AI API 키 설정</h3>
        <p className="text-sm text-gray-500 mb-4">
          사용할 AI 프로바이더의 API 키를 입력하세요. 키는 브라우저에만 저장됩니다.
        </p>

        <div className="space-y-3">
          {PROVIDERS.map((p) => (
            <div key={p.id}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.color}`}>
                  {p.name}
                </span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline"
                >
                  키 발급
                </a>
              </div>
              <input
                type="password"
                value={keys[p.id] || ''}
                onChange={(e) => {
                  setKeys((prev) => ({ ...prev, [p.id]: e.target.value }));
                  setError('');
                }}
                placeholder={p.placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
              />
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 mt-3">{error}</p>
        )}

        <p className="text-xs text-gray-400 mt-3">
          서버 환경변수(.env)에 키를 설정하면 브라우저 키 없이도 사용할 수 있습니다.
        </p>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={handleClearAll}
            className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors"
          >
            전체 삭제
          </button>
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