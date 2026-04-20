# 에듀플로 (EduFlow) 설치 가이드

**처음 사용하시는 분들을 위한 친절한 안내서** (v0.3.0)

---

## 시작하기 전에

에듀플로를 사용하려면 아래 3가지가 필요합니다:

| 필요한 것 | 설명 | 소요 시간 |
|----------|------|----------|
| Node.js | 프로그램 실행 환경 | 5분 |
| 에듀플로 코드 | 이 프로젝트 파일들 | 2분 |
| AI API 키 | AI 사용을 위한 인증키 (최소 1개) | 5분 |

### 지원하는 AI 프로바이더

에듀플로는 **4개 AI 프로바이더**를 지원합니다. 최소 1개의 API 키만 있으면 됩니다.

| 프로바이더 | 대표 모델 | API 키 발급 |
|-----------|----------|------------|
| **Anthropic** | Claude Sonnet 4.6, Opus 4.6 | https://console.anthropic.com |
| **OpenAI** | GPT-5.4, o3-pro | https://platform.openai.com |
| **Google** | Gemini 3.1, 3.5 Flash | https://aistudio.google.com/apikey |
| **Upstage** | Solar Pro | https://console.upstage.ai |

---

## 1단계: Node.js 설치하기

### Mac 사용자

**방법 A: Homebrew 사용 (권장)**

1. **터미널 열기**
   - `Command + Space` 누르고 "터미널" 입력 후 Enter

2. **Homebrew 설치** (이미 있으면 건너뛰기)
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

3. **Node.js 설치**
   ```bash
   brew install node
   ```

4. **설치 확인**
   ```bash
   node --version
   npm --version
   ```
   버전 번호가 나오면 성공!

**방법 B: 공식 설치 파일 사용**

1. https://nodejs.org 접속
2. "LTS" 버전 다운로드 (안정적인 버전)
3. 다운로드된 `.pkg` 파일 실행
4. 설치 마법사 따라하기

### Windows 사용자

1. https://nodejs.org 접속
2. "LTS" 버전 다운로드
3. 다운로드된 `.msi` 파일 실행
4. 설치 마법사 따라하기 (기본 옵션 그대로)
5. 설치 완료 후 PowerShell 열어서 확인:
   ```powershell
   node --version
   npm --version
   ```

> Windows 사용자는 더 자세한 [INSTALL_GUIDE_WINDOWS.md](INSTALL_GUIDE_WINDOWS.md)도 참고하세요.

---

## 2단계: 에듀플로 다운로드

### 방법 A: ZIP 다운로드 (가장 쉬움)

1. GitHub 저장소 페이지에서 녹색 "Code" 버튼 클릭
2. "Download ZIP" 클릭
3. 다운로드된 ZIP 파일 압축 풀기
4. 원하는 위치로 폴더 이동

### 방법 B: Git 사용 (업데이트 편리)

```bash
# Git이 없다면 먼저 설치
# Mac: brew install git
# Windows: https://git-scm.com/download/win

git clone https://github.com/greatsong/eduflow-js.git
cd eduflow-js
```

---

## 3단계: 패키지 설치

터미널에서 에듀플로 폴더로 이동한 후:

```bash
cd /path/to/eduflow-js  # 실제 폴더 경로로 변경

# 모든 패키지 한 번에 설치
npm install
```

> 처음 설치 시 1~2분 정도 소요됩니다. 경고 메시지가 나와도 보통 괜찮습니다.

---

## 4단계: API 키 설정하기

두 가지 방법 중 하나를 선택하세요.

### 방법 A: 브라우저에서 입력 (가장 쉬움, 권장)

파일을 만들 필요 없이, 에듀플로 실행 후 **좌측 사이드바의 🔑 AI API 키** 버튼을 클릭하면 멀티 프로바이더 설정 화면이 나타납니다.

- **Anthropic**, **OpenAI**, **Google**, **Upstage** 중 사용할 프로바이더의 API 키를 입력
- 최소 1개만 입력하면 해당 프로바이더의 모델을 사용할 수 있습니다
- 입력한 키는 브라우저에 자동 저장되어 다음에도 유지됩니다

> 이 방법이 가장 간단합니다. 아래 5단계로 바로 넘어가세요.

### 방법 B: `.env` 파일 사용

에듀플로 **루트 폴더**에 `.env` 파일을 만듭니다.

```bash
cd /path/to/eduflow-js  # 에듀플로 폴더로 이동
cp .env.example .env
```

그리고 `.env` 파일을 열어서 사용할 프로바이더의 API 키를 입력합니다:

```env
# 사용하려는 프로바이더만 설정하면 됩니다 (최소 1개)
ANTHROPIC_API_KEY=sk-ant-your-key-here
# OPENAI_API_KEY=sk-your-key-here
# GOOGLE_API_KEY=your-key-here
# UPSTAGE_API_KEY=up_your-key-here
```

