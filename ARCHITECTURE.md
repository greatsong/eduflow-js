# EduFlow JS - 아키텍처 문서

## 1. 시스템 개요

에듀플로는 Claude AI를 활용한 교육자료 자동 생성 플랫폼이다.
교육자가 아이디어를 입력하면 6단계 워크플로우를 통해 완성된 교재를 생성한다.

```
[React SPA] ←→ [Express API] ←→ [Claude API]
     │               │
     │               ├── 파일시스템 (projects/, templates/)
     │               └── CLI 도구 (mkdocs, pandoc, git, gh)
     │
     └── SSE 스트리밍 (채팅, 생성 진행률)
```

## 2. 6단계 워크플로우

| Step | 이름 | React 라우트 | Express 라우트 | 서비스 |
|------|------|-------------|---------------|--------|
| 0 | 프로젝트 관리 | `/projects` | `/api/projects` | progressManager, templateManager, referenceManager |
| 1 | 방향성 논의 | `/discussion` | `/api/projects/:id/discussions` | conversationManager |
| 2 | 목차 작성 | `/toc` | `/api/projects/:id/toc` | tocGenerator |
| 3 | 피드백 컨펌 | `/feedback` | `/api/projects/:id/discussions` | conversationManager |
| 4 | 챕터 제작 | `/chapters` | `/api/projects/:id/chapters` | chapterGenerator |
| 5 | 배포 관리 | `/deploy` | `/api/projects/:id/deploy` | deployment |
| - | 포트폴리오 | `/portfolio` | `/api/portfolio` | (집계 로직) |
| - | 베타 배포 | `/beta` | `/api/beta` | (GitHub CLI 연동) |

## 3. 백엔드 서비스 모듈

### 3-1. chapterGenerator.js (← chapter_generator.py, 799줄)
가장 복잡한 모듈. Claude API로 비동기 병렬 챕터 생성.

**핵심 기능:**
- `p-limit`으로 동시성 제어 (1~N개 병렬)
- 토큰 추정 (한국어 2자/토큰, 영어 4자/토큰)
- 레퍼런스 관련성 정렬 + 동적 잘라내기 (150K 토큰 한도)
- 6종 템플릿별 프롬프트 생성
- 비용 추적 → generation_report.json

**API 호출 패턴:**
```javascript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey });

// 배치 생성 (비동기)
const response = await client.messages.create({
  model: 'claude-opus-4-5-20251101',
  max_tokens: 16000,
  messages: [{ role: 'user', content: prompt }]
});
```

### 3-2. tocGenerator.js (← toc_generator.py, 319줄)
레퍼런스 + 방향성 요약 → 목차 JSON 생성.

**출력 형식:**
```json
{
  "title": "교육자료 제목",
  "parts": [{
    "part_number": 1,
    "part_title": "Part 제목",
    "chapters": [{
      "chapter_id": "chapter01",
      "chapter_title": "챕터 제목",
      "learning_objectives": ["목표1", "목표2"],
      "outline": "개요 텍스트"
    }]
  }]
}
```

### 3-3. conversationManager.js (← conversation_manager.py, 293줄)
대화 이력 저장/로드, 요약 생성.

**파일 구조:**
```
discussions/step1_conversation.json → { step, messages: [{role, content, timestamp}] }
discussions/step1_summary.md → 마크다운 요약 (= master-context.md)
```

### 3-4. progressManager.js (← progress_manager.py, 282줄)
워크플로우 진행 상태 추적.

**파일:** `progress.json`
```json
{
  "step1_completed": true,
  "step2_completed": true,
  "step3_confirmed": false,
  "chapters": { "chapter01": { "status": "completed" } }
}
```

### 3-5. templateManager.js (← template_manager.py, 122줄)
교육 템플릿 6종 로드 및 적용.

**템플릿 종류:** programming-course, school-textbook, business-education, workshop-material, self-directed-learning, teacher-guide-4c

### 3-6. referenceManager.js (← reference_manager.py, 162줄)
레퍼런스 파일 업로드/읽기/검색/삭제. multer로 업로드 처리.

### 3-7. deployment.js (← deployment.py, 293줄)
MkDocs 빌드, Pandoc DOCX 변환, Git/GitHub CLI 연동. `execa`로 CLI 실행.

