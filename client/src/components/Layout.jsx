import { NavLink, Outlet } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import ProgressBar from './ProgressBar';

const NAV_ITEMS = [
  { to: '/', label: '홈', icon: '🏠' },
  { to: '/projects', label: '프로젝트 관리', icon: '📁' },
  { to: '/discussion', label: '방향성 논의', icon: '💬' },
  { to: '/toc', label: '목차 작성', icon: '📋' },
  { to: '/feedback', label: '피드백 컨펌', icon: '✅' },
  { to: '/chapters', label: '챕터 제작', icon: '✍️' },
  { to: '/deploy', label: '배포 관리', icon: '🚀' },
  { divider: true },
  { to: '/portfolio', label: '포트폴리오', icon: '📊' },
  { to: '/beta', label: '베타 배포', icon: '🎁' },
];

export default function Layout() {
  const currentProject = useProjectStore((s) => s.currentProject);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 사이드바 */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">에듀플로</h1>
          <p className="text-xs text-gray-500 mt-1">AI 교육자료 생성</p>
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
          {NAV_ITEMS.map((item, i) =>
            item.divider ? (
              <hr key={i} className="my-2 border-gray-200" />
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          )}
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
