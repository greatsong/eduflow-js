# EduFlow — Claude Code 하이브리드 워크플로우

> **목적**: Anthropic API 비용 없이 Claude Code 세션에서 직접 교육자료를 생성한다.
> EduFlow의 기존 프로젝트 데이터 구조를 100% 그대로 사용하므로, 웹 UI에서도 결과를 확인/편집할 수 있다.

---

## 전제 조건

```bash
cd /Users/greatsong/greatsong-project/eduflow
```

- 이 파일(`CLAUDE_WORKFLOW.md`)이 있는 디렉토리가 작업 루트
- `templates/` 디렉토리에 6종 템플릿 JSON이 있어야 함
- `projects/` 디렉토리가 있어야 함 (없으면 생성)
- **Anthropic API 키 불필요** — Claude Code가 직접 생성

---

## 워크플로우 개요

```
Step 0: 프로젝트 생성 ──→ config.json, progress.json 생성
Step 1: 방향성 논의   ──→ master-context.md 생성
Step 2: 목차 생성     ──→ toc.json + toc.md 생성
Step 3: 피드백/수정   ──→ toc.json 확정, 아웃라인 생성
Step 4: 챕터 생성     ──→ docs/*.md 생성 (핵심!)
Step 5: 배포          ──→ MkDocs/DOCX/GitHub Pages (웹 UI 사용)
```

