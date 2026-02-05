# EduFlow JS - Claude Code 프로젝트 가이드

## 프로젝트 개요

Python/Streamlit 기반 교육자료 생성 시스템 "에듀플로"를 JavaScript 풀스택으로 전환하는 프로젝트.

- **원본 시스템**: `../data-ai-book/` (Python/Streamlit) — 수정 금지
- **이 프로젝트**: React + Vite (프론트) + Express (백엔드)
- **전체 계획서**: `~/.claude/plans/bright-strolling-scroll.md`
- **아키텍처 문서**: `ARCHITECTURE.md`
- **진행 상태**: `PROGRESS.md` ← **새 세션에서 반드시 이것부터 읽기**

## 현재 구현 상태 (Phase 7/8 완료)

| 구분 | 구현 완료 | 미구현 |
|------|----------|--------|
| **서비스** | progressManager, templateManager, referenceManager, conversationManager, tocGenerator, chapterGenerator, deployment | utils (부분 완료: modelConfig.js) |
| **라우트** | models, projects, discussions, toc, chapters, deploy, **portfolio, beta** | - (전체 완료) |
| **페이지** | Home, ProjectManager, Discussion, TableOfContents, Feedback, ChapterCreation, Deployment, **Portfolio, BetaDeploy** | - (전체 완료) |
| **컴포넌트** | Layout, ProgressBar, ChatInterface | MarkdownPreview, ModelSelector (필요시 추가) |
| **스토어** | projectStore, chatStore | generationStore (불필요 - ChapterCreation 내부 state로 처리) |

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
npm run dev:client   # http://localhost:5173

# 백엔드만
npm run dev:server   # http://localhost:3001

