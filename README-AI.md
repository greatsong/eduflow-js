# EduFlow JS — AI Agent Reference

> 이 문서는 AI 어시스턴트(Claude, GPT 등)가 에듀플로를 이해하고 사용자를 도울 때 참고하는 기술 레퍼런스입니다.
> 사람이 읽을 README는 [README.md](README.md)를 참고하세요.

---

## 프로젝트 정보

| 항목 | 값 |
|------|-----|
| 이름 | 에듀플로 (EduFlow JS) |
| 설명 | Claude AI 기반 교육자료 자동 생성 풀스택 웹 애플리케이션 |
| GitHub | https://github.com/greatsong/eduflow-js |
| 라이선스 | MIT |
| 언어 | JavaScript (ESM) |
| 모노레포 | npm workspaces (`client/`, `server/`, `shared/`) |

## 기술 스택

| 구분 | 기술 | 버전 |
|------|------|------|
| Frontend | React, Vite, React Router, Zustand, Tailwind CSS | 19, 6, 7, latest, 4 |
| Backend | Express, Node.js, @anthropic-ai/sdk | 5, 18+, latest |
| AI | Claude API (Opus 4.6 / Sonnet 4.6 / Haiku 4.5) | - |
| Streaming | Server-Sent Events (SSE) | - |

## 디렉토리 구조

```
eduflow-js/
├── client/                   # React 프론트엔드
│   └── src/
│       ├── api/client.js     # apiFetch, apiSSE, apiStreamPost
│       ├── components/       # Layout, ProgressBar, ChatInterface, ApiKeyModal
│       ├── pages/            # Home, ProjectManager, Discussion, TableOfContents,
│       │                     # Feedback, ChapterCreation, Deployment, Portfolio, BetaDeploy
│       └── stores/           # projectStore.js, chatStore.js (Zustand)
│
├── server/                   # Express 백엔드
│   ├── index.js              # 엔트리포인트, 라우트 등록
│   ├── routes/               # REST API + SSE 엔드포인트
│   │   ├── models.js         # GET /api/models
│   │   ├── projects.js       # CRUD + references + templates
│   │   ├── discussions.js    # 대화 CRUD + SSE 채팅
│   │   ├── toc.js            # TOC 생성(SSE)/CRUD/확정/아웃라인
│   │   ├── chapters.js       # 챕터 CRUD + SSE 배치 생성
│   │   ├── deploy.js         # MkDocs/DOCX/GitHub Pages 배포
│   │   ├── portfolio.js      # 프로젝트 통계/리포트
│   │   └── beta.js           # GitHub 리포/테스터/푸시 관리
│   ├── services/             # 핵심 비즈니스 로직
│   │   ├── progressManager.js
│   │   ├── templateManager.js
│   │   ├── referenceManager.js
│   │   ├── conversationManager.js
│   │   ├── tocGenerator.js
│   │   ├── chapterGenerator.js
│   │   └── deployment.js
│   ├── middleware/
│   │   ├── apiKey.js         # API 키 검증 (헤더 x-api-key 또는 env)
│   │   └── errorHandler.js   # asyncHandler + errorHandler
│   └── config/
│       └── modelConfig.js    # model_config.json 로더 (60s 캐시)
│
├── shared/constants.js       # STEPS, CHAPTER_STATUS, SSE_EVENTS
├── templates/                # 교육 템플릿 6종 (JSON)
├── projects/                 # 프로젝트 데이터 (gitignore, 런타임 생성)
├── model_config.json         # Claude 모델 설정
├── .env                      # 환경변수 (gitignore)
└── .env.example              # 환경변수 템플릿
```

## 설치 & 실행

```bash
git clone https://github.com/greatsong/eduflow-js.git
cd eduflow-js
npm install
npm run dev
```

| 명령어 | 설명 | URL |
|--------|------|-----|
| `npm run dev` | 프론트 + 백엔드 동시 | http://localhost:7830 |
| `npm run dev:client` | 프론트만 | http://localhost:7830 |
| `npm run dev:server` | 백엔드만 | http://localhost:7829 |
| `npm run build` | 프론트엔드 프로덕션 빌드 | - |
| `npm start` | 프로덕션 서버 | - |

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `ANTHROPIC_API_KEY` | 선택 | - | Anthropic API 키. 미설정 시 브라우저에서 입력 가능 |
| `PORT` | 선택 | `7829` | 백엔드 서버 포트 |
| `CLIENT_URL` | 선택 | `http://localhost:7830` | CORS 허용 프론트엔드 URL |
| `PROJECTS_DIR` | 선택 | `./projects` | 프로젝트 데이터 저장 경로 |
| `TEMPLATES_DIR` | 선택 | `./templates` | 템플릿 파일 경로 |

## API 키 설정 방식 (2가지)

1. **브라우저 입력** (권장): 좌측 사이드바 API 키 버튼 → localStorage에 저장 → `x-api-key` 헤더로 전송
2. **`.env` 파일**: 루트에 `.env` 생성, `ANTHROPIC_API_KEY=sk-ant-...` 설정

서버 미들웨어(`server/middleware/apiKey.js`)가 `req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY` 순서로 확인.

## API 엔드포인트 요약

### 프로젝트 (`/api/projects`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects` | 프로젝트 목록 |
| POST | `/api/projects` | 프로젝트 생성 |
| GET | `/api/projects/:name` | 프로젝트 상세 |
| PUT | `/api/projects/:name` | 프로젝트 수정 |
| DELETE | `/api/projects/:name` | 프로젝트 삭제 |
| POST | `/api/projects/:name/references` | 참고자료 업로드 (multer) |
| GET | `/api/projects/:name/references` | 참고자료 목록 |
| DELETE | `/api/projects/:name/references/:filename` | 참고자료 삭제 |
| GET | `/api/projects/:name/templates` | 템플릿 목록 |
| POST | `/api/projects/:name/templates/:id/apply` | 템플릿 적용 |

