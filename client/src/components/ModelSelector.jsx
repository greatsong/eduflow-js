import { useState, useEffect } from 'react';
import { apiFetch, getApiKey } from '../api/client';
import { TIER_CONFIG } from '../../../shared/constants.js';

/**
 * 멀티 AI 모델 선택 드롭다운
 * - 사용 가능한 프로바이더를 자동 감지
 * - 키가 없는 모델은 잠금 표시
 * - 프리미엄 모델은 Pro 이상 등급에서만 사용 가능
 * - 키가 없는 모델 선택 시 안내 메시지 표시
 */
export default function ModelSelector({ value, onChange, defaultPurpose = 'conversation', className = '' }) {
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState({});
  const [allowedModels, setAllowedModels] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userTier, setUserTier] = useState('starter');
  const [allowPremiumModels, setAllowPremiumModels] = useState(false);

  useEffect(() => {
    // 모델 목록 + 사용 가능한 프로바이더 로드
    Promise.all([
      apiFetch('/api/models').catch(() => ({ models: [] })),
      apiFetch('/api/auth/status').catch(() => ({ serverProviders: {} })),
    ]).then(([modelData, authData]) => {
      setModels(modelData.models || []);
      setAllowedModels(authData.allowedModels || []);
      setIsAdmin(!!authData.isAdmin);
      setUserTier(authData.tier || 'starter');
      setAllowPremiumModels(!!authData.allowPremiumModels);

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

  // 본인 키가 있으면 해당 프로바이더의 프리미엄 모델 잠금 해제 (클라이언트 측)
  const isUnlockedByOwnKey = (model) => {
    if (!model?.locked) return false;
    return !!getApiKey(model.provider);
  };

  const handleChange = (e) => {
    const modelId = e.target.value;
    const model = models.find((m) => m.id === modelId);

    // 프리미엄 모델 잠금 체크 (본인 키 있으면 허용)
    if (model?.locked && !isAdmin && !isUnlockedByOwnKey(model)) {
      alert(`이 모델은 Pro 이상 등급에서만 사용할 수 있습니다.\n직접 API 키를 입력하면 등급과 무관하게 사용 가능합니다.\n현재 등급: ${TIER_CONFIG[userTier]?.label || userTier}`);
      return;
    }

    if (model && !providers[model.provider]) {
      // 키가 없는 프로바이더의 모델 선택 시 경고
      const providerName = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', upstage: 'Upstage' }[model.provider] || model.provider;
      if (!confirm(`${providerName} API 키가 설정되지 않았습니다.\n사이드바 🔑 AI 설정에서 키를 입력해주세요.\n\n그래도 선택하시겠습니까?`)) {
        return;
      }
    }
    onChange?.(modelId);
  };

  // allowedModels가 설정되어 있으면 관리자가 아닌 사용자는 해당 모델만 표시
  const filteredModels = (allowedModels.length > 0 && !isAdmin)
    ? models.filter((m) => allowedModels.includes(m.id))
    : models;

  // 현재 선택된 모델이 잠긴 프리미엄 모델인지 확인 (등급 다운그레이드 시)
  const selectedModel = models.find((m) => m.id === value);
  const isSelectedLocked = selectedModel?.locked && !isAdmin && !isUnlockedByOwnKey(selectedModel);

  return (
    <div className="inline-flex flex-col">
      <select
        value={value}
        onChange={handleChange}
        className={`border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white ${isSelectedLocked ? 'border-amber-400 bg-amber-50' : ''} ${className}`}
      >
        {filteredModels.map((m) => {
          const isAvailable = providers[m.provider];
          const isPremiumLocked = m.locked && !isAdmin && !isUnlockedByOwnKey(m);
          return (
            <option key={m.id} value={m.id} disabled={isPremiumLocked}>
              {isPremiumLocked ? '👑 ' : !isAvailable ? '🔒 ' : ''}
              {m.label}
              {isPremiumLocked ? ` (${m.lockReason || 'Pro 이상'})` : !isAvailable ? ' (키 필요)' : ''}
            </option>
          );
        })}
      </select>
      {isSelectedLocked && (
        <p className="text-xs text-amber-600 mt-1">
          ⚠️ 현재 등급({TIER_CONFIG[userTier]?.label})에서 사용할 수 없는 모델입니다. 다른 모델을 선택해주세요.
        </p>
      )}
    </div>
  );
}
