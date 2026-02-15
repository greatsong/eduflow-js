# 에듀플로 (EduFlow JS)

**AI와 함께 교육자료를 만드는 풀스택 웹 애플리케이션**

Claude AI를 활용하여 교재, 강의 자료, 워크샵 교안 등을 체계적으로 제작할 수 있습니다.
방향성 논의부터 목차 작성, 본문 생성, 배포까지 6단계 워크플로우로 전 과정을 지원합니다.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![React](https://img.shields.io/badge/React-19-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 워크플로우

```
Step 0: 프로젝트 관리     → 프로젝트 생성, 템플릿 선택, 레퍼런스 업로드
    ↓
Step 1: 방향성 논의       → Claude AI와 실시간 대화로 교육자료 방향 설정
    ↓
Step 2: 목차 작성         → AI가 목차 자동 생성, JSON 편집 가능
    ↓
Step 3: 피드백 & 컨펌     → 목차 리뷰, AI와 추가 논의 후 확정
    ↓
Step 4: 챕터 제작         → 배치 생성(전체) 또는 인터랙티브(1장씩) 모드
    ↓
Step 5: 배포 관리         → MkDocs 사이트, GitHub Pages, DOCX 파일 생성
```

---

## 빠른 시작

### 1. 사전 준비

- **Node.js 18 이상** ([다운로드](https://nodejs.org))
- **Anthropic API 키** (아래 발급 방법 참고)

### 2. 설치

```bash
git clone https://github.com/greatsong/eduflow-js.git
cd eduflow-js

npm install
```

### 3. API 키 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 `sk-ant-xxx` 부분을 실제 API 키로 교체합니다:

```env
ANTHROPIC_API_KEY=sk-ant-api03-여기에-실제-키-입력
```

### 4. 실행

```bash
npm run dev
```

브라우저에서 **http://localhost:7830** 에 접속하면 에듀플로가 실행됩니다.

---

## Anthropic API 키 발급 방법

에듀플로는 Claude AI를 사용하므로 Anthropic API 키가 필요합니다.

### Step 1: 계정 만들기

1. [console.anthropic.com](https://console.anthropic.com) 접속
2. **Sign Up** 클릭 → 이메일 또는 Google 계정으로 회원가입
3. 이메일 인증 완료

### Step 2: 크레딧 충전

1. 로그인 후 좌측 메뉴 **Settings > Billing** 클릭
2. **Add Payment Method** → 신용카드 등록
3. 크레딧 충전 (최소 $5)

> **비용 참고**: 10챕터 분량 교재 기준 약 $1~5 정도입니다. 사용한 만큼만 과금됩니다.

### Step 3: API 키 생성

1. 좌측 메뉴 **API Keys** 클릭
2. **Create Key** 클릭 → 이름 입력 (예: `eduflow`)
3. 생성된 키 복사 (`sk-ant-api03-...`으로 시작)

> **주의**: API 키는 생성 시 한 번만 표시됩니다. 반드시 안전한 곳에 저장하세요.

---

## 사용 방법

### Step 0: 프로젝트 관리

새 프로젝트를 만들거나, 기존 프로젝트를 선택합니다.

- **빈 프로젝트**: 이름, 저자, 설명만 입력하여 생성
- **템플릿 사용**: 6종의 교육 템플릿 중 선택 (프로그래밍 교재, 학교 교과서, 워크샵 자료 등)
- **빠른 시작**: 주제와 대상만 입력하면 AI가 프로젝트 설정부터 목차까지 한 번에 생성
- **레퍼런스 업로드**: 기존 자료(PDF, 텍스트 등)를 업로드하여 AI가 참고하도록 설정

### Step 1: 방향성 논의

Claude AI와 실시간 채팅으로 교육자료의 방향을 잡습니다.

- 대상 독자, 난이도, 분량, 구성 방식 등을 논의
- 대화 내용은 자동 저장되며, AI가 요약본을 생성
- 이 요약이 이후 목차 생성과 본문 작성의 기초가 됩니다

### Step 2: 목차 작성

AI가 논의 내용을 바탕으로 목차를 자동 생성합니다.

- Part → Chapter 구조로 자동 구성
- 각 챕터에 학습 목표, 개요, 예상 소요시간 포함
- JSON 편집기로 목차를 직접 수정 가능

### Step 3: 피드백 & 컨펌

생성된 목차를 검토하고 확정합니다.

- AI와 추가 대화로 목차 개선
- 만족스러우면 **목차 확정** → 이후 단계로 진행

### Step 4: 챕터 제작

확정된 목차를 바탕으로 본문을 생성합니다.

- **배치 생성**: 전체 챕터를 한 번에 자동 생성 (병렬 처리로 빠름)
- **인터랙티브 모드**: 챕터별로 AI와 대화하며 하나씩 생성
- 실시간 진행 상황 표시, 비용 추정 제공
- 생성된 챕터는 마크다운으로 저장

### Step 5: 배포 관리

완성된 교재를 다양한 형태로 배포합니다.

- **MkDocs 사이트**: 정적 웹사이트로 빌드 (Material 테마)
- **GitHub Pages**: 빌드된 사이트를 GitHub Pages로 자동 배포
- **DOCX 파일**: Word 문서로 변환하여 다운로드

---

## 프로젝트 구조

```
eduflow-js/
├── client/                 # React 프론트엔드 (Vite)
│   └── src/
│       ├── api/            # API 클라이언트 (fetch, SSE)
│       ├── components/     # 공통 컴포넌트 (Layout, ProgressBar)
│       ├── pages/          # 8개 페이지 컴포넌트
│       └── stores/         # Zustand 상태 관리
├── server/                 # Express 백엔드
│   ├── routes/             # REST API + SSE 라우트
│   ├── services/           # 비즈니스 로직 (AI 연동, 생성, 배포)
│   └── middleware/         # API 키 검증, 에러 핸들링
├── shared/                 # 프론트/백 공유 상수
├── templates/              # 교육 템플릿 6종
├── projects/               # 프로젝트 데이터 (로컬 저장)
│   └── template/           # 새 프로젝트 폴더 구조
└── model_config.json       # Claude 모델 설정
```

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React 19, Vite 6, React Router 7, Zustand, Tailwind CSS 4 |
| Backend | Express 5, Node.js, @anthropic-ai/sdk |
| AI | Claude API (Opus 4.6 / Sonnet 4.5) |
| 스트리밍 | Server-Sent Events (SSE) |
| 모노레포 | npm workspaces |

---

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `ANTHROPIC_API_KEY` | O | - | Anthropic API 키 |
| `PORT` | X | `7829` | 백엔드 서버 포트 |
| `CLIENT_URL` | X | `http://localhost:7830` | CORS 허용 프론트엔드 URL |
| `PROJECTS_DIR` | X | `./projects` | 프로젝트 데이터 저장 경로 |
| `TEMPLATES_DIR` | X | `./templates` | 템플릿 파일 경로 |

---

## 명령어 정리

```bash
npm run dev          # 프론트 + 백엔드 동시 실행
npm run dev:server   # 백엔드만 (http://localhost:7829)
npm run dev:client   # 프론트만 (http://localhost:7830)
npm run build        # 프론트엔드 프로덕션 빌드
npm start            # 프로덕션 서버 실행
```

---

## 문제 해결

### API 키 오류

```
Anthropic API 키가 필요합니다
```

→ 루트 폴더의 `.env` 파일에 `ANTHROPIC_API_KEY`가 설정되어 있는지 확인하세요.

### 포트 충돌

```bash
# 이미 사용 중인 포트 해제 (Mac/Linux)
lsof -ti:7830 | xargs kill -9
lsof -ti:7829 | xargs kill -9
npm run dev
```

### npm install 오류

```bash
npm cache clean --force
npm install
```

---

## 교육 템플릿

에듀플로에는 6종의 교육 템플릿이 포함되어 있습니다:

| 템플릿 | 설명 |
|--------|------|
| 프로그래밍 교재 | 코딩 실습 중심의 교재 |
| 학교 교과서 | 학교 수업용 교과서 |
| 자기주도 학습서 | 독학용 학습 교재 |
| 워크샵 교안 | 실습 워크샵용 자료 |
| 비즈니스 교육 | 기업 교육 자료 |
| 교사용 지도서 | 4C 기반 교사 가이드 |

---

## 관련 프로젝트

- [에듀플로 Python 버전](https://github.com/greatsong/data-ai-book) - Streamlit 기반 원본
- [에듀플로 포트폴리오](https://greatsong.github.io/eduflow-portfolio/) - 제작된 교재 모음

## 만든 이

**석리송** - AI와 함께 교육 콘텐츠를 만듭니다.

## 라이선스

MIT License
