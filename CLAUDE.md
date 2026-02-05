# EduFlow JS - Claude Code 프로젝트 가이드

## 프로젝트 개요

Python/Streamlit 기반 교육자료 생성 시스템 "에듀플로"를 JavaScript 풀스택으로 전환하는 프로젝트.

- **원본 시스템**: `../data-ai-book/` (Python/Streamlit) — 수정 금지
- **이 프로젝트**: React + Vite (프론트) + Express (백엔드)
- **전체 계획서**: `.claude/plans/bright-strolling-scroll.md` (data-ai-book 쪽)
- **아키텍처 문서**: `ARCHITECTURE.md`
- **진행 상태**: `PROGRESS.md`

## 기술 스택

- **프론트엔드**: React 19, Vite 6, React Router 7, Zustand, Tailwind CSS 4, react-markdown
- **백엔드**: Express 5, @anthropic-ai/sdk, multer, p-limit, execa
- **모노레포**: npm workspaces (`client/`, `server/`, `shared/`)

## 주요 명령어

```bash
# 전체 의존성 설치
npm install

# 개발 서버 (프론트 + 백엔드 동시)
npm run dev

# 프론트엔드만
npm run dev:client

# 백엔드만
npm run dev:server

# 빌드
npm run build
```

## 디렉토리 구조

```
eduflow/
├── client/              # React + Vite 프론트엔드
│   ├── src/
│   │   ├── api/         # API 호출 래퍼 (fetch, SSE)
│   │   ├── stores/      # Zustand 상태 관리
│   │   ├── components/  # 공유 UI 컴포넌트
│   │   ├── pages/       # 라우트별 페이지 (9개)
│   │   └── styles/      # Tailwind CSS
│   └── vite.config.js
├── server/              # Express 백엔드
│   ├── routes/          # API 라우트 (8개 모듈)
│   ├── services/        # 비즈니스 로직 (Python workflows → JS)
│   ├── middleware/       # API 키 검증, 에러 핸들링
│   └── config/          # 모델 설정 로더
├── shared/              # 프론트/백 공유 상수
├── package.json         # 루트 (workspaces 정의)
└── .env                 # 환경변수 (ANTHROPIC_API_KEY 등)
```

## 원본 Python 시스템과의 관계

이 JS 시스템은 원본과 **동일한 프로젝트 데이터 형식**을 사용한다:
- `projects/<name>/config.json` — 프로젝트 메타데이터
- `projects/<name>/toc.json` — 목차 구조
- `projects/<name>/progress.json` — 진행 상태
- `projects/<name>/docs/*.md` — 생성된 챕터
- `projects/<name>/discussions/*.json` — 대화 이력
- `templates/*.json` — 교육 템플릿

원본에서 생성된 프로젝트를 이 시스템에서 바로 열 수 있어야 한다.

## 코딩 컨벤션

- **파일명**: camelCase (서비스), PascalCase (React 컴포넌트)
- **API**: REST, SSE(Server-Sent Events)로 스트리밍
- **에러 핸들링**: Express asyncHandler 패턴, 프론트 try/catch + toast
- **언어**: 코드는 영어, UI 텍스트와 주석은 한국어
- **모듈**: ESM (`import/export`) 전체 사용

## 작업 시 주의사항

1. `../data-ai-book/`의 파일은 절대 수정하지 않는다
2. 프로젝트 데이터 JSON 스키마를 변경하지 않는다 (호환성 유지)
3. 각 Phase 완료 후 반드시 `PROGRESS.md`를 업데이트한다
4. 새 의존성 추가 시 해당 workspace의 package.json에 추가한다
