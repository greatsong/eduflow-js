# EduFlow JS - 진행 상태

> 이 파일은 세션 간 연속성을 위해 각 Phase 완료 시 업데이트된다.
> 새 세션에서는 이 파일을 먼저 읽고 이어서 작업한다.

## 전체 진행률

| Phase | 설명 | 상태 | 완료일 |
|-------|------|------|-------|
| 1 | 모노레포 초기화 + 기반 구조 | ✅ 완료 | 2026-02-05 |
| 2 | 프로젝트 관리 (Step 0) | ✅ 완료 | 2026-02-05 |
| 3 | 방향성 논의 (Step 1) | ✅ 완료 | 2026-02-05 |
| 4 | 목차 + 피드백 (Step 2, 3) | ✅ 완료 | 2026-02-05 |
| 5 | 챕터 제작 (Step 4) | ✅ 완료 | 2026-02-06 |
| 6 | 배포 관리 (Step 5) | ✅ 완료 | 2026-02-06 |
| 7 | 포트폴리오 + 베타 배포 | ✅ 완료 | 2026-02-06 |
| 8 | 통합 테스트 + 배포 설정 | ✅ 완료 | 2026-02-06 |

## Phase 1 상세 (✅ 완료)

- [x] 디렉토리 구조 생성 (`client/`, `server/`, `shared/`)
- [x] CLAUDE.md, ARCHITECTURE.md, PROGRESS.md 작성
- [x] 루트 package.json (npm workspaces)
- [x] client/ 초기화: Vite 6 + React 19 + Tailwind CSS 4 + React Router 7
- [x] server/ 초기화: Express 5 + CORS + dotenv + 에러 핸들링
- [x] shared/constants.js (스텝, 상태, 템플릿, SSE 이벤트 정의)
- [x] .env.example, .gitignore
- [x] Layout 컴포넌트 (사이드바 내비게이션 + 프로젝트 표시)
- [x] ProgressBar 컴포넌트 (6단계 진행률)
- [x] API 클라이언트 (fetch + SSE + POST 스트리밍)
- [x] Zustand projectStore (프로젝트 상태 관리)
- [x] 9개 페이지 라우트 스텁 (Home~BetaDeploy)
- [x] GET /api/models 엔드포인트 (모델 목록/가격/기본값)
- [x] GET /api/health 헬스체크
- [x] model_config.json 복사
- [x] 서버 실행 검증: health + models API 정상 응답 확인
- [x] 클라이언트 빌드 검증: `vite build` 성공
- [x] Git 초기 커밋

## Phase 2 상세 (✅ 완료)

### 서버 서비스 (Python → JS 변환)
- [x] `server/services/progressManager.js` ← `workflows/progress_manager.py`
- [x] `server/services/templateManager.js` ← `workflows/template_manager.py`
- [x] `server/services/referenceManager.js` ← `workflows/reference_manager.py`

### API 라우트
- [x] `server/routes/projects.js` - CRUD (GET, POST, PUT, DELETE)
- [x] 레퍼런스 업로드 (multer) + 읽기/삭제/검색
- [x] 템플릿 목록 API (`/api/projects/templates/list`)

### 프론트엔드
- [x] `client/pages/ProjectManager.jsx` - 3탭 UI (생성, 참고자료, 직접입력)
- [x] 프로젝트 선택 드롭다운 + 상태 표시

### 데이터
- [x] `templates/` 6종 JSON 복사
- [x] `projects/template/` 스캐폴딩 디렉토리 복사

### 검증
- [x] 프로젝트 생성 → config.json 정상 생성 확인
- [x] 템플릿 적용 (programming-course) 확인
- [x] 진행 상태 API 정상 응답 확인
- [x] 레퍼런스 목록 API 정상
- [x] 프로젝트 삭제 정상
- [x] 7개 엔드포인트 전체 테스트 통과

## Phase 3 상세 (✅ 완료)

### 서버 서비스
- [x] `server/services/conversationManager.js` ← `workflows/conversation_manager.py`
  - 대화 저장/로드 (JSON 파일 기반)
  - 대화 초기화, 요약 조회
  - Claude SSE 스트리밍 요약 생성 (master-context.md 저장)

