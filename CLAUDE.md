# EduFlow JS - Claude Code 프로젝트 가이드

## 프로젝트 개요

AI 교육자료 생성 플랫폼 **에듀플로** 로컬(교사용) 버전.
인증 없이 바로 사용 가능하며, API 키는 사용자가 직접 입력.

- **웹 배포 버전**: `../eduflow-deploy/` (https://eduflow-greatsong.fly.dev/)
- **원본 시스템**: `../data-ai-book/` (Python/Streamlit) — 수정 금지

## ⚠️ 개발 전략: Deploy-First

> **중요**: 주 개발은 `eduflow-deploy`에서 진행. 이 프로젝트는 동기화 대상.

### 이 프로젝트에 없는 기능 (Deploy 전용)
- Google 로그인 / EntryForm (개인정보 동의)
- 관리자 대시보드 (Admin.jsx)
- requireAuth 미들웨어 / JWT 인증
- 서버 API 키 제공 (apiMode: 'server')
- UserStore / 사용자 관리

### 동기화가 필요한 변경사항
- 템플릿 (`templates/*.json`)
- AI 프롬프트 (discussions.js, toc.js, chapters.js의 system prompt)
- 서비스 로직 (conversationManager, tocGenerator, chapterGenerator 등)
- 모델 설정 (model_config.json, 기본 모델명)
- UI 개선 (Layout, ChatInterface, 각 페이지 컴포넌트)

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
│   ├── services/                    # aiProvider, conversationManager, tocGenerator 등
│   └── middleware/                  # apiKey.js, errorHandler.js
│
├── shared/constants.js
├── templates/                       # 교육 템플릿 6종
├── model_config.json
├── .env                             # ANTHROPIC_API_KEY
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
