import { useState, useEffect } from 'react';
import { apiFetch, getApiKey } from '../api/client';

/**
 * 멀티 AI 모델 선택 드롭다운
 * - 사용 가능한 프로바이더를 자동 감지
 * - 키가 없는 모델은 잠금 표시
 * - 키가 없는 모델 선택 시 안내 메시지 표시
 */
export default function ModelSelector({ value, onChange, defaultPurpose = 'conversation', className = '' }) {
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState({});

  useEffect(() => {
    // 모델 목록 + 사용 가능한 프로바이더 로드
    Promise.all([
      apiFetch('/api/models').catch(() => ({ models: [] })),
      apiFetch('/api/auth/status').catch(() => ({ serverProviders: {} })),
    ]).then(([modelData, authData]) => {
      setModels(modelData.models || []);

      // 사용 가능 프로바이더 계산 (서버 + 사용자 키)
      const sp = authData.serverProviders || {};
      setProviders({
        anthropic: sp.anthropic || !!getApiKey('anthropic'),
        openai: sp.openai || !!getApiKey('openai'),
        google: sp.google || !!getApiKey('google'),
        upstage: sp.upstage || !!getApiKey('upstage'),
      });

      // 기본 모델 설정
      if (!value && defaultPurpose) {
        apiFetch(`/api/models/default/${defaultPurpose}`)
          .then((r) => onChange?.(r.modelId))
          .catch(() => {});
      }
    });
  }, []);

  const handleChange = (e) => {
    const modelId = e.target.value;
    const model = models.find((m) => m.id === modelId);
    if (model && !providers[model.provider]) {
      // 키가 없는 프로바이더의 모델 선택 시 경고
      const providerName = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', upstage: 'Upstage' }[model.provider] || model.provider;
      if (!confirm(`${providerName} API 키가 설정되지 않았습니다.\n사이드바 🔑 AI 설정에서 키를 입력해주세요.\n\n그래도 선택하시겠습니까?`)) {
        return;
      }
    }
    onChange?.(modelId);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className={`border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white ${className}`}
    >
      {models.map((m) => {
        const isAvailable = providers[m.provider];
        return (
          <option key={m.id} value={m.id}>
            {isAvailable ? '' : '🔒 '}{m.label}{!isAvailable ? ' (키 필요)' : ''}
          </option>
        );
      })}
    </select>
  );
}