### API 라우트
- [x] `server/routes/discussions.js` - 6개 엔드포인트
  - GET /:step - 대화 로드
  - POST /:step/messages - 메시지 저장
  - DELETE /:step - 대화 초기화
  - GET /:step/summary - 요약 조회
  - POST /:step/summarize - SSE 요약 생성
  - POST /:step/chat - SSE 스트리밍 채팅 (시스템 프롬프트 + 프로젝트 정보 + 참고자료 포함)

### 프론트엔드
- [x] `client/stores/chatStore.js` - Zustand 채팅 상태 (messages, isStreaming, addMessage, appendToLastMessage)
- [x] `client/components/ChatInterface.jsx` - 범용 스트리밍 채팅 UI (ReactMarkdown, 자동 스크롤, 스트리밍 커서)
- [x] `client/pages/Discussion.jsx` - Step 1 방향성 논의 (2/3 채팅 + 1/3 요약 패널, 모델 선택)

### 검증
- [x] 클라이언트 빌드 성공 (`vite build`)
- [x] 서버 API 테스트 통과 (대화 로드/저장/삭제, 요약 조회)
- [x] Claude SSE 스트리밍은 API 키 있는 환경에서 테스트 필요

## Phase 4 상세 (✅ 완료)

### 서버 서비스
- [x] `server/services/tocGenerator.js` ← `workflows/toc_generator.py`
  - generate(): SSE 스트리밍 목차 생성 (참고자료 + 방향성 요약 기반)
  - saveToc(): JSON + MD + master-toc.md 저장
  - loadToc(): 저장된 목차 로드
  - generateOutlines(): 챕터별 아웃라인 파일 생성
  - 토큰 제한 감지, JSON 추출/파싱, 에러 파일 저장

### API 라우트
- [x] `server/routes/toc.js` - 5개 엔드포인트
  - GET / - 목차 로드
  - PUT / - 목차 저장 (JSON 편집)
  - POST /generate - SSE 목차 자동 생성 (참고자료 + 요약 자동 로드)
  - POST /confirm - 목차 확정 (progress 업데이트)
  - POST /outlines - 아웃라인 파일 생성

### 프론트엔드
- [x] `client/pages/TableOfContents.jsx` - Step 2 목차 작성
  - 2탭 UI: 목차 생성 + 목차 편집 (JSON textarea)
  - SSE 스트리밍으로 생성 과정 실시간 표시
  - Part/Chapter 트리 뷰 (접기/펼치기)
- [x] `client/pages/Feedback.jsx` - Step 3 피드백 & 컨펌
  - 1/2 채팅 + 1/2 목차 패널 레이아웃
  - ChatInterface 재사용 (Step 3 전용 시스템 프롬프트)
  - 목차 확정 버튼 + 상태 표시
- [x] `server/routes/discussions.js` - Step 3 전용 시스템 프롬프트 추가
  - Step별 프롬프트 분기 (Step 1: 방향성 논의, Step 3: TOC 검토)

### 검증
- [x] 클라이언트 빌드 성공 (`vite build`)
- [x] TOC CRUD API 테스트 통과 (로드/저장/확정/아웃라인)
- [x] 진행 상태 업데이트 확인 (step3_confirmed)
- [x] Claude SSE 스트리밍 생성은 API 키 있는 환경에서 테스트 필요

## Phase 5 상세 (✅ 완료)

### 서버 서비스
- [x] `server/services/chapterGenerator.js` ← `workflows/chapter_generator.py` (핵심 모듈, ~660줄)
  - 6종 템플릿별 프롬프트 설정 (TEMPLATE_PROMPTS)
  - 비동기 병렬 생성 (p-limit), 토큰 추정 (한국어/영어 구분)
  - 레퍼런스 관련성 정렬 + 동적 잘라내기 (150K 토큰 한도)
  - 시간 제약 기반 max_tokens 자동 조정
  - 비용 추적 + generation_report.json
  - BUG-001 수정: 모델 가격을 init()에서 한 번만 로드 (캐싱)

### API 라우트
- [x] `server/routes/chapters.js` - 6개 엔드포인트
  - GET / - 챕터 목록 + 상태 + 리포트
  - GET /:chapterId - 챕터 내용 읽기
  - PUT /:chapterId - 챕터 내용 수정
  - POST /generate-all (SSE) - 배치 생성 (진행률 스트리밍)
  - POST /:chapterId/generate - 단일 챕터 생성
  - POST /:chapterId/chat (SSE) - 인터랙티브 채팅

