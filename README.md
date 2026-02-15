# 에듀플로 (EduFlow) - JS Version

AI와 함께 교육 콘텐츠를 만드는 풀스택 웹 애플리케이션

## 소개

에듀플로는 Claude AI를 활용하여 교육 자료(교재, 강의 자료 등)를 체계적으로 제작할 수 있는 도구입니다. 6단계 워크플로우를 통해 방향성 논의부터 최종 배포까지 전 과정을 지원합니다.

## 주요 기능

- **프로젝트 관리**: 프로젝트 생성, 템플릿 적용, 레퍼런스 파일 관리
- **방향성 논의**: Claude AI와 실시간 스트리밍 대화로 콘텐츠 방향 설정
- **목차 작성**: AI 기반 목차 자동 생성 및 수정
- **피드백 컨펌**: 생성된 목차 리뷰 및 확정
- **챕터 제작**: 배치/인터랙티브 모드로 본문 생성
- **배포 관리**: MkDocs 빌드, GitHub Pages 배포, DOCX 생성
- **포트폴리오**: 프로젝트 현황 대시보드
- **베타 배포**: 테스터 초대 및 베타 버전 관리

## 기술 스택

### Frontend
- React 19 + Vite 6
- React Router 7
- Zustand (상태 관리)
- Tailwind CSS 4

### Backend
- Express 5 + Node.js
- Anthropic Claude API (@anthropic-ai/sdk)
- Server-Sent Events (SSE) 스트리밍

## 설치 및 실행

### 요구사항
- Node.js 18+
- Anthropic API 키

### 설치

```bash
# 클론
git clone https://github.com/greatsong/eduflow.git
cd eduflow

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일에 ANTHROPIC_API_KEY 입력
```

### 실행

```bash
# 개발 모드 (클라이언트 + 서버 동시 실행)
npm run dev

# 또는 개별 실행
npm run dev:server  # 서버만 (포트 7829)
npm run dev:client  # 클라이언트만 (포트 7830)
```

### 빌드

```bash
npm run build
npm start
```

## 프로젝트 구조

```
eduflow/
├── client/                 # React 프론트엔드
│   ├── src/
│   │   ├── api/           # API 클라이언트
│   │   ├── components/    # 공통 컴포넌트
│   │   ├── pages/         # 페이지 컴포넌트
│   │   └── stores/        # Zustand 스토어
│   └── ...
├── server/                 # Express 백엔드
│   ├── routes/            # API 라우트
│   ├── services/          # 비즈니스 로직
│   └── index.js           # 서버 엔트리
├── shared/                 # 공유 상수
├── templates/              # 교육 템플릿
├── projects/               # 프로젝트 데이터
└── model_config.json       # 모델 설정
```

## 워크플로우

```
Step 0: 프로젝트 관리
    ↓
Step 1: 방향성 논의 (AI 채팅)
    ↓
Step 2: 목차 작성 (AI 생성)
    ↓
Step 3: 피드백 컨펌
    ↓
Step 4: 챕터 제작 (배치/인터랙티브)
    ↓
Step 5: 배포 관리 (MkDocs/GitHub Pages)
```

## 환경변수

```env
ANTHROPIC_API_KEY=sk-ant-...    # 필수
PORT=7829                        # 서버 포트 (기본: 7829)
CLIENT_URL=http://localhost:7830 # 클라이언트 URL (기본값)
```

## 관련 프로젝트

- [에듀플로 Python 버전](https://github.com/greatsong/data-ai-book) - Streamlit 기반 원본
- [에듀플로 포트폴리오](https://greatsong.github.io/eduflow-portfolio/) - 제작된 교재 모음

## 만든 이

**석리송** - AI와 함께 교육 콘텐츠를 만듭니다.

## 라이선스

MIT License
