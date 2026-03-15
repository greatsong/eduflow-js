# EduFlow - 아키텍처 문서

## 1. 시스템 개요

에듀플로는 **멀티 AI 프로바이더**를 활용한 교육자료 자동 생성 플랫폼이다.
교육자가 아이디어를 입력하면 6단계 워크플로우를 통해 완성된 교재를 생성한다.

```
[React SPA] ←→ [Express API] ←→ [AI API (Claude, GPT, Gemini, Solar)]
     │               │
     │               ├── 파일시스템 (projects/, templates/)
     │               └── CLI 도구 (mkdocs, pandoc, git, gh)
     │
     └── SSE 스트리밍 (채팅, 생성 진행률)
```

### 지원 AI 프로바이더

| 프로바이더 | SDK | 모델 접두사 | 환경변수 |
|-----------|-----|-----------|---------|
| Anthropic | @anthropic-ai/sdk | claude- | ANTHROPIC_API_KEY |
| OpenAI | openai | gpt-, o- | OPENAI_API_KEY |
| Google | @google/genai | gemini- | GOOGLE_API_KEY |
| Upstage | openai (호환) | solar- | UPSTAGE_API_KEY |

## 2. 6단계 워크플로우

| Step | 이름 | React 라우트 | Express 라우트 | 서비스 |
|------|------|-------------|---------------|--------|
| 0 | 프로젝트 관리 | `/projects` | `/api/projects` | progressManager, templateManager, referenceManager |
| 1 | 방향성 논의 | `/discussion` | `/api/projects/:id/discussions` | conversationManager |
| 2 | 목차 작성 | `/toc` | `/api/projects/:id/toc` | tocGenerator |
| 3 | 피드백 컨펌 | `/feedback` | `/api/projects/:id/discussions` | conversationManager |
| 4 | 챕터 제작 | `/chapters` | `/api/projects/:id/chapters` | chapterGenerator |
| 5 | 배포 관리 | `/deploy` | `/api/projects/:id/deploy` | deployment, docxGenerator |
| - | 포트폴리오 | `/portfolio` | `/api/portfolio` | (집계 로직) |
| - | 모델 비교 | `/compare` | `/api/compare` | aiProvider (병렬 호출) |

## 3. 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 19, Vite 6, React Router 7, Zustand 5, Tailwind CSS 4 |
| 백엔드 | Express 5, Node.js 20+ |
| AI SDK | @anthropic-ai/sdk, openai, @google/genai |
| 문서 생성 | marked (HTML), docx (DOCX), MkDocs (웹사이트) |
| 빌드 도구 | npm workspaces (client/, server/, shared/) |
| 배포 도구 | execa (CLI 실행: mkdocs, git, gh) |

## 4. 백엔드 서비스 모듈

### 4-1. aiProvider.js — 멀티 AI 통합 레이어
모든 AI API 호출을 단일 인터페이스로 추상화. 모델 ID로 프로바이더를 자동 판별.

### 4-2. chapterGenerator.js — 챕터 생성 엔진
가장 복잡한 모듈. AI API로 비동기 병렬 챕터 생성.

**핵심 기능:**
- `p-limit`으로 동시성 제어 (1~N개 병렬)
- 토큰 추정 (한국어 2자/토큰, 영어 4자/토큰)
- 레퍼런스 관련성 정렬 + 동적 잘라내기 (150K 토큰 한도)
- 8종 템플릿별 프롬프트 생성
- 비용 추적 → generation_report.json

### 4-3. tocGenerator.js — 목차 생성
레퍼런스 + 방향성 요약 → 목차 JSON 생성.

### 4-4. conversationManager.js — 대화 관리
대화 이력 저장/로드, 요약 생성.

### 4-5. progressManager.js — 진행 상태 추적
워크플로우 진행 상태 추적. `progress.json` 관리.

### 4-6. templateManager.js — 교육 템플릿 관리
8종 교육 템플릿 로드 및 적용: school-textbook, programming-course, business-education, workshop-material, self-directed-learning, teacher-guide-4c, storytelling, class-preview

### 4-7. referenceManager.js — 참고자료 관리
레퍼런스 파일 업로드/읽기/검색/삭제. multer로 업로드 처리.

### 4-8. deployment.js — 배포 엔진
MkDocs 빌드, GitHub Pages 배포. `execa`로 CLI 실행.

### 4-9. docxGenerator.js — DOCX 생성
marked + docx 패키지로 마크다운 → Word 문서 변환.