### 프론트엔드
- [x] `client/pages/ChapterCreation.jsx` - 3탭 UI (~450줄)
  - 대화형 모드: 챕터 선택 → Claude 채팅 + 실시간 미리보기 + 내용 적용/저장
  - 배치 자동화: 모델/토큰/동시실행 설정 → SSE 진행률 + 로그 → 비용 리포트
  - 챕터 편집: 사이드바 목록 + 마크다운 편집기 + 미리보기 전환 + 통계

### 검증
- [x] 클라이언트 빌드 성공 (`vite build`)
- [x] 챕터 CRUD API 테스트 통과 (목록/읽기/저장/404)
- [x] 서버 시작 정상 확인
- [x] Claude SSE 스트리밍 (배치/인터랙티브)는 API 키 있는 환경에서 테스트 필요

## Phase 6 상세 (✅ 완료)

### 서버 서비스
- [x] `server/services/deployment.js` ← `workflows/deployment.py` (~240줄)
  - CLI 도구 상태 확인 (mkdocs, pandoc, git, gh)
  - MkDocs 설정 생성 (mkdocs.yml + index.md, TOC 기반 nav)
  - MkDocs 빌드 및 로컬 프리뷰 (execa)
  - Pandoc DOCX 변환 (챕터 합치기 + TOC 순서)
  - GitHub Pages 배포 (저장소 생성/확인 + gh-deploy)

### API 라우트
- [x] `server/routes/deploy.js` - 7개 엔드포인트
  - GET /status - 도구 상태 + 챕터 수 + GitHub 사용자
  - POST /mkdocs/config - MkDocs 설정 생성
  - POST /mkdocs/build - 웹사이트 빌드
  - POST /mkdocs/serve - 로컬 프리뷰 시작
  - POST /docx - DOCX 생성
  - GET /docx/download - DOCX 다운로드 (스트림)
  - POST /github - GitHub Pages 배포

### 프론트엔드
- [x] `client/pages/Deployment.jsx` - 3탭 UI (~350줄)
  - MkDocs 웹사이트: 설정 생성 + 빌드/프리뷰 + GitHub Pages 배포
  - DOCX 문서: 제목 입력 + 생성 + 다운로드
  - 미리보기: 챕터 선택 + 마크다운 렌더링

### 검증
- [x] 클라이언트 빌드 성공 (`vite build`)
- [x] 배포 상태 API 정상 (도구 확인: mkdocs, pandoc, git, gh)
- [x] MkDocs 설정 생성 API 정상
- [x] 실제 MkDocs/Pandoc/GitHub 배포는 챕터 데이터가 있는 프로젝트에서 테스트 필요

## Phase 7 상세 (✅ 완료)

### 서버 라우트
- [x] `server/routes/portfolio.js` - 통계 집계 API (~180줄)
  - GET / - 전체 프로젝트 스캔 + 통계 집계 (파트/챕터/비용/페이지)
  - GET /:id/report - 프로젝트 상세 리포트
  - GET /:id/chapter/:chapterId - 챕터 미리보기
  - 진행 상태 판단 (progress.json + 실제 파일 교차 확인)
  - 비용 추정 (estimated_cost > total_tokens 폴백)
- [x] `server/routes/beta.js` - GitHub CLI 연동 (~200줄)
  - GET /config - 베타 설정 로드
  - GET /github-status - gh CLI/인증/사용자명 확인
  - POST /repo - 저장소 생성 (git init + commit + gh repo create)
  - POST /testers - 테스터 초대 (collaborator 추가)
  - DELETE /testers/:username - 테스터 제거
  - POST /push - 커밋 & 푸시
  - PUT /config - 설정 업데이트 (초대 메시지 등)
  - DELETE /config - 설정 초기화

