// 워크플로우 스텝 정의
export const STEPS = [
  { id: 0, name: '프로젝트 관리', shortName: '프로젝트', icon: '📁', route: '/projects', progressKey: 'project_created' },
  { id: 1, name: '방향성 논의', shortName: '논의', icon: '💬', route: '/discussion', progressKey: 'step1_completed' },
  { id: 2, name: '목차 작성', shortName: '목차', icon: '📋', route: '/toc', progressKey: 'step2_completed' },
  { id: 3, name: '피드백 컨펌', shortName: '피드백', icon: '✅', route: '/feedback', progressKey: 'step3_confirmed' },
  { id: 4, name: '챕터 제작', shortName: '챕터', icon: '✍️', route: '/chapters', progressKey: 'step4_completed' },
  { id: 5, name: '배포 관리', shortName: '배포', icon: '🚀', route: '/deploy', progressKey: 'step5_completed' },
];

// 추가 메뉴 (워크플로우 외)
export const EXTRA_NAV = [
  { name: '포트폴리오', icon: '📊', route: '/portfolio' },
  { name: 'AI 모델 비교', icon: '⚖️', route: '/compare' },
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

// 지원 템플릿 목록 (v1 레거시 호환)
export const TEMPLATE_IDS = [
  'programming-course',
  'school-textbook',
  'business-education',
  'workshop-material',
  'self-directed-learning',
  'teacher-guide-4c',
];

// 템플릿 시스템 버전 (v2: 3축 구조)
export const TEMPLATE_VERSION = {
  LEGACY: 1,
  TWO_AXIS: 2,
};

// SSE 이벤트 타입
export const SSE_EVENTS = {
  TEXT: 'text',
  PROGRESS: 'progress',
  ERROR: 'error',
  DONE: 'done',
};

// ===== 사용자 등급 시스템 =====

export const USER_TIERS = {
  STARTER: 'starter',
  STANDARD: 'standard',
  PRO: 'pro',
  MASTER: 'master',
};

export const TIER_CONFIG = {
  starter: {
    label: 'Starter',
    labelKo: '스타터',
    maxProjects: 1,
    allowPremiumModels: false,
    color: 'gray',
  },
  standard: {
    label: 'Standard',
    labelKo: '스탠다드',
    maxProjects: 3,
    allowPremiumModels: false,
    color: 'emerald',
  },
  pro: {
    label: 'Pro',
    labelKo: '프로',
    maxProjects: 5,
    allowPremiumModels: true,
    color: 'purple',
  },
  master: {
    label: 'Master',
    labelKo: '마스터',
    maxProjects: 99,
    allowPremiumModels: true,
    color: 'amber',
  },
};

// Pro 이상에서만 사용 가능한 프리미엄 모델 tier (model_config.json의 tier 값)
export const PREMIUM_MODEL_TIERS = [
  '최고 품질',        // claude-opus-4-7
  '프리미엄 추론',     // gpt-5.4-pro
  '최신 최고급 추론',  // gemini-3.1-pro-preview
];

export const TIER_ORDER = ['starter', 'standard', 'pro', 'master'];
