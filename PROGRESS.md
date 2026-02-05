# EduFlow JS - 진행 상태

> 이 파일은 세션 간 연속성을 위해 각 Phase 완료 시 업데이트된다.
> 새 세션에서는 이 파일을 먼저 읽고 이어서 작업한다.

## 전체 진행률

| Phase | 설명 | 상태 | 완료일 |
|-------|------|------|-------|
| 1 | 모노레포 초기화 + 기반 구조 | ✅ 완료 | 2026-02-05 |
| 2 | 프로젝트 관리 (Step 0) | ✅ 완료 | 2026-02-05 |
| 3 | 방향성 논의 (Step 1) | ✅ 완료 | 2026-02-05 |
| 4 | 목차 + 피드백 (Step 2, 3) | ⬜ 대기 | - |
| 5 | 챕터 제작 (Step 4) | ⬜ 대기 | - |
| 6 | 배포 관리 (Step 5) | ⬜ 대기 | - |
| 7 | 포트폴리오 + 베타 배포 | ⬜ 대기 | - |
| 8 | 통합 테스트 + 배포 설정 | ⬜ 대기 | - |

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

## Phase 4 상세 (⬜ 다음 작업)

### 서버 서비스
- [ ] `server/services/tocGenerator.js` ← `workflows/toc_generator.py`

### API 라우트
- [ ] `server/routes/toc.js` - TOC 생성(SSE) + CRUD + 확정 + 아웃라인 생성

### 프론트엔드
- [ ] `client/pages/TableOfContents.jsx` - TOC 자동 생성 + JSON 편집
- [ ] `client/pages/Feedback.jsx` - TOC 리뷰 채팅 + 확정

### 검증
- [ ] TOC 스트리밍 생성 테스트
- [ ] TOC JSON 편집/저장 확인
- [ ] 아웃라인 파일 자동 생성 확인

## 다음 세션에서 이어하기

```bash
cd /Users/greatsong/greatsong-project/eduflow

# 1. 이 파일(PROGRESS.md) 읽어 현재 상태 파악
# 2. CLAUDE.md 읽어 프로젝트 컨벤션 확인
# 3. ARCHITECTURE.md 읽어 설계 이해
# 4. Phase 4 체크리스트부터 이어서 작업

# 개발 서버 실행
npm run dev

# 또는 개별 실행
npm run dev:client   # http://localhost:5173
npm run dev:server   # http://localhost:3001
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