### 프론트엔드
- [x] `client/pages/Portfolio.jsx` - 대시보드 (~290줄)
  - 5개 통계 카드 (프로젝트/완료/챕터/분량/비용)
  - 필터(전체/완료/진행중/미시작) + 정렬(최신/오래된/이름)
  - 2열 프로젝트 카드 그리드 (상태 배지, 메타 정보, 배지)
  - 상세 보기 슬라이드 패널 (목차 트리, 생성 리포트)
  - 챕터 미리보기 패널 (ReactMarkdown, 10K자 제한)
- [x] `client/pages/BetaDeploy.jsx` - 4탭 UI (~330줄)
  - 상태바 (gh CLI/인증/저장소/테스터)
  - 1️⃣ 저장소 생성: gh 설치/인증 확인 + 저장소 생성 + 푸시
  - 2️⃣ 테스터 초대: 사용자명 입력 + 초대/제거 + 목록
  - 3️⃣ 초대 메시지: 템플릿 편집 + 저장/복사
  - 4️⃣ 관리: 커밋&푸시 + 설정 초기화 + 현재 설정 JSON 표시

### 검증
- [x] 클라이언트 빌드 성공 (`vite build`)
- [x] Portfolio API 정상 (프로젝트 목록 + 통계 집계)
- [x] Beta GitHub Status API 정상 (gh 설치/인증/사용자명)
- [x] Beta Config API 정상 (설정 로드)

## Phase 8 상세 (✅ 완료)

### 통합 테스트
- [x] 전체 워크플로우 E2E API 테스트 (18개 GET 엔드포인트 전부 200 OK)
  - health, models, projects, discussions, toc, chapters, deploy, portfolio, beta
- [x] 기존 프로젝트 데이터 호환성 검증
  - pico-basic (Python 시스템에서 생성) → JS 시스템에서 정상 로드
  - config.json, progress.json, toc.json, generation_report.json 모두 호환
  - 18개 챕터 파일 읽기/미리보기 정상
  - 포트폴리오 통계: 18/18 완료, 121페이지, $10.99 비용 정상 집계
- [x] DOCX 호환성 수정: output/ + 프로젝트 루트 양쪽에서 탐색

### 배포 설정
- [x] Vercel 프론트엔드: `client/vercel.json` (SPA rewrite)
- [x] Railway 백엔드: `Dockerfile` + `railway.json` (Node 22, healthcheck)
- [x] 환경변수 가이드: `.env.example` 업데이트 (로컬/배포 분리)

## 개발 환경 실행

```bash
cd /Users/greatsong/greatsong-project/eduflow

# 전체 의존성 설치
npm install

# 개발 서버 (프론트 + 백엔드 동시)
npm run dev

# 또는 개별 실행
npm run dev:client   # http://localhost:5173
npm run dev:server   # http://localhost:3001
```

## 배포 가이드

### 프론트엔드 (Vercel)
```bash
cd client
vercel --prod
# 환경변수: VITE_API_URL=https://your-backend.railway.app
```

### 백엔드 (Railway)
```bash
railway up
# 환경변수: ANTHROPIC_API_KEY, CLIENT_URL, PORT (자동)
# 영속 볼륨: /app/projects 마운트
```

## 주요 참고 파일 (원본 Python 시스템)

| 원본 파일 | 경로 | JS 대상 |
|----------|------|---------|
| chapter_generator.py | `../data-ai-book/workflows/chapter_generator.py` | `server/services/chapterGenerator.js` |
| toc_generator.py | `../data-ai-book/workflows/toc_generator.py` | `server/services/tocGenerator.js` |
| conversation_manager.py | `../data-ai-book/workflows/conversation_manager.py` | `server/services/conversationManager.js` |
| progress_manager.py | `../data-ai-book/workflows/progress_manager.py` | `server/services/progressManager.js` |
| template_manager.py | `../data-ai-book/workflows/template_manager.py` | `server/services/templateManager.js` |
| reference_manager.py | `../data-ai-book/workflows/reference_manager.py` | `server/services/referenceManager.js` |
| deployment.py | `../data-ai-book/workflows/deployment.py` | `server/services/deployment.js` |
| navigation.py | `../data-ai-book/workflows/navigation.py` | `client/components/` (ProgressBar, NavigationButtons) |
| utils.py | `../data-ai-book/workflows/utils.py` | `server/services/utils.js` + `server/config/modelConfig.js` |

---

## 변경 이력

