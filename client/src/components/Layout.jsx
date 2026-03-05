import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import ProgressBar from './ProgressBar';
import Logo from './Logo';
import ApiKeyModal from './ApiKeyModal';
import { hasApiKey, apiFetch } from '../api/client';
import { STEPS, EXTRA_NAV } from '../../../shared/constants.js';

export default function Layout() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const progress = useProjectStore((s) => s.progress);
  const restoreProject = useProjectStore((s) => s.restoreProject);

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyReady, setApiKeyReady] = useState(false);

  // 앱 시작 시 이전 프로젝트 선택 복원
  useEffect(() => {
    if (!currentProject) restoreProject();
  }, []);

  // API 키 상태 확인 (브라우저 localStorage 또는 서버 .env)
  useEffect(() => {
    if (hasApiKey()) {
      setApiKeyReady(true);
    } else {
      apiFetch('/api/auth/status')
        .then((d) => setApiKeyReady(d.hasEnvKey))
        .catch(() => setApiKeyReady(false));
    }
  }, [showApiKeyModal]);

  const isStepCompleted = (step) => {
    if (!progress || !step.progressKey) return false;
    return !!progress[step.progressKey];
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 사이드바 */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <Link to="/" className="block p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                에듀플로
              </h1>
              <p className="text-xs text-gray-500">AI 교육자료 생성</p>
            </div>
          </div>
        </Link>

        {/* 현재 프로젝트 */}
        {currentProject && (
          <Link to="/" className="block px-4 py-2 bg-blue-50 border-b border-blue-100 hover:bg-blue-100 transition-colors">
            <p className="text-xs text-blue-600 font-medium">현재 프로젝트</p>
            <p className="text-sm text-blue-900 font-semibold truncate">
              {currentProject.title || currentProject.name}
            </p>
          </Link>
        )}

        {/* 내비게이션 */}
        <nav className="flex-1 overflow-y-auto p-2">
          {/* 홈 */}
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-900 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            <span>🏠</span>
            <span>홈</span>
          </NavLink>

          {/* 워크플로우 단계 */}
          {STEPS.map((step) => {
            const completed = isStepCompleted(step);
            return (
              <NavLink
                key={step.route}
                to={step.route}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <span>{step.icon}</span>
                <span className="flex-1">{step.name}</span>
                {completed && <span className="text-green-500 text-xs">✓</span>}
              </NavLink>
            );
          })}

          <hr className="my-2 border-gray-200" />

          {/* 추가 메뉴 */}
          {EXTRA_NAV.map((item) => (
            <NavLink
              key={item.route}
              to={item.route}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.name}</span>
            </NavLink>
          ))}

        </nav>

        {/* API 키 상태 + 설정 */}
        <div className="px-3 py-2 border-t border-gray-200">
          <button
            onClick={() => setShowApiKeyModal(true)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
              apiKeyReady
                ? 'text-green-700 bg-green-50 hover:bg-green-100'
                : 'text-orange-700 bg-orange-50 hover:bg-orange-100'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${apiKeyReady ? 'bg-green-500' : 'bg-orange-500'}`} />
            <span className="flex-1 text-left">
              {apiKeyReady ? 'API 키 설정됨' : 'API 키 필요'}
            </span>
            <span className="text-gray-400">설정</span>
          </button>
        </div>

        {/* 하단 정보 */}
        <div className="p-4 border-t border-gray-200 text-xs text-gray-400">
          EduFlow v0.2.0 Multi-AI
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <ProgressBar />
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
      <ApiKeyModal
        open={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSaved={() => setApiKeyReady(hasApiKey())}
      />
    </div>
  );
}