**Step 0~4**: Claude Code가 직접 수행 (API 비용 0원)
**Step 5**: 웹 UI에서 수행 (`npm run dev` → http://localhost:5173)

---

## Step 0: 프로젝트 생성

### 사용자 지시 예시

```
"python-basics"라는 프로젝트를 만들어줘.
제목은 "고등학생을 위한 파이썬 기초", 저자는 "홍길동".
템플릿은 programming-course로.
```

### Claude Code 실행 절차

#### 0-1. 프로젝트 디렉토리 생성

```bash
mkdir -p projects/{프로젝트명}/{docs,outlines,discussions,references,logs,output}
```

#### 0-2. config.json 생성

파일: `projects/{프로젝트명}/config.json`

```json
{
  "name": "{프로젝트명}",
  "title": "{제목}",
  "author": "{저자}",
  "description": "{설명}",
  "claude_model": "claude-opus-4-6",
  "settings": {
    "batch_generation_enabled": true,
    "auto_save": true,
    "max_tokens": 16000,
    "temperature": 1.0
  },
  "deployment": {
    "auto_commit": false,
    "auto_deploy": false,
    "build_docx": true,
    "build_website": true
  },
  "created_at": "{ISO8601 타임스탬프}",
  "updated_at": "{ISO8601 타임스탬프}"
}
```

#### 0-3. progress.json 생성

파일: `projects/{프로젝트명}/progress.json`

```json
{
  "project_created_at": "{ISO8601 타임스탬프}",
  "step1_completed": false,
  "step2_completed": false,
  "step3_confirmed": false,
  "chapters": {},
  "last_updated": "{ISO8601 타임스탬프}"
}
```

#### 0-4. 템플릿 적용 (선택사항)

사용자가 템플릿을 지정했으면, `templates/{템플릿ID}.json`을 읽고 `projects/{프로젝트명}/template-info.json`에 복사:

```json
{
  "template_id": "{템플릿ID}",
  "template_name": "{템플릿 이름}",
  "applied_at": "{ISO8601 타임스탬프}"
}
```

#### 0-5. 참고자료 (선택사항)

사용자가 참고자료 파일을 제공하면 `projects/{프로젝트명}/references/`에 저장.

### 사용 가능한 템플릿 (6종)

| ID | 이름 | 아이콘 | 용도 |
|---|---|---|---|
| `programming-course` | 프로그래밍 강의 | 💻 | 코딩 교육, 프레임워크 |
| `school-textbook` | 학교 교과서 | 📚 | 초·중·고 교과서 |
| `business-education` | 비즈니스 교육 | 💼 | 경영, 마케팅 |
| `workshop-material` | 워크숍 자료 | 🎯 | 세미나, 단기 교육 |
| `self-directed-learning` | 자기주도 학습서 | 🌱 | 독학용 입문 |
| `teacher-guide-4c` | 교사용 지도서 (4C) | 👩‍🏫 | 미래역량 기반 수업 |

---

## Step 1: 방향성 논의

### 사용자 지시 예시

```
이 프로젝트의 방향성을 논의하자.
대상은 프로그래밍 경험 없는 고등학교 1학년.
6주 × 2시간 방과후 캠프.
실습 중심, 재미있게.
```

### Claude Code 실행 절차

사용자와 대화하면서 다음 정보를 파악한다:

1. **핵심 철학** (예: "복잡한 이론보다 손으로 만들고 눈으로 확인")
2. **대상 독자** (예: "프로그래밍 경험 없는 고1")
3. **자료 성격** (예: "단기 집중형 실습 입문서")
4. **작성 원칙** (예: "3단계 설명법: 비유 → 정의 → 예시")
5. **특별 메모** (예: "친구들과 결과물 공유 요소 활용")

대화가 정리되면 `master-context.md`를 생성한다.

#### 1-1. master-context.md 작성

파일: `projects/{프로젝트명}/master-context.md`

아래 형식을 따른다:

```markdown
# {교육자료 제목} - 마스터 컨텍스트

---

## 📘 프로젝트 개요

### 책 제목
**{제목}**

### 핵심 철학
**"{핵심 철학}"**

- {세부 원칙 1}
- {세부 원칙 2}
- ...

### 대상 독자
- {대상 설명}
- {수업 형태}
- {환경 설명}

### 자료 성격
**{성격 한 줄 요약}**
- {세부 1}
- {세부 2}
- ...

---

## ✍️ 작성 원칙

### 설명 원칙
**3단계 설명법**:
1. 비유로 시작 - "~는 마치 ~와 같아요"
2. 정확한 정의 - "정확히 말하면, ~입니다"
3. 예시로 확인 - "예를 들어, ~"

### 코드 원칙 (프로그래밍 자료의 경우)
```python
# === WHAT: 무엇을 하는 코드인지 ===
# --- WHY: 왜 필요한지 ---
# HOW: 어떻게 동작하는지 (인라인)
```

**복사-실행 원칙**: 모든 코드는 복사해서 바로 실행 가능해야 함

---

## 📝 메모

{논의 중 나온 특별한 아이디어나 주의사항}

---

*마지막 업데이트: {날짜}*
```

#### 1-2. 대화 기록 저장 (선택)

파일: `projects/{프로젝트명}/discussions/step1_conversation.json`

```json
{
  "step": "1",
  "messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "created_at": "{타임스탬프}",
  "updated_at": "{타임스탬프}"
}
```

#### 1-3. progress.json 업데이트

```json
{
  "step1_completed": true,
  "step1_completed_at": "{타임스탬프}"
}
```

---

## Step 2: 목차 생성

### 사용자 지시 예시

```
목차를 만들어줘.
6주 × 2시간 구성으로, Part별로 나눠서.
```

### Claude Code 실행 절차

#### 2-1. 입력 정보 수집

다음 파일을 읽는다:
- `projects/{프로젝트명}/master-context.md` — 방향성
- `projects/{프로젝트명}/references/*` — 참고자료 (있으면)
- `templates/{템플릿ID}.json` — 템플릿의 `toc_prompt_addition` (있으면)

#### 2-2. toc.json 생성

파일: `projects/{프로젝트명}/toc.json`

**반드시 아래 JSON 스키마를 준수한다:**

```json
{
  "title": "교육자료 전체 제목",
  "description": "전체 설명 (1-2문장)",
  "target_audience": "대상",
  "parts": [
    {
      "part_number": 1,
      "part_title": "Part 1 제목",
      "part_description": "Part 1 설명 (1문장)",
      "chapters": [
        {
          "chapter_id": "chapter01",
          "chapter_number": 1,
          "chapter_title": "챕터 1 제목",
          "learning_objectives": [
            "학습 목표 1",
            "학습 목표 2",
            "학습 목표 3"
          ],
          "outline": "챕터 개요 (3-5문장. 핵심 내용, 활동, 학습 포인트 포함)",
          "estimated_time": "1시간"
        }
      ]
    }
  ]
}
```

**중요 규칙:**
- `chapter_id`는 `chapter01`, `chapter02`, ... 형식 (두 자리 숫자, 01부터)
- `estimated_time`은 "30분", "1시간", "2시간", "1차시"(=50분) 등
- 챕터가 15개를 초과하면 Part를 권 단위로 분리 (part_title에 "[1권]" 접두어)
- outline은 3-5문장으로 간결하게

#### 2-3. toc.md 생성

파일: `projects/{프로젝트명}/toc.md`

toc.json의 내용을 마크다운으로 변환한다:

```markdown
# {title}

{description}

**대상**: {target_audience}

---

## Part {part_number}: {part_title}

{part_description}

### Chapter {chapter_number}: {chapter_title}

**학습 목표:**
- {objective_1}
- {objective_2}
- {objective_3}

**개요:** {outline}

**예상 시간:** {estimated_time}

---
(반복)
```

#### 2-4. master-toc.md 생성

파일: `projects/{프로젝트명}/master-toc.md`

toc.md와 동일한 내용 + 생성 시간 메타데이터:

```markdown
> 생성일시: {ISO8601}
> 모델: Claude Code (하이브리드 워크플로우)

{toc.md와 동일한 내용}
```

#### 2-5. progress.json 업데이트

```json
{
  "step2_completed": true,
  "step2_completed_at": "{타임스탬프}"
}
```

---

## Step 3: 피드백 & 확정

### 사용자 지시 예시

```
목차 괜찮은 것 같아. 확정해줘.
```

또는:

```
chapter05의 제목을 바꿔줘. "센서 활용" → "온도 센서 읽기"로.
그리고 Part 3에 chapter13 하나 추가해줘.
```

### Claude Code 실행 절차

#### 3-1. 목차 수정 (사용자 요청 시)

`toc.json`을 직접 수정하고, `toc.md`와 `master-toc.md`도 동기화한다.

**주의**: `chapter_id` 번호가 연속적인지 확인. 중간에 빠지면 안 됨.

#### 3-2. 목차 확정

progress.json 업데이트:

```json
{
  "step3_confirmed": true,
  "step3_confirmed_at": "{타임스탬프}"
}
```

#### 3-3. 아웃라인 파일 생성

toc.json의 각 챕터에 대해 아웃라인 파일을 생성한다.

파일: `projects/{프로젝트명}/outlines/{chapter_id}.md`

```markdown
# {chapter_title}

**Part {part_number}**: {part_title}

---

## 학습 목표

- [ ] {objective_1}
- [ ] {objective_2}
- [ ] {objective_3}

## 개요

{outline}

## 예상 소요 시간

{estimated_time}

---

## 상세 내용 (챕터 생성 시 작성됨)

이 섹션은 자동 생성 시 채워집니다.
```

---

## Step 4: 챕터 생성 (핵심!)

### 사용자 지시 예시

```
전체 챕터를 생성해줘.
```

또는:

```
chapter01부터 chapter05까지만 먼저 만들어줘.
```

또는:

```
chapter03만 다시 만들어줘. 코드 예제를 더 추가해서.
```

### Claude Code 실행 절차

#### 4-1. 사전 준비: 프롬프트 구성에 필요한 정보 로드

다음 파일을 모두 읽는다:

| 파일 | 용도 |
|------|------|
| `projects/{프로젝트명}/config.json` | 프로젝트 설정 |
| `projects/{프로젝트명}/toc.json` | 목차 (챕터 목록, 개요, 시간) |
| `projects/{프로젝트명}/master-context.md` | 방향성/철학 |
| `projects/{프로젝트명}/outlines/{chapter_id}.md` | 해당 챕터 아웃라인 |
| `projects/{프로젝트명}/references/*` | 참고자료 (있으면 전부) |
| `templates/{템플릿ID}.json` | 템플릿 설정 (있으면) |
| `projects/{프로젝트명}/template-info.json` | 적용된 템플릿 정보 |

#### 4-2. 템플릿별 프롬프트 설정

아래 표에서 해당 템플릿의 역할/대상/철학/스타일/톤을 가져온다:

| 템플릿 ID | role | audience | philosophy | style | tone |
|---|---|---|---|---|---|
| `programming-course` | 프로그래밍 교육자료를 만드는 전문가 | 프로그래밍 학습자 | 코드로 문제를 해결하는 능력을 기르자 | 코드 예제 중심, 실습 위주 | 친근하고 격려하는 톤 |
| `school-textbook` | 학교 교과서 수준의 교육자료를 만드는 전문가 | 학생 | 체계적인 지식 습득과 이해 | 교과서 형식, 학습 목표 명확 | 정확하고 체계적인 톤 |
| `business-education` | 비즈니스 실무 교육자료를 만드는 전문가 | 비즈니스 전문가 및 직장인 | 실무에 바로 적용 가능한 지식 | 사례 중심, 실무 팁 위주 | 전문적이면서 실용적인 톤 |
| `workshop-material` | 워크숍 및 연수 자료를 만드는 전문가 | 워크숍 참가자 | 짧은 시간 내 핵심 역량 습득 | 활동 중심, 참여형 학습 | 활기차고 참여를 유도하는 톤 |
| `self-directed-learning` | 자기주도 학습서를 만드는 전문가 | 독학하는 입문자 | 혼자서도 충분히 이해할 수 있도록 | 친절한 설명, 단계별 안내 | 친근하고 격려하는 톤 |
| `teacher-guide-4c` | 4C 역량 기반 교사용 지도서를 만드는 전문가 | 교사 및 교육 기획자 | 미래 역량 중심 교육 설계 | 지도안 형식, 활동 설계 포함 | 전문적이고 체계적인 톤 |
| *(지정 없음)* | 독학용 교재 수준의 완성도 높은 교육자료를 만드는 전문가 | 학습자 | 혼자 읽어도 이해되는 완성도 | 친근하고 체계적인 설명 | 친근하고 격려하는 톤 |

#### 4-3. 학습 시간 기반 분량 계산

`estimated_time`을 파싱하여 분 단위로 변환:
- "1차시" = 50분, "2차시" = 100분
- "1시간" = 60분, "2시간" = 120분
- "30분" = 30분
- "교사자율" = 0분 (제약 없음)

분량 가이드 계산:
- **글자 수**: `시간(분) × 60` ~ `시간(분) × 100`자
- **핵심 개념**: `max(1, min(4, 시간(분) ÷ 20))`개
- **실습 단계**: `max(2, min(6, 시간(분) ÷ 10))`단계

#### 4-4. 문서 구조 선택

**경량 버전** (60분 이하): 짧은 차시용

```markdown
## 🎯 이 장에서 배우는 것
- [ ] ...할 수 있다 (2-3개)

## 📚 핵심 개념
### 개념: [이름]
1. 비유로 시작
2. 정확한 정의
3. 예시로 확인

## 🔨 따라하기
### Step 1: [소제목]
**코드**: (코드 블록)
**실행 결과**: (출력)

## 📝 전체 코드

## ⚠️ 주의할 점 (1-2개)

## ✅ 점검하기
1. [질문]
<details><summary>정답 확인</summary>[답변]</details>

## 🔗 다음 장 미리보기
```

**표준 버전** (60분 초과): 긴 차시용

```markdown
## 🎯 이 장에서 배우는 것
- [ ] ...할 수 있다 (3-5개)

## 💡 왜 이걸 배우나요?

## 📚 핵심 개념
### 개념 1: [이름]
1. 비유로 시작
2. 정확한 정의
3. 예시로 확인

## 🔨 따라하기
### Step 1~3: [소제목]

## 📝 전체 코드

## ⚠️ 자주 하는 실수 (최소 3개)

## ✅ 스스로 점검하기

## 🚀 더 해보기

## 🔗 다음 장으로
```

#### 4-5. 챕터 작성 규칙

챕터 마크다운을 작성할 때 다음 규칙을 **반드시** 준수한다:

**필수 규칙:**
- 혼자 읽어도 이해 가능한 수준 (선생님 없이도 학습 가능)
- 모든 코드는 복사해서 바로 실행 가능
- 비유와 예시 충분
- 이모지 센스있게 활용
- 다이어그램은 반드시 **Mermaid** 코드블록 사용

**절대 금지:**
- ❌ 마크다운 테이블 (파이프 `|`와 대시 `-`로 만드는 표) — 대신 볼드+목록 또는 Mermaid 사용
- ❌ ASCII art (텍스트 문자로 그림/도표/박스)
- ❌ 언어 태그 없는 코드 블록 (반드시 ```python, ```javascript 등 명시)
- ❌ 지정된 분량을 초과하는 작성

**템플릿 추가 지침:**
- 템플릿 JSON의 `chapter_prompt_addition` 내용도 반영한다
- 예: programming-course 템플릿이면 "코드 블록은 언어 태그와 함께, TIP/WARNING/NOTE 박스 활용, 실습 문제는 난이도별"

#### 4-6. 챕터 파일 저장

파일: `projects/{프로젝트명}/docs/{chapter_id}.md`

#### 4-7. progress.json 업데이트

각 챕터 생성 완료 시:

```json
{
  "chapters": {
    "{chapter_id}": {
      "status": "completed",
      "completed_at": "{ISO8601 타임스탬프}"
    }
  },
  "last_updated": "{ISO8601 타임스탬프}"
}
```

#### 4-8. 배치 생성 팁

전체 챕터를 한번에 생성할 때:

1. toc.json에서 모든 챕터 목록 추출
2. Part 순서대로 순차 생성 (앞 챕터 내용이 뒤 챕터에 영향)
3. 각 챕터 생성 후 즉시 파일 저장 + progress.json 업데이트
4. 중간에 세션이 끊겨도 progress.json으로 이어서 작업 가능

**컨텍스트 관리:**
- 챕터가 많으면 (15개+) Claude Code의 컨텍스트 한계에 주의
- 이전 챕터의 전체 내용을 매번 읽을 필요 없음
- 필요한 정보: master-context.md + toc.json + 해당 챕터 아웃라인 + 참고자료

---

## Step 5: 배포

### 웹 UI 사용 (API 호출 없음)

배포 단계는 Claude API를 사용하지 않으므로 웹 UI를 그대로 사용한다.

```bash
npm run dev
# http://localhost:5173 → 배포 탭
```

**MkDocs 웹사이트:**
1. 설정 생성 → 빌드 → 프리뷰 → GitHub Pages 배포

**DOCX 문서:**
1. 제목 입력 → 생성 → 다운로드

**또는 Claude Code에서 직접:**

```bash
# MkDocs 빌드 (서버 라우트 대신 직접)
cd projects/{프로젝트명}
mkdocs build

# DOCX 변환
pandoc docs/*.md -o output/{프로젝트명}.docx --toc
```

---

## 기존 프로젝트 이어서 작업하기

### 상태 확인

```
projects/{프로젝트명}/progress.json을 읽어서 현재 상태를 알려줘.
```

Claude Code가 확인할 것:
- `step1_completed` → false면 Step 1부터
- `step2_completed` → false면 Step 2부터
- `step3_confirmed` → false면 Step 3부터
- `chapters.{id}.status` → "completed"가 아닌 챕터부터

### 단일 챕터 재생성

```
chapter05를 다시 만들어줘.
코드 예제를 더 풍부하게, 실습 문제도 추가해서.
```

Claude Code 절차:
1. toc.json에서 chapter05 정보 읽기
2. master-context.md 읽기
3. outlines/chapter05.md 읽기 (있으면)
4. references/* 읽기 (있으면)
5. 사용자의 추가 지시 반영하여 챕터 작성
6. docs/chapter05.md 저장
7. progress.json 업데이트

---

## 데이터 호환성

이 워크플로우로 생성한 모든 파일은 EduFlow 웹 UI와 100% 호환된다:

| 파일 | 웹 UI 용도 |
|------|-----------|
| `config.json` | 프로젝트 관리 (ProjectManager) |
| `progress.json` | 진행률 표시 (ProgressBar) |
| `toc.json` | 목차 표시/편집 (TableOfContents) |
| `master-context.md` | 방향성 요약 (Discussion) |
| `docs/*.md` | 챕터 보기/편집 (ChapterCreation) |
| `outlines/*.md` | 아웃라인 참조 |
| `generation_report.json` | 포트폴리오 통계 (Portfolio) |

원본 Python 시스템(`data-ai-book`)과도 호환된다.

---

## 빠른 참조: 파일 경로 요약

```
projects/{프로젝트명}/
├── config.json              ← Step 0
├── progress.json            ← 전 단계에서 업데이트
├── template-info.json       ← Step 0 (템플릿 사용 시)
├── master-context.md        ← Step 1
├── toc.json                 ← Step 2
├── toc.md                   ← Step 2
├── master-toc.md            ← Step 2
├── outlines/
│   ├── chapter01.md         ← Step 3
│   ├── chapter02.md
│   └── ...
├── docs/
│   ├── chapter01.md         ← Step 4
│   ├── chapter02.md
│   └── ...
├── discussions/
│   └── step1_conversation.json  ← Step 1 (선택)
├── references/              ← Step 0 (사용자 제공)
├── logs/                    ← Step 4 (선택)
└── output/                  ← Step 5
```

---

## 실전 예시: 처음부터 끝까지

```
사용자: "파이썬 기초" 프로젝트를 만들어줘.
       프로그래밍 경험 없는 고1 대상, 8차시 × 50분.
       programming-course 템플릿으로.

→ Claude Code: Step 0 실행 (config.json, progress.json, template-info.json 생성)

사용자: 방향성은 "코딩으로 문제를 해결하는 즐거움"으로 가자.
       매 차시 작은 프로젝트 완성, 게임 요소 활용.

→ Claude Code: Step 1 실행 (master-context.md 생성, progress 업데이트)

사용자: 목차 만들어줘.

→ Claude Code: Step 2 실행 (toc.json, toc.md, master-toc.md 생성)

사용자: 좋아, 확정이야. 챕터 전부 만들어줘.

→ Claude Code: Step 3 확정 (progress 업데이트, outlines 생성)
→ Claude Code: Step 4 실행 (chapter01.md ~ chapter08.md 순차 생성)

사용자: chapter03 코드 예제가 좀 약한데, 다시 만들어줘.

→ Claude Code: chapter03만 재생성

사용자: 배포해줘.

→ Claude Code: npm run dev 안내 또는 mkdocs build 직접 실행
```

---

## 주의사항

1. **컨텍스트 한계**: 챕터를 많이 생성하면 Claude Code 세션의 컨텍스트가 소진될 수 있다. 이 경우 새 세션에서 이 파일을 읽고, progress.json으로 이어서 작업한다.
2. **마크다운 테이블 금지**: EduFlow의 핵심 규칙. Mermaid나 볼드+목록으로 대체.
3. **JSON 스키마 엄수**: toc.json, config.json, progress.json의 구조를 변경하면 웹 UI와 호환이 깨진다.
4. **chapter_id 형식**: 반드시 `chapter01`, `chapter02` ... 두 자리 숫자.
5. **원본 수정 금지**: `../data-ai-book/`의 파일은 절대 수정하지 않는다.
