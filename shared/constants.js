// 워크플로우 스텝 정의
export const STEPS = [
  { id: 0, name: '프로젝트 관리', icon: '📁', route: '/projects' },
  { id: 1, name: '방향성 논의', icon: '💬', route: '/discussion' },
  { id: 2, name: '목차 작성', icon: '📋', route: '/toc' },
  { id: 3, name: '피드백 컨펌', icon: '✅', route: '/feedback' },
  { id: 4, name: '챕터 제작', icon: '✍️', route: '/chapters' },
  { id: 5, name: '배포 관리', icon: '🚀', route: '/deploy' },
];

// 챕터 상태
export const CHAPTER_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// 생성 상태
export const GENERATION_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  PAUSED: 'paused',
};

// 지원 템플릿 목록
export const TEMPLATE_IDS = [
  'programming-course',
  'school-textbook',
  'business-education',
  'workshop-material',
  'self-directed-learning',
  'teacher-guide-4c',
];

// SSE 이벤트 타입
export const SSE_EVENTS = {
  TEXT: 'text',
  PROGRESS: 'progress',
  ERROR: 'error',
  DONE: 'done',
};