# 빌드
cd client && npx vite build
```

## 디렉토리 구조 (현재)

```
eduflow/
├── client/
│   ├── index.html
│   ├── vite.config.js               # Vite + React + Tailwind + proxy → :3001
│   ├── package.json
│   └── src/
│       ├── main.jsx                  # React 엔트리
│       ├── App.jsx                   # React Router 라우트 정의
│       ├── api/
│       │   └── client.js             # apiFetch, apiSSE, apiStreamPost
│       ├── stores/
│       │   ├── projectStore.js       # 프로젝트 선택/목록 (Zustand)
│       │   └── chatStore.js          # 채팅 메시지/스트리밍 (Zustand)
│       ├── components/
│       │   ├── Layout.jsx            # 사이드바 + Outlet 레이아웃
│       │   ├── ProgressBar.jsx       # 6단계 진행률 바
│       │   └── ChatInterface.jsx     # 범용 스트리밍 채팅 (재사용)
│       ├── pages/
│       │   ├── Home.jsx              # / (랜딩)
│       │   ├── ProjectManager.jsx    # /projects (Step 0) - 3탭
│       │   ├── Discussion.jsx        # /discussion (Step 1) - 채팅+요약
│       │   ├── TableOfContents.jsx   # /toc (Step 2) - 생성+편집 2탭
│       │   ├── Feedback.jsx          # /feedback (Step 3) - 채팅+목차+확정
│       │   ├── ChapterCreation.jsx   # /chapters (Step 4) - 3탭
│       │   ├── Deployment.jsx        # /deploy (Step 5) - 3탭
│       │   ├── Portfolio.jsx         # /portfolio - 대시보드+카드
│       │   └── BetaDeploy.jsx        # /beta - 4탭
│       └── styles/
│           └── globals.css           # Tailwind CSS
│
├── server/
│   ├── index.js                      # Express 엔트리 (라우트 등록)
│   ├── package.json
│   ├── routes/
│   │   ├── models.js                 # GET /api/models
│   │   ├── projects.js               # CRUD + references + templates
│   │   ├── discussions.js            # 대화 CRUD + SSE 채팅 (Step 1, 3)
│   │   ├── toc.js                    # TOC 생성(SSE)/CRUD/확정/아웃라인
│   │   ├── chapters.js              # 챕터 CRUD + SSE 배치 생성/채팅
│   │   ├── deploy.js                # MkDocs/DOCX/GitHub Pages 배포
│   │   ├── portfolio.js             # 프로젝트 통계/리포트/미리보기
│   │   └── beta.js                  # GitHub 리포/테스터/푸시 관리
│   ├── services/
│   │   ├── progressManager.js        # ✅ progress.json 관리
│   │   ├── templateManager.js        # ✅ 템플릿 로드/적용
│   │   ├── referenceManager.js       # ✅ 파일 업로드/읽기/삭제
│   │   ├── conversationManager.js    # ✅ 대화 저장/로드/요약
│   │   ├── tocGenerator.js           # ✅ 목차 생성/저장/아웃라인
│   │   ├── chapterGenerator.js      # ✅ 챕터 생성 (병렬/비용추적)
│   │   └── deployment.js            # ✅ MkDocs/DOCX/GitHub 배포
│   ├── middleware/
│   │   ├── apiKey.js                 # API 키 검증 미들웨어
│   │   └── errorHandler.js           # asyncHandler + errorHandler
│   └── config/
│       └── modelConfig.js            # model_config.json 로더 (60s 캐시)
│
├── shared/
│   └── constants.js                  # STEPS, CHAPTER_STATUS, SSE_EVENTS 등
│
├── projects/                         # 프로젝트 데이터 (gitignore 대상)
├── templates/                        # 교육 템플릿 6종 JSON
├── model_config.json                 # Claude 모델 설정
├── .env                              # 환경변수 (ANTHROPIC_API_KEY)
├── .env.example
├── .gitignore
├── package.json                      # 루트 (workspaces)
├── CLAUDE.md                         # 이 파일
├── ARCHITECTURE.md                   # 아키텍처 상세
└── PROGRESS.md                       # Phase별 진행 상태 + 체크리스트
```

## 원본 Python → JS 변환 상태

| 원본 파일 | JS 대상 | 상태 |
|----------|---------|------|
| `conversation_manager.py` | `server/services/conversationManager.js` | ✅ |
| `progress_manager.py` | `server/services/progressManager.js` | ✅ |
| `template_manager.py` | `server/services/templateManager.js` | ✅ |
| `reference_manager.py` | `server/services/referenceManager.js` | ✅ |
| `toc_generator.py` | `server/services/tocGenerator.js` | ✅ |
| `chapter_generator.py` (899줄) | `server/services/chapterGenerator.js` | ✅ Phase 5 |
| `deployment.py` | `server/services/deployment.js` | ✅ Phase 6 |
| `utils.py` | `server/config/modelConfig.js` (부분) | 부분 ✅ |
| `navigation.py` | `client/components/ProgressBar.jsx` 등 | ✅ |

원본 경로: `../data-ai-book/workflows/`

## 데이터 호환성

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
- **에러 핸들링**: Express asyncHandler 패턴, 프론트 try/catch
- **언어**: 코드는 영어, UI 텍스트와 주석은 한국어
- **모듈**: ESM (`import/export`) 전체 사용
- **SSE 프로토콜**: `data: {"type":"text|progress|error|done", ...}\n\n`

## 작업 시 주의사항

1. `../data-ai-book/`의 파일은 절대 수정하지 않는다
2. 프로젝트 데이터 JSON 스키마를 변경하지 않는다 (호환성 유지)
3. 각 Phase 완료 후 반드시 `PROGRESS.md`를 업데이트한다
4. 새 의존성 추가 시 해당 workspace의 package.json에 추가한다
5. 한 Phase씩 작업 → 테스트 → 커밋 → 사용자 확인 → 다음 Phase

## 새 세션에서 시작하기

```bash
cd /Users/greatsong/greatsong-project/eduflow

# 1. PROGRESS.md 읽어 현재 Phase 확인
# 2. 이 파일(CLAUDE.md) 읽어 프로젝트 컨벤션 확인
# 3. ARCHITECTURE.md 읽어 설계 이해 (필요시)
# 4. 해당 Phase 체크리스트부터 이어서 작업

# 개발 서버 실행
npm run dev          # 프론트 + 백엔드 동시
npm run dev:client   # http://localhost:5173
npm run dev:server   # http://localhost:3001
```
