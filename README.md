# 에듀플로 (EduFlow JS)

**AI와 함께 교육자료를 만드는 풀스택 웹 애플리케이션**

Claude AI를 활용하여 교재, 강의 자료, 워크샵 교안 등을 체계적으로 제작할 수 있습니다.
방향성 논의부터 목차 작성, 본문 생성, 배포까지 6단계 워크플로우로 전 과정을 지원합니다.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![React](https://img.shields.io/badge/React-19-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

> **제작 교재 둘러보기**: [에듀플로 포트폴리오](https://greatsong.github.io/eduflow-portfolio/)

---

## 빠른 시작

### 1. 사전 준비

- **Node.js 18 이상** ([다운로드](https://nodejs.org))
- **Anthropic API 키** ([발급 방법](#anthropic-api-키-발급-방법) 참고)

### 2. 설치 & 실행

```bash
git clone https://github.com/greatsong/eduflow-js.git
cd eduflow-js
npm install
npm run dev
```

브라우저에서 **http://localhost:7830** 에 접속하면 에듀플로가 실행됩니다.

### 3. API 키 설정

두 가지 방법 중 택 1:

- **브라우저에서 입력**: 좌측 사이드바의 API 키 버튼 클릭 → 키 입력 (별도 파일 설정 불필요)
- **`.env` 파일 사용**: 루트에 `.env` 파일 생성 후 `ANTHROPIC_API_KEY=sk-ant-api03-...` 입력

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
                           + 포트폴리오 자동 갱신
```

### Step 0: 프로젝트 관리

새 프로젝트를 만들거나 기존 프로젝트를 선택합니다.

- **빈 프로젝트**: 이름, 저자, 설명만 입력하여 생성
- **템플릿 사용**: 6종의 교육 템플릿 중 선택
- **빠른 시작**: 주제와 대상만 입력하면 AI가 프로젝트 설정부터 목차까지 한 번에 생성
- **레퍼런스 업로드**: 기존 자료(PDF, 텍스트 등)를 업로드하여 AI가 참고

### Step 1: 방향성 논의

Claude AI와 실시간 채팅으로 교육자료의 방향을 잡습니다. 대화 내용은 자동 저장되며, AI가 생성한 요약이 이후 단계의 기초가 됩니다.

### Step 2: 목차 작성

AI가 논의 내용을 바탕으로 Part > Chapter 구조의 목차를 자동 생성합니다. 각 챕터에 학습 목표, 개요, 예상 소요시간이 포함되며, JSON 편집기로 직접 수정할 수 있습니다.

### Step 3: 피드백 & 컨펌

AI와 추가 대화로 목차를 개선하고, 만족스러우면 **목차 확정** 후 다음 단계로 진행합니다.

### Step 4: 챕터 제작

- **배치 생성**: 전체 챕터를 한 번에 자동 생성 (병렬 처리)
- **인터랙티브 모드**: 챕터별로 AI와 대화하며 하나씩 생성
- 실시간 진행 상황 표시, 비용 추정 제공

### Step 5: 배포 관리

- **MkDocs 사이트**: 정적 웹사이트로 빌드 (Material 테마)
- **GitHub Pages**: 빌드된 사이트를 GitHub Pages로 자동 배포
- **DOCX 파일**: Word 문서로 변환하여 다운로드

---

## 포트폴리오 시스템

GitHub Pages로 배포하면 **나만의 포트폴리오 페이지**가 자동으로 관리됩니다.

배포할 때마다 자동으로 반영되는 항목:
- 교재 제목, 설명, URL
- 차시 수, 페이지 수
- GitHub Discussions 활성화

### 초기 설정 (최초 1회)

[GitHub CLI](https://cli.github.com) 설치 후 아래 명령을 실행합니다:

```bash
# 1. GitHub 인증
gh auth login

# 2. 포트폴리오 저장소 생성
gh repo create eduflow-portfolio --public

# 3. 빈 projects.json 초기화
gh api repos/$(gh api user --jq .login)/eduflow-portfolio/contents/projects.json \
  -X PUT -f message="Init" -f content=$(echo '[]' | base64)

# 4. GitHub Pages 활성화
gh api repos/$(gh api user --jq .login)/eduflow-portfolio/pages \
  -X POST -f source='{"branch":"master","path":"/"}' 2>/dev/null || echo "OK"
```

이후 에듀플로에서 교재를 배포할 때마다 `https://{username}.github.io/eduflow-portfolio/`에 자동 반영됩니다.

> 저장소에 `index.html`을 추가하면 커스텀 포트폴리오 페이지를 만들 수 있습니다.
> [예시 포트폴리오](https://greatsong.github.io/eduflow-portfolio/)를 참고하세요.

---

## Anthropic API 키 발급 방법

에듀플로는 Claude AI를 사용하므로 Anthropic API 키가 필요합니다.

**1단계: 계정 만들기**

1. [console.anthropic.com](https://console.anthropic.com) 접속
2. **Sign Up** → 이메일 또는 Google 계정으로 회원가입
3. 이메일 인증 완료

**2단계: 크레딧 충전**

1. 로그인 후 좌측 메뉴 **Settings > Billing** 클릭
2. **Add Payment Method** → 신용카드 등록
3. 크레딧 충전 (최소 $5)

> **비용 참고**: 10챕터 분량 교재 기준 약 $1~5 정도입니다. 사용한 만큼만 과금됩니다.

**3단계: API 키 생성**

1. 좌측 메뉴 **API Keys** 클릭
2. **Create Key** → 이름 입력 (예: `eduflow`)
3. 생성된 키 복사 (`sk-ant-api03-...`으로 시작)

> API 키는 생성 시 한 번만 표시됩니다. 반드시 안전한 곳에 저장하세요.

---

## 배포에 필요한 도구 (선택)

GitHub Pages 배포와 DOCX 변환을 사용하려면 추가 도구가 필요합니다:

| 도구 | 용도 | 설치 |
|------|------|------|
| [MkDocs](https://www.mkdocs.org) + Material 테마 | 웹사이트 빌드/배포 | `pip install mkdocs mkdocs-material` |
| [Pandoc](https://pandoc.org) | DOCX 변환 | `brew install pandoc` (Mac) |
| [GitHub CLI](https://cli.github.com) | GitHub Pages 배포 | `brew install gh` (Mac) |
| [Git](https://git-scm.com) | 버전 관리 | 보통 이미 설치됨 |

---

## 교육 템플릿

| 템플릿 | 설명 |
|--------|------|
| 프로그래밍 교재 | 코딩 실습 중심의 교재 |
| 학교 교과서 | 학교 수업용 교과서 |
| 자기주도 학습서 | 독학용 학습 교재 |
| 워크샵 교안 | 실습 워크샵용 자료 |
| 비즈니스 교육 | 기업 교육 자료 |
| 교사용 지도서 | 4C 기반 교사 가이드 |

---

## 명령어 정리

```bash
npm run dev          # 프론트 + 백엔드 동시 실행
npm run dev:server   # 백엔드만 (http://localhost:7829)
npm run dev:client   # 프론트만 (http://localhost:7830)
npm run build        # 프론트엔드 프로덕션 빌드
npm start            # 프로덕션 서버 실행
```

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `ANTHROPIC_API_KEY` | X | - | Anthropic API 키 (브라우저 입력도 가능) |
| `PORT` | X | `7829` | 백엔드 서버 포트 |
| `CLIENT_URL` | X | `http://localhost:7830` | CORS 허용 프론트엔드 URL |
| `PROJECTS_DIR` | X | `./projects` | 프로젝트 데이터 저장 경로 |
| `TEMPLATES_DIR` | X | `./templates` | 템플릿 파일 경로 |

---

## 프로젝트 구조

```
eduflow-js/
├── client/                 # React 프론트엔드 (Vite)
│   └── src/
│       ├── api/            # API 클라이언트 (fetch, SSE)
│       ├── components/     # Layout, ProgressBar, ChatInterface, ApiKeyModal
│       ├── pages/          # 9개 페이지 (Home~Portfolio, BetaDeploy)
│       └── stores/         # Zustand 상태 관리
├── server/                 # Express 백엔드
│   ├── routes/             # REST API + SSE 라우트
│   ├── services/           # AI 연동, 생성, 배포, 포트폴리오
│   └── middleware/         # API 키 검증, 에러 핸들링
├── shared/                 # 프론트/백 공유 상수
├── templates/              # 교육 템플릿 6종
├── projects/               # 프로젝트 데이터 (로컬 저장)
└── model_config.json       # Claude 모델 설정
```

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React 19, Vite 6, React Router 7, Zustand, Tailwind CSS 4 |
| Backend | Express 5, Node.js, @anthropic-ai/sdk |
| AI | Claude API (Opus 4.6 / Sonnet 4.6 / Haiku 4.5) |
| 스트리밍 | Server-Sent Events (SSE) |
| 모노레포 | npm workspaces |

---

## API Tier별 권장 설정

에듀플로의 배치 생성(Step 4)은 Anthropic API의 Rate Limit에 맞춰 설정을 조정해야 합니다. 현재 기본값은 **Tier 4** 기준입니다.

| 설정 | Tier 1 (Free/신규) | Tier 2 | Tier 3 | Tier 4 (기본값) |
|------|---------------------|--------|--------|-----------------|
| 동시 실행 | 1~2개 | 2~3개 | 3~5개 | 5~10개 |
| 출력 TPM 제한 | 20K | 40K | 80K | 200K~400K |
| 권장 모델 | Haiku 4.5 | Sonnet 4 | Sonnet 4.6 | Opus 4.6 |

### Tier 1 (무료 / 신규 사용자) 권장 설정

Tier 1은 출력 TPM이 매우 제한적이므로 보수적으로 설정해야 합니다:

1. **배치 설정 패널**에서:
   - 동시 실행: **1~2개**
   - 출력 TPM 제한: **20K/분**
   - 모델: **Claude Haiku 4.5** (가장 경제적, Tier 1에서도 80K 출력 TPM)
2. Rate limit(429)이 발생해도 자동으로 재시도하지만, 동시 실행을 낮추면 처음부터 방지할 수 있습니다.

> **내 Tier 확인**: [console.anthropic.com](https://console.anthropic.com) → Settings → Limits에서 확인할 수 있습니다. 크레딧을 충전하면 자동으로 Tier가 올라갑니다.

---

## 문제 해결

**API 키 오류** - 브라우저 사이드바에서 API 키를 입력하거나, `.env` 파일에 `ANTHROPIC_API_KEY`를 설정하세요.

**포트 충돌**
```bash
lsof -ti:7830 | xargs kill -9
lsof -ti:7829 | xargs kill -9
npm run dev
```

**npm install 오류**
```bash
npm cache clean --force
npm install
```

---

## 관련 프로젝트

- [에듀플로 Python 버전](https://github.com/greatsong/data-ai-book) - Streamlit 기반 원본
- [에듀플로 포트폴리오](https://greatsong.github.io/eduflow-portfolio/) - 제작된 교재 모음

## 만든 이

**석리송** - AI와 함께 교육 콘텐츠를 만듭니다.

## 라이선스

MIT License
