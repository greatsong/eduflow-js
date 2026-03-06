# EduFlow v1.1 - 결과물 품질 혁신 계획

> ai-physical-computing 프로젝트의 결과물 품질을 eduflow로 생성하는 모든 교재에 적용하기 위한 업그레이드

## 핵심 목표

eduflow로 만든 교재가 ai-physical-computing 수준으로 나오도록:
1. **교육적 장치를 사용자와 논의하여 선택** (주제별 맞춤)
2. **챕터 생성 프롬프트에 선택된 장치를 반영**
3. **메타데이터 풍부화** (난이도, 준비물, 핵심 질문)
4. **Astro Starlight 배포 옵션** (MkDocs 대비 결과물 품질 상승)
5. **문서 통합** (CLAUDE.md 단일화)

---

## Phase A: 교육적 장치 논의 시스템

### 배경

ai-physical-computing의 품질을 만든 핵심은 "8섹션 일관 구조"와 교육적 장치들:
- "오늘의 질문" (호기심 유발)
- "와우 모먼트" (개념의 흐름 시각화)
- "데이터로 생각하기" (실측 데이터 분석)
- "체크리스트" (자기 점검)
- "코드 탭" (기본/도전 분리)
- "마무리 + 다음 차시 미리보기"

하지만 이 장치들은 **주제에 따라 달라진다**:
- 프로그래밍 교재: 코드 탭, 디버깅 팁, 실행 결과
- 역사 교과서: 사료 읽기, 시대 비교, 토론 질문
- 과학 실험서: 준비물, 실험 절차, 안전 주의, 데이터 기록

### 구현: "교육적 장치 협의" 단계 (Step 1.5)

방향성 논의(Step 1) 완료 후, 챕터 생성(Step 4) 전에 새로운 단계 삽입:

#### A-1. 교육적 장치 카탈로그 (`shared/pedagogicalDevices.js`)

```javascript
export const PEDAGOGICAL_DEVICES = [
  // 도입부
  { id: 'key_question', name: '오늘의 질문', category: 'opening',
    description: '각 차시를 호기심을 유발하는 질문으로 시작',
    example: '"우리 교실의 온도는 정말 24도일까?"',
    applicability: ['all'] },

  { id: 'learning_goals_checkbox', name: '학습 목표 체크박스', category: 'opening',
    description: '이 장에서 배울 것을 체크박스로 나열',
    example: '- [ ] 센서를 I2C 포트에 연결할 수 있다',
    applicability: ['all'] },

  { id: 'motivation', name: '왜 배우나요?', category: 'opening',
    description: '학습 동기를 실생활 맥락으로 설명',
    applicability: ['all'] },

  // 본문
  { id: 'concept_trio', name: '개념 3단계 (비유-정의-예시)', category: 'content',
    description: '추상 개념을 비유로 시작 → 정확한 정의 → 예시로 확인',
    applicability: ['all'] },

  { id: 'code_tabs', name: '코드 탭 (기본/도전)', category: 'content',
    description: '기본 코드와 도전 코드를 탭으로 분리',
    applicability: ['programming', 'physical-computing'] },

  { id: 'step_by_step', name: '단계별 활동 (시간 배분)', category: 'content',
    description: 'Step 1~N으로 활동을 나누고 각각 소요시간 표시',
    applicability: ['workshop', 'physical-computing', 'lab'] },

  { id: 'wow_moment', name: '와우 모먼트', category: 'content',
    description: '핵심 개념의 흐름을 시각적으로 보여주는 순간',
    example: '"빛 에너지 → 저항 변화 → 전압 변화 → ADC 숫자 → 퍼센트 → 그래프"',
    applicability: ['science', 'physical-computing'] },

  { id: 'data_activity', name: '데이터로 생각하기', category: 'content',
    description: '실측 데이터를 수집하고 분석하는 활동',
    applicability: ['science', 'physical-computing', 'statistics'] },

  { id: 'discussion_questions', name: '토론 질문', category: 'content',
    description: '학생 간 토론을 유도하는 개방형 질문',
    applicability: ['humanities', 'ethics', 'social'] },

  { id: 'case_study', name: '사례 연구', category: 'content',
    description: '실제 사례를 분석하는 활동',
    applicability: ['business', 'social', 'ethics'] },

  { id: 'equipment_list', name: '준비물 목록', category: 'content',
    description: '차시에 필요한 재료/도구 목록',
    applicability: ['physical-computing', 'lab', 'workshop', 'art'] },

  { id: 'safety_notes', name: '안전 주의사항', category: 'content',
    description: '실험/활동 시 안전 수칙',
    applicability: ['lab', 'physical-computing', 'chemistry'] },

  { id: 'source_reading', name: '원문/사료 읽기', category: 'content',
    description: '1차 자료를 직접 읽고 분석',
    applicability: ['history', 'literature', 'philosophy'] },

  // 마무리
  { id: 'self_check', name: '스스로 점검하기', category: 'closing',
    description: '핵심 개념 확인 문제 + 정답 숨기기',
    applicability: ['all'] },

  { id: 'checklist', name: '체크리스트', category: 'closing',
    description: '이 차시에서 달성해야 할 것들의 체크리스트',
    applicability: ['all'] },

  { id: 'next_preview', name: '다음 차시 미리보기', category: 'closing',
    description: '다음에 배울 내용을 힌트로 제시',
    applicability: ['all'] },

  { id: 'further_exploration', name: '더 해보기 (심화)', category: 'closing',
    description: '추가 도전 과제나 탐구 활동',
    applicability: ['all'] },

  { id: 'rubric', name: '평가 기준표', category: 'closing',
    description: '수행 수준별 평가 기준 (필수/우수/탁월)',
    applicability: ['teacher-guide', 'workshop'] },
];
```