### 토론 (`/api/projects/:name/discussions`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects/:name/discussions` | 대화 목록 |
| POST | `/api/projects/:name/discussions` | 대화 생성 |
| GET | `/api/projects/:name/discussions/:id` | 대화 상세 |
| POST | `/api/projects/:name/discussions/:id/chat` | SSE 채팅 스트리밍 |
| POST | `/api/projects/:name/discussions/:id/summarize` | 대화 요약 생성 |

### 목차 (`/api/projects/:name/toc`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects/:name/toc` | 목차 조회 |
| POST | `/api/projects/:name/toc/generate` | SSE 목차 자동 생성 |
| PUT | `/api/projects/:name/toc` | 목차 수정 |
| POST | `/api/projects/:name/toc/confirm` | 목차 확정 |
| GET | `/api/projects/:name/toc/outline` | 아웃라인 조회 |

### 챕터 (`/api/projects/:name/chapters`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects/:name/chapters` | 챕터 목록 + 상태 |
| GET | `/api/projects/:name/chapters/:id` | 챕터 내용 |
| POST | `/api/projects/:name/chapters/generate` | SSE 배치 생성 |
| POST | `/api/projects/:name/chapters/:id/generate` | SSE 단일 챕터 생성 |
| POST | `/api/projects/:name/chapters/:id/chat` | SSE 인터랙티브 채팅 |

### 배포 (`/api/projects/:name/deploy`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/projects/:name/deploy/build` | MkDocs 빌드 |
| POST | `/api/projects/:name/deploy/github` | GitHub Pages 배포 |
| POST | `/api/projects/:name/deploy/docx` | DOCX 변환 |
| GET | `/api/projects/:name/deploy/docx/download` | DOCX 다운로드 |

### 포트폴리오 (`/api/portfolio`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/portfolio/projects` | 전체 프로젝트 통계 |
| GET | `/api/portfolio/projects/:name` | 개별 프로젝트 리포트 |

### 기타
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/models` | 사용 가능한 Claude 모델 목록 |
| GET | `/api/health` | 서버 상태 + API 키 유무 |

## SSE 프로토콜

스트리밍 응답 형식:
```
data: {"type": "text", "content": "생성된 텍스트..."}\n\n
data: {"type": "progress", "message": "진행 상황 메시지"}\n\n
data: {"type": "error", "message": "에러 메시지"}\n\n
data: {"type": "done", "summary": {...}}\n\n
```

## 프로젝트 데이터 구조

각 프로젝트는 `projects/<name>/` 디렉토리에 저장:

```
projects/<name>/
├── config.json              # 프로젝트 메타데이터 (name, author, description, settings)
├── progress.json            # 진행 상태 (current_step, step별 완료 여부)
├── toc.json                 # 목차 (parts > chapters 트리 구조)
├── discussions/             # 대화 이력 (JSON 파일들)
│   └── <id>.json
├── docs/                    # 생성된 챕터 마크다운
│   └── <chapter_id>.md
└── references/              # 업로드된 참고자료
    └── <filename>
```

## 모델 설정 (`model_config.json`)

```json
{
  "models": {
    "claude-opus-4-6": { "name": "Claude Opus 4.6", "input_price": 15, "output_price": 75, "context": 200000, "output_tpm": 80000 },
    "claude-sonnet-4-6": { "name": "Claude Sonnet 4.6", "input_price": 3, "output_price": 15, "context": 200000, "output_tpm": 160000 },
    "claude-haiku-4-5-20251001": { "name": "Claude Haiku 4.5", "input_price": 0.8, "output_price": 4, "context": 200000, "output_tpm": 400000 }
  },
  "default_model": "claude-sonnet-4-6",
  "default_settings": { "max_tokens": 16000, "concurrent": 3 }
}
```

가격 단위: USD per 1M tokens.

## 배치 생성 시 Rate Limit 관련

- `chapterGenerator.js`의 `TokenBudgetManager` 클래스가 출력 TPM 예산을 관리
- `tpmLimit` 파라미터로 분당 출력 토큰 상한 설정 가능
- Tier 1(신규): 동시 1~2개, TPM 20K, Haiku 권장
- Tier 4: 동시 5~10개, TPM 200~400K, Opus 사용 가능
- 429 에러 시 자동 재시도 (최대 2회)

## 외부 도구 의존성 (배포 기능)

| 도구 | 용도 | 필수 여부 |
|------|------|----------|
| MkDocs + mkdocs-material | 웹사이트 빌드 | 배포 시에만 |
| Pandoc | DOCX 변환 | DOCX 기능 사용 시에만 |
| GitHub CLI (`gh`) | GitHub Pages 배포 | GitHub 배포 시에만 |
| Git | 버전 관리 | GitHub 배포 시에만 |

## 사용자 지원 시 참고사항

1. **가장 흔한 문제**: API 키 미설정 → 브라우저 사이드바에서 입력하도록 안내
2. **포트 충돌**: `lsof -ti:7830 | xargs kill -9` 후 재시작
3. **Tier 1 사용자**: 배치 생성 시 동시 실행을 1~2개로 낮추고 Haiku 모델 권장
4. **npm install 실패**: `npm cache clean --force` 후 재시도
5. **API 키는 두 곳에서 설정 가능**: `.env` 파일 또는 브라우저 사이드바 (둘 다 설정하면 브라우저 입력이 우선)
