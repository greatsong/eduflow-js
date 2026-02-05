import { useLocation } from 'react-router-dom';

const STEPS = [
  { route: '/projects', label: '프로젝트' },
  { route: '/discussion', label: '논의' },
  { route: '/toc', label: '목차' },
  { route: '/feedback', label: '피드백' },
  { route: '/chapters', label: '챕터' },
  { route: '/deploy', label: '배포' },
];

export default function ProgressBar() {
  const { pathname } = useLocation();
  const currentIdx = STEPS.findIndex((s) => s.route === pathname);

  // 워크플로우 페이지가 아니면 숨김
  if (currentIdx === -1) return null;

  return (
    <div className="px-6 pt-4 pb-2 bg-white border-b border-gray-200">
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => (
          <div key={step.route} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  i < currentIdx
                    ? 'bg-blue-600 text-white'
                    : i === currentIdx
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < currentIdx ? '✓' : i + 1}
              </div>
              <span
                className={`text-xs mt-1 ${
                  i === currentIdx
                    ? 'text-blue-600 font-medium'
                    : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1 ${
                  i < currentIdx ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
