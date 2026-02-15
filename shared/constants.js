// 워크플로우 스텝 정의
export const STEPS = [
  { id: 0, name: '프로젝트 관리', shortName: '프로젝트', icon: '📁', route: '/projects', progressKey: null },
  { id: 1, name: '방향성 논의', shortName: '논의', icon: '💬', route: '/discussion', progressKey: 'step1_completed' },
  { id: 2, name: '목차 작성', shortName: '목차', icon: '📋', route: '/toc', progressKey: 'step2_completed' },
  { id: 3, name: '피드백 컨펌', shortName: '피드백', icon: '✅', route: '/feedback', progressKey: 'step3_confirmed' },
  { id: 4, name: '챕터 제작', shortName: '챕터', icon: '✍️', route: '/chapters', progressKey: 'step4_completed' },
  { id: 5, name: '배포 관리', shortName: '배포', icon: '🚀', route: '/deploy', progressKey: 'step5_completed' },
];

// 추가 메뉴 (워크플로우 외)
export const EXTRA_NAV = [
  { name: '포트폴리오', icon: '📊', route: '/portfolio' },
  { name: '베타 배포', icon: '🎁', route: '/beta' },
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
