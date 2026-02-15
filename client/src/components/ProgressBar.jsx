import { useLocation } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { STEPS } from '../../../shared/constants.js';

export default function ProgressBar() {
  const { pathname } = useLocation();
  const progress = useProjectStore((s) => s.progress);
  const currentIdx = STEPS.findIndex((s) => s.route === pathname);

  // 워크플로우 페이지가 아니면 숨김
  if (currentIdx === -1) return null;

  const isStepCompleted = (step) => {
    if (!progress || !step.progressKey) return false;
    return !!progress[step.progressKey];
  };

  return (
    <div className="px-6 pt-4 pb-2 bg-white border-b border-gray-200">
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const completed = isStepCompleted(step);
          return (
            <div key={step.route} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    completed
                      ? 'bg-green-500 text-white'
                      : i === currentIdx
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {completed ? '✓' : i + 1}
                </div>
                <span
                  className={`text-xs mt-1 ${
                    i === currentIdx
                      ? 'text-blue-600 font-medium'
                      : completed
                      ? 'text-green-600'
                      : 'text-gray-400'
                  }`}
                >
                  {step.shortName}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-1 ${
                    completed ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