### 2026-02-05 - 세션 1
- Phase 1 완료: 모노레포 구조, React+Vite 프론트, Express 백엔드, 문서화
- Phase 2 완료: 프로젝트 관리 서비스 3개 + API 라우트 + UI
  - progressManager, templateManager, referenceManager (Python → JS)
  - 프로젝트 CRUD + 레퍼런스 관리 + 템플릿 목록 API
  - ProjectManager.jsx (3탭: 생성, 참고자료, 직접입력)
  - 7개 API 엔드포인트 테스트 통과
- Phase 3 완료: 방향성 논의 (Step 1) SSE 채팅 + 대화 관리
  - conversationManager.js (Python → JS 변환)
  - discussions.js 라우트 6개 엔드포인트 (SSE 스트리밍 채팅/요약)
  - ChatInterface.jsx 범용 채팅 컴포넌트 (재사용 가능)
  - Discussion.jsx (채팅 + 요약 패널 + 모델 선택)
  - chatStore.js (Zustand 채팅 상태 관리)
- Phase 4 완료: 목차 작성 + 피드백 (Step 2, 3)
  - tocGenerator.js (Python → JS 변환, SSE 스트리밍 생성)
  - toc.js 라우트 5개 엔드포인트 (생성/CRUD/확정/아웃라인)
  - TableOfContents.jsx (2탭: 생성+편집, Part/Chapter 트리 뷰)
  - Feedback.jsx (채팅+목차 패널+확정, ChatInterface 재사용)
  - discussions.js Step 3 전용 시스템 프롬프트 추가

### 2026-02-06 - 세션 2
- Phase 5 완료: 챕터 제작 (Step 4) - 가장 복잡한 모듈
  - chapterGenerator.js (~660줄, Python 899줄 → JS 변환)
    - 6종 템플릿 프롬프트, p-limit 병렬 생성, 토큰 추정, 비용 추적
    - 레퍼런스 관련성 정렬, 시간 제약 기반 토큰 자동 조정
  - chapters.js 라우트 6개 엔드포인트 (배치 SSE, 단일 생성, CRUD, 인터랙티브 채팅)
  - ChapterCreation.jsx 3탭 UI (~450줄)
    - 대화형 모드 (채팅 + 미리보기 + 내용 적용/저장)
    - 배치 자동화 (설정 + SSE 로그 + 비용 리포트)
    - 챕터 편집 (사이드바 + 에디터 + 미리보기)
  - ISSUES-FROM-ORIGINAL.md 작성 (원본 시스템 버그 7개 + 개선 3개 + 리팩토링 3개)
- Phase 6 완료: 배포 관리 (Step 5)
  - deployment.js (~240줄, Python 293줄 → JS 변환, execa로 CLI 실행)
    - MkDocs 설정 생성/빌드/프리뷰, Pandoc DOCX 변환, GitHub Pages 배포
  - deploy.js 라우트 7개 엔드포인트 (상태/설정/빌드/프리뷰/DOCX생성/다운로드/GitHub)
  - Deployment.jsx 3탭 UI (~350줄)
    - MkDocs 웹사이트 (설정+빌드+프리뷰+GitHub Pages)
    - DOCX 문서 (생성+다운로드)
    - 미리보기 (챕터 선택+렌더링)
- Phase 7 완료: 포트폴리오 + 베타 배포
  - portfolio.js 라우트 3개 엔드포인트 (전체 스캔+통계, 상세 리포트, 챕터 미리보기)
  - beta.js 라우트 8개 엔드포인트 (설정/상태/리포 생성/테스터/푸시/초기화)
  - Portfolio.jsx (통계 대시보드 + 카드 그리드 + 상세 패널 + 미리보기)
  - BetaDeploy.jsx (4탭: 저장소/테스터/메시지/관리)
- Phase 8 완료: 통합 테스트 + 배포 설정
  - 18개 GET API 엔드포인트 전체 200 OK
  - pico-basic 호환성 검증: 18/18 챕터, 121페이지, $10.99 비용 정상
  - DOCX 호환성 수정 (output/ + 루트 양쪽 탐색)
  - Vercel 설정 (client/vercel.json), Railway 설정 (Dockerfile + railway.json)
  - .env.example 업데이트 (로컬/배포 환경변수 가이드)