### 4-10. tokenUsageManager.js — 토큰 사용량 추적
AI API 호출 시 토큰 사용량과 비용을 기록.

## 5. API 엔드포인트 전체 목록

### 프로젝트 관리
```
GET    /api/projects                           # 목록
POST   /api/projects                           # 생성
GET    /api/projects/:id                       # 상세
PUT    /api/projects/:id                       # 수정
DELETE /api/projects/:id                       # 삭제
GET    /api/projects/:id/progress              # 진행 상태
```

### 레퍼런스
```
GET    /api/projects/:id/references            # 목록
POST   /api/projects/:id/references            # 업로드 (multipart)
GET    /api/projects/:id/references/:filename  # 읽기
DELETE /api/projects/:id/references/:filename  # 삭제
GET    /api/projects/:id/references/search?q=  # 검색
```

### 방향성 논의 / 피드백
```
GET    /api/projects/:id/discussions/:step                 # 대화 로드
POST   /api/projects/:id/discussions/:step/messages        # 메시지 저장
DELETE /api/projects/:id/discussions/:step                  # 초기화
GET    /api/projects/:id/discussions/:step/summary          # 요약 조회
POST   /api/projects/:id/discussions/:step/summarize        # 요약 생성
GET    /api/projects/:id/discussions/:step/chat (SSE)       # 스트리밍 채팅
```

### 목차
```
GET    /api/projects/:id/toc                    # 로드
PUT    /api/projects/:id/toc                    # 저장
POST   /api/projects/:id/toc/generate (SSE)     # 자동 생성
POST   /api/projects/:id/toc/confirm            # 확정
POST   /api/projects/:id/toc/outlines           # 아웃라인 생성
```

### 챕터
```
GET    /api/projects/:id/chapters                         # 목록 + 상태
GET    /api/projects/:id/chapters/:chapterId              # 내용 읽기
PUT    /api/projects/:id/chapters/:chapterId              # 내용 수정
POST   /api/projects/:id/chapters/generate-all (SSE)      # 배치 생성
POST   /api/projects/:id/chapters/:chapterId/generate     # 단일 생성
POST   /api/projects/:id/chapters/:chapterId/chat (SSE)   # 인터랙티브
```

### 배포
```
POST   /api/projects/:id/deploy/mkdocs/build    # MkDocs 빌드
POST   /api/projects/:id/deploy/mkdocs/serve    # 로컬 프리뷰
POST   /api/projects/:id/deploy/docx            # DOCX 생성
GET    /api/projects/:id/deploy/docx/download    # DOCX 다운로드
POST   /api/projects/:id/deploy/github           # GitHub Pages 배포
```

### 모델 비교
```
POST   /api/compare                # 멀티 모델 병렬 비교 (SSE)
POST   /api/compare/auto-evaluate  # AI 자동 평가
```

### 포트폴리오 / 모델
```
GET    /api/portfolio                  # 통계 + 카드
GET    /api/portfolio/:id/report       # 상세 리포트
GET    /api/models                     # 모델 목록
GET    /api/models/default/:purpose    # 기본 모델
```

## 6. 스트리밍 아키텍처 (SSE)

SSE(Server-Sent Events)를 사용하여 실시간 데이터를 프론트엔드에 전달한다.

**백엔드 패턴:**
```javascript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// AI 스트리밍 (aiProvider 통합)
const stream = await provider.streamChat({ model, messages, apiKey });
stream.on('text', (text) => {
  res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
});
stream.on('end', () => {
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
});
```

**프론트엔드 패턴:**
```javascript
const es = new EventSource(url);
es.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.type === 'done') { es.close(); return; }
  appendToResponse(data.content);
};
```

## 7. 상태 관리 (Zustand)

| Store | 역할 | 주요 상태 |
|-------|------|----------|
| `projectStore` | 프로젝트 선택/목록 | `currentProject`, `projects` |
| `chatStore` | 채팅 메시지 | `messages`, `isStreaming` |
| `generationStore` | 챕터 생성 진행 | `status`, `progress`, `logs` |

## 8. 데이터 디렉토리

프로젝트 데이터는 환경변수 또는 기본 경로에 저장:
```
PROJECTS_DIR=./projects      # 프로젝트 저장소
TEMPLATES_DIR=./templates    # 교육 템플릿
```

## 9. API 키 우선순위

```
사용자 브라우저 키 (x-{provider}-key 헤더) → 환경변수 (.env)
```

> Deploy 버전은 추가로 관리자 설정 키(settings.json)를 지원합니다.