#### A-2. AI 기반 장치 추천 (방향성 논의 요약 기반)

방향성 논의(Step 1) 완료 시, AI가 주제와 대상에 맞는 교육적 장치를 추천:

```
"이 교재의 주제와 대상을 분석한 결과, 다음 교육적 장치를 추천합니다:

[필수 추천] (주제 특성상 반드시 포함)
- 학습 목표 체크박스
- 개념 3단계 (비유-정의-예시)
- 스스로 점검하기

[강력 추천] (품질 향상에 크게 기여)
- 오늘의 질문
- 단계별 활동 (시간 배분)
- 체크리스트

[선택 추천] (주제에 따라 유용)
- 코드 탭 (기본/도전)
- 와우 모먼트
- 데이터로 생각하기

선택하세요 (기본: 필수+강력 추천 전체 선택)"
```

#### A-3. UI: Discussion 페이지 확장 또는 새 페이지

- 방향성 논의 완료 후 "교육적 장치 선택" 패널 표시
- AI 추천 + 사용자 수동 토글
- 선택 결과를 `projects/{name}/pedagogical_config.json`에 저장

#### A-4. 저장 형식

```json
// projects/{name}/pedagogical_config.json
{
  "selected_devices": [
    "key_question",
    "learning_goals_checkbox",
    "motivation",
    "concept_trio",
    "code_tabs",
    "step_by_step",
    "self_check",
    "checklist",
    "next_preview"
  ],
  "custom_devices": [
    {
      "id": "sensor_wiring",
      "name": "센서 연결 다이어그램",
      "description": "각 차시에 사용하는 센서의 연결 방법을 시각적으로 설명"
    }
  ],
  "recommended_by_ai": true,
  "selected_at": "2026-03-07T..."
}
```

---

## Phase B: 챕터 생성 프롬프트 강화

### B-1. 동적 문서 구조 생성

현재 `_buildPrompt()`의 `docStructure`는 compact/regular 2가지 고정 구조.
이를 `pedagogical_config.json`의 선택된 장치에 따라 동적으로 생성:

```javascript
// chapterGenerator.js 수정
_buildDocStructure(selectedDevices, isCompact, effectiveTimeLabel) {
  let structure = '# 문서 구조 (필수)\n\n';

  // opening 장치들
  const openings = selectedDevices.filter(d => d.category === 'opening');
  for (const device of openings) {
    structure += this._getDeviceTemplate(device, isCompact);
  }

  // content 장치들
  const contents = selectedDevices.filter(d => d.category === 'content');
  for (const device of contents) {
    structure += this._getDeviceTemplate(device, isCompact);
  }

  // closing 장치들
  const closings = selectedDevices.filter(d => d.category === 'closing');
  for (const device of closings) {
    structure += this._getDeviceTemplate(device, isCompact);
  }

  return structure;
}
```

### B-2. 장치별 프롬프트 템플릿

각 교육적 장치가 프롬프트에서 어떤 형태로 들어가는지 정의:

```javascript
const DEVICE_TEMPLATES = {
  key_question: {
    compact: '> **오늘의 질문**: [이 차시의 핵심을 관통하는 호기심 유발 질문 1개]\n\n',
    regular: '> **오늘의 질문**: [이 차시의 핵심을 관통하는 호기심 유발 질문 1개]\n> 이 질문에 대한 답을 차시가 끝날 때 스스로 해볼 수 있어야 합니다.\n\n',
  },
  wow_moment: {
    compact: '## 와우 모먼트\n[핵심 개념이 연결되는 "아하!" 순간을 화살표 흐름으로 표현]\n예: "입력 → 변환 → 처리 → 출력 → 의미"\n\n',
    regular: '## 와우 모먼트\n[핵심 개념이 연결되는 "아하!" 순간]\n1. 6단계 이내의 화살표 흐름으로 표현\n2. 각 단계에 짧은 설명 추가\n3. 왜 이것이 놀라운지 1-2문장으로 설명\n\n',
  },
  // ... 각 장치별 정의
};
```

### B-3. 메타데이터를 프롬프트에 반영

toc.json에 추가된 메타데이터(난이도, 준비물, 핵심 질문)를 프롬프트에 자동 삽입:

```
# 작성할 챕터 정보
**ID**: chapter01
**제목**: 센서로 세상 읽기
**난이도**: 1/5 (입문)
**준비물**: Raspberry Pi Pico 2 WH, DHT20 센서, USB-C 케이블
**핵심 질문**: "우리 교실의 온도는 정말 24도일까?"
**Part**: Part 1 - 센서와 친해지기
```

---

## Phase C: toc.json 메타데이터 확장

### C-1. 챕터 스키마 확장

```json
{
  "chapter_id": "chapter01",
  "chapter_number": 1,
  "chapter_title": "센서로 세상 읽기",
  "learning_objectives": ["목표1", "목표2", "목표3"],
  "outline": "챕터 개요",
  "estimated_time": "50분",

  // v1.1 추가 필드
  "difficulty": 1,                    // 1~5
  "key_question": "우리 교실의 온도는 정말 24도일까?",
  "equipment": ["Raspberry Pi Pico 2 WH", "DHT20 센서"],
  "keywords": ["I2C", "온습도", "센서"]
}
```

### C-2. TOC 생성 프롬프트 수정

`tocGenerator.js`의 프롬프트에 새 필드 요청 추가:

```json
{
  "chapter_id": "chapter01",
  "chapter_title": "...",
  "learning_objectives": ["...", "...", "..."],
  "outline": "...",
  "estimated_time": "50분",
  "difficulty": 1,
  "key_question": "호기심을 유발하는 질문",
  "equipment": ["필요한 도구/재료"],
  "keywords": ["핵심 키워드"]
}
```

### C-3. 하위 호환성

기존 toc.json에 새 필드가 없어도 동작하도록:
- `difficulty`: 없으면 `0` (미지정)
- `key_question`: 없으면 프롬프트에서 AI가 자동 생성
- `equipment`: 없으면 생략
- `keywords`: 없으면 생략

---

## Phase D: Astro Starlight 배포 옵션 (중기)

### D-1. 왜 Starlight인가

| 항목 | MkDocs Material | Astro Starlight |
|------|----------------|-----------------|
| 내장 컴포넌트 | admonition, tabs | Tabs, Card, Steps, Aside, LinkCard |
| 코드 하이라이팅 | Pygments | Shiki (더 정확) |
| 검색 | lunr.js | Pagefind (더 빠름) |
| 빌드 속도 | Python 기반 | Node.js 기반 (더 빠름) |
| 커스텀 컴포넌트 | 불가 | React/Vue Islands |
| i18n | 플러그인 | 내장 |

### D-2. 구현 범위

1. `deployment.js`에 `deployToStarlight()` 메서드 추가
2. 마크다운 → MDX 변환 (admonition → Aside, tabs → Tabs 등)
3. `astro.config.mjs` + `package.json` 자동 생성
4. `npm install && npm run build` → `dist/` 생성
5. GitHub Pages 배포

### D-3. 마크다운 → MDX 변환 규칙

```
:::tip → <Aside type="tip">
:::warning → <Aside type="caution">
:::note → <Aside type="note">
```python → (그대로 유지, Shiki가 처리)
체크박스 → (그대로 유지)
Mermaid → (그대로 유지, 플러그인으로 처리)
```

---

## Phase E: 문서 통합

### E-1. CLAUDE.md 통합

현재 분산된 문서:
- `CLAUDE.md` (프로젝트 가이드)
- `PROGRESS.md` (Phase별 진행 상태)
- `ARCHITECTURE.md` (아키텍처 상세)

통합 후:
- `CLAUDE.md` (통합 가이드 - 핵심만)
- `PROGRESS.md` → CLAUDE.md의 "현재 상태" 섹션으로 축소
- `ARCHITECTURE.md` → CLAUDE.md의 디렉토리 구조 + 간략 설명으로 축소

### E-2. 원칙

- 새 세션에서 CLAUDE.md 하나만 읽으면 전체 컨텍스트 파악 가능
- 200줄 이내 목표 (AI 컨텍스트 효율)
- 상세 이력은 git log로 확인

---

## 실행 순서

| 순서 | Phase | 작업 | 의존성 |
|------|-------|------|--------|
| 1 | E | 문서 통합 | 없음 |
| 2 | A-1 | 교육적 장치 카탈로그 | 없음 |
| 3 | C | toc.json 메타데이터 확장 + TOC 프롬프트 수정 | 없음 |
| 4 | A-2,3 | AI 추천 + UI | A-1 |
| 5 | B | 챕터 프롬프트 강화 | A, C |
| 6 | D | Starlight 배포 | B (독립 가능) |

---

## 버전 정보

- **v1.0**: Phase 1~8 완료 (기능 완성)
- **v1.1**: 결과물 품질 혁신 (이 계획)
  - v1.1.0: 문서 통합 + 교육적 장치 카탈로그
  - v1.1.1: TOC 메타데이터 확장
  - v1.1.2: 장치 추천 AI + 논의 UI
  - v1.1.3: 챕터 프롬프트 동적 구조
  - v1.1.4: Starlight 배포 옵션