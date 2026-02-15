import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import ProgressBar from './ProgressBar';
import Logo from './Logo';
import { STEPS, EXTRA_NAV } from '../../../shared/constants.js';

export default function Layout() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const progress = useProjectStore((s) => s.progress);
  const restoreProject = useProjectStore((s) => s.restoreProject);

  // 앱 시작 시 이전 프로젝트 선택 복원
  useEffect(() => {
    if (!currentProject) restoreProject();
  }, []);

  const isStepCompleted = (step) => {
    if (!progress || !step.progressKey) return false;
    return !!progress[step.progressKey];
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 사이드바 */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                에듀플로
              </h1>
              <p className="text-xs text-gray-500">AI 교육자료 생성</p>
            </div>
          </div>
        </div>

        {/* 현재 프로젝트 */}
        {currentProject && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
            <p className="text-xs text-blue-600 font-medium">현재 프로젝트</p>
            <p className="text-sm text-blue-900 font-semibold truncate">
              {currentProject.title || currentProject.name}
            </p>
          </div>
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

        {/* 하단 정보 */}
        <div className="p-4 border-t border-gray-200 text-xs text-gray-400">
          EduFlow v0.1.0
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <ProgressBar />
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