### 3-8. utils.js (← utils.py, 256줄)
모델 설정 로드, API 키 관리, Mermaid 변환.

## 4. API 엔드포인트 전체 목록

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
GET    /api/projects/:id/discussions/:step/chat (SSE)       # 스트리밍 채팅 ⚡
```

### 목차
```
GET    /api/projects/:id/toc                    # 로드
PUT    /api/projects/:id/toc                    # 저장
POST   /api/projects/:id/toc/generate (SSE)     # 자동 생성 ⚡
POST   /api/projects/:id/toc/confirm            # 확정
POST   /api/projects/:id/toc/outlines           # 아웃라인 생성
```

### 챕터
```
GET    /api/projects/:id/chapters                         # 목록 + 상태
GET    /api/projects/:id/chapters/:chapterId              # 내용 읽기
PUT    /api/projects/:id/chapters/:chapterId              # 내용 수정
POST   /api/projects/:id/chapters/generate-all (SSE)      # 배치 생성 ⚡
POST   /api/projects/:id/chapters/:chapterId/generate     # 단일 생성
POST   /api/projects/:id/chapters/:chapterId/chat (SSE)   # 인터랙티브 ⚡
```

### 배포
```
POST   /api/projects/:id/deploy/mkdocs/build    # MkDocs 빌드
POST   /api/projects/:id/deploy/mkdocs/serve    # 로컬 프리뷰
POST   /api/projects/:id/deploy/docx            # DOCX 생성
GET    /api/projects/:id/deploy/docx/download    # DOCX 다운로드
POST   /api/projects/:id/deploy/github           # GitHub Pages 배포
```

### 포트폴리오 / 베타 / 모델
```
GET    /api/portfolio                  # 통계 + 카드
GET    /api/portfolio/:id/report       # 상세 리포트
GET    /api/beta/config                # 베타 설정
POST   /api/beta/repo                  # 리포 생성
POST   /api/beta/testers               # 테스터 초대
DELETE /api/beta/testers/:username      # 테스터 제거
POST   /api/beta/push                  # 커밋 & 푸시
GET    /api/beta/github-status          # GitHub 상태
GET    /api/models                     # 모델 목록
GET    /api/models/default/:purpose    # 기본 모델
```

## 5. 스트리밍 아키텍처 (SSE)

SSE(Server-Sent Events)를 사용하여 실시간 데이터를 프론트엔드에 전달한다.

**백엔드 패턴:**
```javascript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// Claude 스트리밍
const stream = client.messages.stream({ model, max_tokens, messages });
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

## 6. 상태 관리 (Zustand)

| Store | 역할 | 주요 상태 |
|-------|------|----------|
| `projectStore` | 프로젝트 선택/목록 | `currentProject`, `projects` |
| `chatStore` | 채팅 메시지 | `messages`, `isStreaming` |
| `generationStore` | 챕터 생성 진행 | `status`, `progress`, `logs` |

## 7. 데이터 디렉토리

프로젝트 데이터는 `server/` 기준 상대경로 또는 환경변수로 설정:
```
PROJECTS_DIR=./projects      # 프로젝트 저장소
TEMPLATES_DIR=./templates    # 교육 템플릿
```

## 8. 배포 구조

```
Vercel (프론트엔드)          Railway/Render (백엔드)
  React SPA 빌드    ←API→     Express + 영속 디스크
  VITE_API_URL 환경변수        ANTHROPIC_API_KEY
                               PROJECTS_DIR, TEMPLATES_DIR
```

## 9. Python → JS 변환 매핑

| Python | JavaScript 대응 |
|--------|----------------|
| `asyncio.Semaphore(n)` | `pLimit(n)` (p-limit) |
| `asyncio.gather(*tasks)` | `Promise.allSettled(tasks)` |
| `AsyncAnthropic` | `new Anthropic()` (JS SDK는 기본 async) |
| `pathlib.Path` | `path.join()` + `fs.promises` |
| `subprocess.run()` | `execa()` |
| `json.load/dump` | `JSON.parse()` / `JSON.stringify()` |
| `datetime.now().isoformat()` | `new Date().toISOString()` |
| `st.session_state` | Zustand store |
| `st.chat_message` | `<ChatInterface />` 컴포넌트 |
| `client.messages.stream()` | SSE + `client.messages.stream()` |
