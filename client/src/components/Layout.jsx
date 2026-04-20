import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import ProgressBar from './ProgressBar';
import Logo from './Logo';
import ApiKeyModal from './ApiKeyModal';
import { hasApiKey, getApiKey, apiFetch } from '../api/client';
import { getUserInfo, clearUserInfo } from './EntryForm';
import { STEPS, EXTRA_NAV } from '../../../shared/constants.js';
import { useAdminCheck } from '../hooks/useAdminCheck';

export default function Layout() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const progress = useProjectStore((s) => s.progress);
  const restoreProject = useProjectStore((s) => s.restoreProject);

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [availableProviders, setAvailableProviders] = useState({ count: 0, total: 4, providers: {} });
  const isAdmin = useAdminCheck();

  // 앱 시작 시 이전 프로젝트 선택 복원
  useEffect(() => {
    if (!currentProject) restoreProject();
  }, []);

  // API 키 상태 확인 (공개 서버 키 / 비공개 관리자 키 / 내 키 구분)
  useEffect(() => {
    apiFetch('/api/auth/status')
      .then((d) => {
        const shared = d.sharedProviders || {};  // 모든 사용자에게 공개
        const server = d.serverProviders || {};  // 나에게 사용 가능한 서버 키
        const sharedCount = Object.values(shared).filter(Boolean).length;
        const adminOnlyCount = ['anthropic', 'openai', 'google', 'upstage']
          .filter(p => server[p] && !shared[p]).length;
        const userCount = ['anthropic', 'openai', 'google', 'upstage']
          .filter(p => !server[p] && !!getApiKey(p)).length;
        const totalAvailable = sharedCount + adminOnlyCount + userCount;
        setAvailableProviders({ sharedCount, adminOnlyCount, userCount, total: 4, totalAvailable, isAdmin: d.isAdmin });
        setApiKeyReady(totalAvailable > 0);
      })
      .catch(() => {
        setApiKeyReady(hasApiKey());
      });
  }, [showApiKeyModal]);

  const isStepCompleted = (step) => {
    if (!progress || !step.progressKey) return false;
    return !!progress[step.progressKey];
  };

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
      isActive
        ? 'bg-gradient-to-r from-emerald-100 to-green-50 text-emerald-800 font-semibold shadow-sm border border-emerald-200/50'
        : 'text-gray-600 hover:bg-emerald-50/60 hover:text-emerald-700'
    }`;

  return (
    <div className="flex h-screen bg-mesh">
      {/* 사이드바 */}
      <aside className="w-64 bg-gradient-to-b from-white via-white to-emerald-50/40 border-r border-emerald-100/60 flex flex-col">
        <Link to="/" className="block p-4 border-b border-emerald-100/40 hover:bg-emerald-50/30 transition-colors">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                에듀플로
              </h1>
              <p className="text-xs text-gray-400 leading-relaxed">선생님과 AI가 함께 만드는<br />오픈소스 교육자료 생성 플랫폼</p>
            </div>
          </div>
        </Link>

        {/* 현재 프로젝트 */}
        {currentProject && (
          <Link to="/" className="block px-4 py-2.5 bg-gradient-to-r from-emerald-50/80 to-green-50/60 border-b border-emerald-100/40 hover:from-emerald-100/80 hover:to-green-100/60 transition-all">
            <p className="text-xs text-emerald-500 font-medium">현재 프로젝트</p>
            <p className="text-sm text-emerald-900 font-semibold truncate">
              {currentProject.title || currentProject.name}
            </p>
          </Link>
        )}

        {/* 내비게이션 */}
        <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
          {/* 홈 */}
          <NavLink to="/" end className={navClass}>
            <span>🏠</span>
            <span>홈</span>
          </NavLink>

          {/* 워크플로우 단계 */}
          {STEPS.map((step) => {
            const completed = isStepCompleted(step);
            return (
              <NavLink key={step.route} to={step.route} className={navClass}>
                <span>{step.icon}</span>
                <span className="flex-1">{step.name}</span>
                {completed && (
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">✓</span>
                )}
              </NavLink>
            );
          })}

          <div className="my-2 mx-2 border-t border-emerald-100/60" />

          {/* 추가 메뉴 */}
          {EXTRA_NAV.map((item) => (
            <NavLink key={item.route} to={item.route} className={navClass}>
              <span>{item.icon}</span>
              <span>{item.name}</span>
            </NavLink>
          ))}

          {/* 관리자 메뉴 */}
          {isAdmin && (
            <>
              <div className="my-2 mx-2 border-t border-slate-200/60" />
              <NavLink to="/admin" className={navClass}>
                <span>🛠️</span>
                <span>관리자</span>
              </NavLink>
            </>
          )}

        </nav>

        {/* AI 설정 버튼 */}
        <div className="px-3 py-2 border-t border-emerald-100/40">
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 hover:bg-emerald-50/60 text-gray-600 hover:text-emerald-700 group"
          >
            <span>🔑</span>
            <span className="flex-1 text-left">AI API 키</span>
            <span className="flex items-center gap-1">
              {availableProviders.sharedCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700" title="공개 (모든 사용자)">
                  🌐{availableProviders.sharedCount}
                </span>
              )}
              {availableProviders.adminOnlyCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700" title="비공개 (관리자만)">
                  🔒{availableProviders.adminOnlyCount}
                </span>
              )}
              {availableProviders.userCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700" title="내 키">
                  👤{availableProviders.userCount}
                </span>
              )}
              {availableProviders.totalAvailable === 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                  0/{availableProviders.total}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* 사용자 정보 */}
        {(() => {
          const user = getUserInfo();
          return user ? (
            <div className="px-3 py-2.5 border-t border-emerald-100/40">
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-100/50">
                {user.picture && (
                  <img src={user.picture} alt="" className="w-8 h-8 rounded-full ring-2 ring-emerald-200" referrerPolicy="no-referrer" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-700 truncate">{user.name}</p>
                  <p className="text-xs text-emerald-400 truncate">{user.affiliation}</p>
                </div>
              </div>
              <button
                onClick={() => { clearUserInfo(); window.location.reload(); }}
                className="mt-1.5 w-full text-xs text-gray-400 hover:text-emerald-500 py-1 transition-colors"
              >
                로그아웃
              </button>
            </div>
          ) : null;
        })()}

        {/* 하단 정보 */}
        <div className="p-4 border-t border-emerald-100/40 text-xs text-gray-400">
          EduFlow v0.4.0
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