> **Windows 팁**: 메모장에서 저장할 때 "파일 형식"을 "모든 파일"로 선택해야 `.txt`가 붙지 않습니다.

---

## 5단계: 실행하기

```bash
# 에듀플로 폴더에서
npm run dev
```

실행 후 브라우저에서 http://localhost:7830 에 접속합니다.

**에듀플로가 정상 작동하면 설치 완료입니다!**

---

## 포트 정보

| 서비스 | 포트 | 설명 |
|--------|------|------|
| 웹 화면 | 7830 | 브라우저에서 접속하는 주소 |
| API 서버 | 7829 | 백엔드 (직접 접속할 일 없음) |

---

## 주요 기능 안내

### 6단계 워크플로우

```
📁 프로젝트 관리  →  💬 방향성 논의  →  📋 목차 작성
                                          ↓
🚀 배포 관리    ←   ✍️ 챕터 제작   ←   ✅ 피드백 컨펌
```

### AI 모델 선택 가이드

모델 선택 드롭다운에서 용도에 맞는 모델을 고를 수 있습니다.

| 등급 | 대표 모델 | 속도 | 품질 | 추천 상황 |
|------|----------|------|------|----------|
| 경제적 | Haiku 4.5, GPT-4.1 mini | 매우 빠름 | 좋음 | 빠른 테스트 |
| 균형 | **Sonnet 4.6**, GPT-4.1 | 빠름 | 매우 좋음 | 일반 추천 (기본값) |
| 고품질 | Opus 4.6, GPT-5.4 | 느림 | 최고 | 중요한 교재 |

> 처음에는 경제적 모델로 빠르게 테스트해보고, 만족스러우면 균형/고품질 모델로 다시 만드는 것을 추천합니다.

### 추가 기능

- **📊 포트폴리오**: 완성된 교재 모아보기 및 통계
- **⚖️ AI 모델 비교**: 블라인드 테스트, 공개 비교, AI 자동 평가

### 웹사이트 빌드 방식 (Step 5)

Step 5 "배포 관리"의 "웹사이트 설정"에서 **두 가지 빌드 방식** 중 선택할 수 있습니다.

| 방식 | 소요 시간 | 디자인 | 추천 상황 |
|------|-----------|--------|----------|
| **Astro Starlight** (기본) | 첫 빌드 3~6분<br/>이후 30초~2분 | 최신·반응형·다크모드 | 완성도 높은 교재 배포 |
| **MkDocs Material** | 10~30초 | 클래식·문서 느낌 | 빠른 반복 작업, 프리뷰 확인용 |

> 선택값은 프로젝트 `config.json`에 저장되어 빌드·미리보기·GitHub Pages 배포 모두 자동으로 따라갑니다.

**Starlight 첫 빌드가 오래 걸린다면** — 공용 캐시를 미리 워밍업할 수 있습니다(선택 사항):

```bash
cd server/services/starlight-cache
npm install
```

이렇게 하면 이후 모든 Starlight 빌드에서 `npm install` 단계가 생략됩니다.

> MkDocs를 쓰려면 Python `mkdocs` + `mkdocs-material`이 설치되어 있어야 합니다. 대부분의 Mac/Linux 환경은 `pip install mkdocs mkdocs-material`로 충분합니다.

---

## 문제 해결

### "node를 찾을 수 없습니다" 오류

- 터미널/PowerShell을 닫고 다시 열기
- Node.js 재설치

### "npm install" 오류

```bash
# 캐시 삭제 후 재시도
npm cache clean --force
npm install
```

### "API 키가 필요합니다" 오류

1. 좌측 사이드바 **🔑 AI API 키** 버튼 클릭
2. 사용할 프로바이더(Anthropic, OpenAI, Google, Upstage)의 API 키 입력
3. 저장 후 키가 유효하면 자동으로 적용됩니다

또는 `.env` 파일에 직접 키를 입력한 후 서버를 재시작해주세요.

### 포트가 이미 사용 중

이전에 실행한 서버가 남아있을 수 있습니다:

```bash
# Mac/Linux: 포트 사용 중인 프로세스 종료
lsof -ti:7830 | xargs kill -9
lsof -ti:7829 | xargs kill -9

# 다시 실행
npm run dev
```

### "EACCES permission denied" 오류 (Mac)

```bash
sudo chown -R $(whoami) ~/.npm
npm install
```

---

## 빠른 참조 (설치 완료 후)

```bash
# 매번 실행할 때
cd /path/to/eduflow-js
npm run dev
# 브라우저에서 http://localhost:7830 접속
```

---

## 업데이트하기

```bash
cd /path/to/eduflow-js
git pull
npm install
npm run dev
```

---

## 관련 문서

- 아키텍처 상세: [ARCHITECTURE.md](ARCHITECTURE.md)
- 윈도우 전용 가이드: [INSTALL_GUIDE_WINDOWS.md](INSTALL_GUIDE_WINDOWS.md)
- 문제 발생 시: https://github.com/greatsong/eduflow-js/issues
