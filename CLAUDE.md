# EduFlow JS - Claude Code 프로젝트 가이드

## 프로젝트 개요

AI 교육자료 생성 플랫폼 **에듀플로** 로컬(교사용) 버전.
인증 없이 바로 사용 가능하며, API 키는 사용자가 직접 입력.

- **웹 배포 버전**: `../eduflow-deploy/` (https://eduflow-greatsong.fly.dev/)
- **원본 시스템**: `../data-ai-book/` (Python/Streamlit) — 수정 금지

## ⚠️ 개발 전략: Deploy-First

> **중요**: 주 개발은 `eduflow-deploy`에서 진행. 이 프로젝트는 동기화 대상.

### 이 프로젝트에 없는 기능 (Deploy 전용)
- Google 로그인 / EntryForm 실제 UI (로컬은 `components/EntryForm.jsx`에 스텁만 둠 → `getUserInfo`/`getAuthToken`/`clearUserInfo`가 null 반환)
- 관리자 대시보드 (Admin.jsx는 로컬 전용 버전 유지, deploy의 Admin과 별개)
- requireAuth / requireApproved 미들웨어 / JWT 인증
- 서버 API 키 제공 모드(`apiMode: 'server'`)의 승인·등급 로직
- `useAdminCheck` 훅은 로컬용 스텁(항상 `false`)

### 동기화가 필요한 변경사항
- 템플릿 (`templates/**/*.json`)
- AI 프롬프트 (discussions.js, toc.js, chapters.js의 system prompt)
- 서비스 로직 (conversationManager, tocGenerator, chapterGenerator, deployment, starlightGenerator 등)
- 모델 설정 (model_config.json, 기본 모델명)
- UI 개선 (Layout, ChatInterface, 각 페이지 컴포넌트)

### 최근 대형 동기화 (2026-04-21)
`eduflow-deploy` → 로컬 대규모 동기화. Starlight 빌드 스택 이식 + 다수 서비스·페이지 최신화.
- 신규 서비스: `starlightGenerator.js`, `starlight-cache/`, `fileLock.js`, `apiKeyPool.js`, `rateLimiter.js`, `sseManager.js`, `userStore.js`
- `middleware/apiKey.js`에 `requireModelAccess` 스텁 추가 (로컬은 등급 제한 없음)
- 47 파일 변경. 상세: `git log --oneline` 참조
- `/deploy/github`: 토큰 획득 우선순위 = 1) JWT 유저 → `userStore` (웹 배포판) 2) `gh auth token` CLI (로컬) 3) `GITHUB_TOKEN` 환경변수 (로컬 폴백). 로컬에서도 Starlight·MkDocs 모두 GitHub Pages 배포 가능
- 포트폴리오 업데이트(`updatePortfolioAPI`)는 `PORTFOLIO_GITHUB_TOKEN` 환경변수가 있을 때만 동작. 로컬판은 보통 미설정이라 GitHub Pages 배포는 성공하고 포트폴리오만 스킵됨 (정상 동작)

## 기술 스택

- **프론트엔드**: React 19, Vite 6, React Router 7, Zustand, Tailwind CSS 4
- **백엔드**: Express 5, 멀티 AI SDK (@anthropic-ai/sdk, openai, @google/generative-ai)
- **모노레포**: npm workspaces (`client/`, `server/`, `shared/`)

## 주요 명령어

```bash
# 전체 의존성 설치
npm install

# 개발 서버 (프론트 + 백엔드 동시)
npm run dev
# 프론트: http://localhost:7830
# 백엔드: http://localhost:7829

# 빌드
npm run build
```

## 디렉토리 구조

```
eduflow/
├── client/
│   └── src/
│       ├── App.jsx                  # 라우트 정의 (인증 없음)
│       ├── api/client.js            # apiFetch, apiSSE
│       ├── components/
│       │   ├── Layout.jsx           # 사이드바 + Outlet
│       │   ├── ProgressBar.jsx
│       │   ├── ChatInterface.jsx
│       │   └── ApiKeyModal.jsx      # API 키 직접 입력
│       └── pages/
│           ├── Home.jsx, ProjectManager.jsx
│           ├── Discussion.jsx, TableOfContents.jsx
│           ├── Feedback.jsx, ChapterCreation.jsx
│           ├── Deployment.jsx, Portfolio.jsx
│           └── ModelCompare.jsx
│
├── server/
│   ├── index.js                     # Express (인증 없음)
│   ├── routes/                      # models, projects, discussions, toc, chapters, deploy, portfolio, compare
│   ├── services/
│   │   ├── aiProvider.js, conversationManager.js, tocGenerator.js, chapterGenerator.js
│   │   ├── deployment.js            # MkDocs + Starlight 빌드 디스패처
│   │   ├── starlightGenerator.js    # Astro Starlight 프로젝트 생성
│   │   ├── starlight-cache/         # Astro/@astrojs/starlight 공용 node_modules 캐시
│   │   ├── fileLock.js              # 빌드 전역 직렬화 락
│   │   ├── apiKeyPool.js, rateLimiter.js, sseManager.js, userStore.js
│   │   └── docxGenerator.js, settings.js, referenceManager.js, tokenUsageManager.js, progressManager.js, templateManager.js
│   └── middleware/                  # apiKey.js (requireApiKey + requireModelAccess 스텁), errorHandler.js, sanitize.js
│
├── shared/constants.js              # STEPS, CHAPTER_STATUS, TIER_CONFIG 등
├── templates/what/, templates/how/  # 2축 교육 템플릿
├── model_config.json
├── .env                             # ANTHROPIC_API_KEY 등
└── package.json
```

## API 키 관리

- **기본 모델**: `claude-sonnet-4-6`
- 사용자가 ApiKeyModal에서 직접 입력 (브라우저 localStorage 저장)
- 서버 .env에 키가 있으면 사용자 입력 없이도 동작
- 멀티 프로바이더: Anthropic, OpenAI, Google, Upstage

## 코딩 컨벤션

- **파일명**: camelCase (서비스), PascalCase (React 컴포넌트)
- **언어**: 코드는 영어, UI 텍스트와 주석은 한국어
- **모듈**: ESM (`import/export`)
- **SSE 프로토콜**: `data: {"type":"text|progress|error|done", ...}\n\n`

## 새 세션에서 시작하기

```bash
cd /Users/greatsong/greatsong-project/eduflow

# 1. 이 파일(CLAUDE.md) 읽기
# 2. ../eduflow-deploy/에서 동기화할 변경사항 확인
# 3. 필요한 파일 동기화 후 빌드 테스트

npm run build  # 빌드 확인
npm run dev    # 개발 서버
```

## Starlight 빌드

Step 5 "웹사이트 설정"에서 **Starlight / MkDocs 토글** 가능.
- 기본값: `starlight`
- 선택값은 `projects/<project>/config.json`의 `deployment.theme`에 저장
- 빌드·미리보기·GitHub Pages 재배포가 모두 이 값을 참조

Starlight 첫 빌드가 오래 걸리면 공용 캐시를 워밍업:
```bash
cd server/services/starlight-cache && npm install
```
`starlight-cache/package.json`의 의존성은 `starlightGenerator.js`의 `buildPackageJson()`과 **반드시 동일 버전**으로 유지해야 함.
