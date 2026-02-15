# 에듀플로 (JS 버전) 설치 가이드

**처음 사용하시는 분들을 위한 친절한 안내서**

---

## 시작하기 전에

에듀플로 JS 버전을 사용하려면 아래 3가지가 필요합니다:

| 필요한 것 | 설명 | 소요 시간 |
|----------|------|----------|
| Node.js | 프로그램 실행 환경 | 5분 |
| 에듀플로 코드 | 이 프로젝트 파일들 | 2분 |
| Anthropic API 키 | AI 사용을 위한 인증키 | 5분 |

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

git clone https://github.com/greatsong/eduflow.git
cd eduflow
```

---

## 3단계: 패키지 설치

터미널에서 에듀플로 폴더로 이동한 후:

```bash
cd /path/to/eduflow  # 실제 폴더 경로로 변경

# 모든 패키지 한 번에 설치
npm install
```

> 처음 설치 시 1~2분 정도 소요됩니다. 경고 메시지가 나와도 보통 괜찮습니다.

---

## 4단계: Anthropic API 키 발급받기

API 키는 AI를 사용하기 위한 "비밀번호" 같은 것입니다.

### 4-1. 계정 만들기

1. https://console.anthropic.com 접속
2. "Sign Up" 클릭
3. 이메일로 회원가입 (Google 계정도 가능)
4. 이메일 인증 완료

### 4-2. 결제 수단 등록

1. 로그인 후 좌측 메뉴에서 "Billing" 클릭
2. "Add Payment Method" 클릭
3. 신용카드 정보 입력
4. 사용할 크레딧 충전 (최소 $5)

> **비용 안내**: 10챕터 기준 약 $1~5 정도 소요됩니다.

### 4-3. API 키 생성

1. 좌측 메뉴에서 "API Keys" 클릭
2. "Create Key" 클릭
3. 이름 입력 (예: "eduflow")
4. 생성된 키 복사 (sk-ant-... 로 시작)

> **주의**: 이 키는 한 번만 표시됩니다! 안전한 곳에 저장해두세요.

---

## 5단계: API 키 설정하기

에듀플로 **루트 폴더**에 `.env` 파일을 만듭니다.

### 가장 쉬운 방법

```bash
cd /path/to/eduflow  # 에듀플로 폴더로 이동
cp .env.example .env
```

그리고 `.env` 파일을 열어서 `sk-ant-xxx` 부분을 실제 API 키로 교체합니다.

### 또는 직접 파일 만들기

1. `eduflow` 루트 폴더 열기
2. 새 텍스트 파일 만들기
3. 아래 내용 입력:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-api-key-here
   ```
4. 파일명을 `.env`로 저장 (확장자 없이!)

> **Windows 팁**: 메모장에서 저장할 때 "파일 형식"을 "모든 파일"로 선택해야 `.txt`가 붙지 않습니다.

---

## 6단계: 실행하기

```bash
# 에듀플로 폴더에서
npm run dev
```

실행 후 브라우저에서 http://localhost:7830 에 접속합니다.

**축하합니다! 이제 에듀플로를 사용할 수 있습니다!**

---

## 포트 정보

| 서비스 | 포트 | 설명 |
|--------|------|------|
| 웹 화면 | 7830 | 브라우저에서 접속하는 주소 |
| API 서버 | 7829 | 백엔드 (직접 접속할 일 없음) |

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

### "API key not found" 오류

1. 루트 폴더에 `.env` 파일이 있는지 확인
2. 파일 내용 확인: `ANTHROPIC_API_KEY=sk-ant-...`
3. 등호(=) 양쪽에 공백이 없어야 함
4. 터미널 재시작 후 `npm run dev`

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

## 다음 단계

- 사용 방법: [ARCHITECTURE.md](ARCHITECTURE.md) 참고
- 문제 발생 시: GitHub Issues에 문의

---

## 빠른 참조 (설치 완료 후)

```bash
# 매번 실행할 때
cd /path/to/eduflow
npm run dev
```

또는 바탕화면의 `에듀플로-JS.app` 더블클릭!

---

## Streamlit 버전과의 차이

| 항목 | Streamlit 버전 | JS 버전 |
|------|---------------|---------|
| 언어 | Python | JavaScript |
| 속도 | 보통 | 빠름 |
| UI | 간단 | 모던 |
| 설치 | pip | npm |
| 포트 | 8501 | 7830 |

두 버전 모두 같은 기능을 제공합니다. 취향에 맞게 선택하세요!
