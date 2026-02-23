# 에듀플로 (EduFlow JS)

**AI와 함께 교육자료를 만드는 웹 애플리케이션**

주제를 입력하면 Claude AI가 교재, 강의 자료, 워크샵 교안 등을 체계적으로 만들어 줍니다.
방향성 논의 → 목차 작성 → 본문 생성 → 배포까지, 6단계로 전 과정을 지원합니다.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![React](https://img.shields.io/badge/React-19-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

> **만들어진 교재 구경하기**: [에듀플로 포트폴리오](https://greatsong.github.io/eduflow-portfolio/)

---

## 5분 만에 시작하기

### 1. Node.js 설치

[nodejs.org](https://nodejs.org)에서 **LTS 버전**을 다운로드하고 설치합니다.

> 이미 설치되어 있다면 건너뛰세요. 터미널에서 `node --version`을 입력하면 확인할 수 있습니다.

### 2. 에듀플로 다운로드 & 실행

```bash
git clone https://github.com/greatsong/eduflow-js.git
cd eduflow-js
npm install
npm run dev
```

### 3. 브라우저에서 접속

**http://localhost:7830** 에 접속하면 에듀플로가 실행됩니다.

### 4. API 키 입력

좌측 사이드바의 **API 키 버튼**을 클릭하고 Anthropic API 키를 입력하면 바로 사용할 수 있습니다.

> API 키가 없다면? 아래 [API 키 발급 방법](#anthropic-api-키-발급-방법)을 참고하세요.

---

## 워크플로우

```
Step 0  프로젝트 관리     프로젝트 생성, 템플릿 선택, 참고자료 업로드
  ↓
Step 1  방향성 논의       AI와 실시간 대화로 교육자료 방향 설정
  ↓
Step 2  목차 작성         AI가 목차 자동 생성, 직접 수정 가능
  ↓
Step 3  피드백 & 확정     목차 리뷰, AI와 추가 논의 후 확정
  ↓
Step 4  챕터 제작         전체 자동 생성(배치) 또는 한 장씩 대화하며 생성
  ↓
Step 5  배포              웹사이트(MkDocs), Word 파일, GitHub Pages 배포
```

### Step 0: 프로젝트 관리

새 프로젝트를 만들거나 기존 프로젝트를 선택합니다.

- **빈 프로젝트**: 이름, 저자, 설명만 입력하여 생성
- **템플릿 사용**: 6종의 교육 템플릿 중 선택 (아래 표 참고)
- **빠른 시작**: 주제와 대상만 입력하면 AI가 프로젝트 설정부터 목차까지 한 번에 생성
- **참고자료 업로드**: 기존 자료(PDF, 텍스트 등)를 올려서 AI가 참고하도록 설정

### Step 1: 방향성 논의

Claude AI와 실시간 채팅으로 교육자료의 방향을 잡습니다. 대화 내용은 자동 저장되며, AI가 만든 요약이 이후 단계의 기초가 됩니다.

### Step 2: 목차 작성

AI가 논의 내용을 바탕으로 Part > Chapter 구조의 목차를 자동 생성합니다. 각 챕터에 학습 목표, 개요, 예상 소요시간이 포함되며, 직접 수정할 수 있습니다.

### Step 3: 피드백 & 확정

AI와 추가 대화로 목차를 다듬고, 만족스러우면 **목차 확정** 후 다음 단계로 진행합니다.

### Step 4: 챕터 제작

- **배치 생성**: 전체 챕터를 한 번에 자동 생성 (병렬 처리)
- **인터랙티브 모드**: 챕터별로 AI와 대화하며 하나씩 생성
- 실시간 진행 상황 표시, 비용 추정 제공

### Step 5: 배포

- **MkDocs 사이트**: 정적 웹사이트로 빌드 (Material 테마)
- **GitHub Pages**: 빌드된 사이트를 GitHub Pages로 자동 배포
- **DOCX 파일**: Word 문서로 변환하여 다운로드

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

## Anthropic API 키 발급 방법

에듀플로는 Claude AI를 사용하므로 Anthropic API 키가 필요합니다.

### 1단계: 계정 만들기

1. [console.anthropic.com](https://console.anthropic.com) 접속
2. **Sign Up** → 이메일 또는 Google 계정으로 회원가입
3. 이메일 인증 완료

### 2단계: 크레딧 충전

1. 로그인 후 좌측 메뉴 **Settings > Billing** 클릭
2. **Add Payment Method** → 신용카드 등록
3. 크레딧 충전 (최소 $5)

> **비용 참고**: 10챕터 분량 교재 기준 약 $1~5 정도입니다. 사용한 만큼만 과금됩니다.

### 3단계: API 키 생성

1. 좌측 메뉴 **API Keys** 클릭
2. **Create Key** → 이름 입력 (예: `eduflow`)
3. 생성된 키 복사 (`sk-ant-api03-...`으로 시작)

> API 키는 생성 시 한 번만 표시됩니다. 반드시 안전한 곳에 저장하세요.

---

## 비용 안내

| 항목 | 설명 |
|------|------|
| 에듀플로 자체 | **무료** (오픈소스) |
| Claude API 사용료 | 사용량에 따라 과금 |

**10챕터 교재 기준 예상 비용:**

| 모델 | 예상 비용 | 특징 |
|------|----------|------|
| Haiku 4.5 | ~$0.3 | 빠르고 저렴, 간단한 교재에 적합 |
| Sonnet 4.6 | ~$1.5 | 균형 잡힌 성능 |
| Opus 4.6 | ~$5 | 최고 품질, 전문 교재에 적합 |

### API Tier별 권장 설정

배치 생성(Step 4)은 Anthropic API의 사용량 등급(Tier)에 맞춰 설정을 조정하면 좋습니다.

| 설정 | Tier 1 (신규) | Tier 2 | Tier 3 | Tier 4 |
|------|--------------|--------|--------|--------|
| 동시 실행 | 1~2개 | 2~3개 | 3~5개 | 5~10개 |
| 출력 TPM 제한 | 20K | 40K | 80K | 200K~400K |
| 권장 모델 | Haiku 4.5 | Sonnet 4 | Sonnet 4.6 | Opus 4.6 |

> **내 Tier 확인**: [console.anthropic.com](https://console.anthropic.com) → Settings → Limits에서 확인할 수 있습니다. 크레딧을 충전하면 자동으로 Tier가 올라갑니다.

---

## 배포에 필요한 도구 (선택)

Step 5의 배포 기능을 사용하려면 추가 도구가 필요합니다. **교재 생성까지는 없어도 됩니다.**

| 도구 | 용도 | 설치 (Mac) | 설치 (Windows) |
|------|------|-----------|---------------|
| [MkDocs](https://www.mkdocs.org) | 웹사이트 빌드 | `pip install mkdocs mkdocs-material` | 동일 |
| [Pandoc](https://pandoc.org) | Word 변환 | `brew install pandoc` | [다운로드](https://pandoc.org/installing.html) |
| [GitHub CLI](https://cli.github.com) | GitHub 배포 | `brew install gh` | [다운로드](https://cli.github.com) |

---

## 포트폴리오 자동 관리

GitHub Pages로 배포하면 **나만의 포트폴리오 페이지**가 자동으로 관리됩니다. 배포할 때마다 교재 제목, 설명, URL, 차시 수, 페이지 수가 자동 반영됩니다.

포트폴리오 초기 설정은 에듀플로 앱 내 **배포 관리** 탭에서 안내를 따라하면 됩니다. [GitHub CLI](https://cli.github.com) 설치가 필요합니다.

> [예시 포트폴리오](https://greatsong.github.io/eduflow-portfolio/)를 참고하세요.

---

## 문제 해결

**API 키 오류**
→ 브라우저 사이드바에서 API 키를 다시 입력해 보세요. 키가 `sk-ant-`로 시작하는지 확인하세요.

**포트 충돌 (이미 실행 중인 서버가 있을 때)**
```bash
# Mac/Linux
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

## 명령어 정리

```bash
npm run dev          # 프론트 + 백엔드 동시 실행
npm run dev:server   # 백엔드만 (http://localhost:7829)
npm run dev:client   # 프론트만 (http://localhost:7830)
npm run build        # 프론트엔드 프로덕션 빌드
npm start            # 프로덕션 서버 실행
```

---

## 관련 프로젝트

- [에듀플로 Python 버전](https://github.com/greatsong/data-ai-book) — Streamlit 기반 원본
- [에듀플로 포트폴리오](https://greatsong.github.io/eduflow-portfolio/) — 제작된 교재 모음

## 만든 이

**석리송** — AI와 함께 교육 콘텐츠를 만듭니다.

## 라이선스

MIT License
