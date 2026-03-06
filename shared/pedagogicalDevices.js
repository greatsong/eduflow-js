/**
 * 교육적 장치(Pedagogical Devices) 카탈로그
 *
 * 챕터 생성 시 사용자가 선택한 장치들이 프롬프트에 동적 주입됩니다.
 * 각 장치는 id, 이름, 설명, 카테고리, 프롬프트 지시문으로 구성됩니다.
 */

export const DEVICE_CATEGORIES = [
  { id: 'visualization', label: '시각화', icon: '📊' },
  { id: 'practice', label: '실습/활동', icon: '🔨' },
  { id: 'comprehension', label: '이해 촉진', icon: '💡' },
  { id: 'assessment', label: '평가/점검', icon: '✅' },
  { id: 'engagement', label: '흥미/동기', icon: '🎯' },
];

export const PEDAGOGICAL_DEVICES = [
  // ── 시각화 ──
  {
    id: 'mermaid-flowchart',
    name: 'Mermaid 플로차트',
    description: '프로세스, 의사결정, 알고리즘 흐름을 다이어그램으로 표현',
    category: 'visualization',
    prompt: `## Mermaid 플로차트 사용 규칙
- 프로세스나 알고리즘은 반드시 Mermaid flowchart(TD 또는 LR)로 시각화하세요
- 의사결정 분기는 다이아몬드({})로, 처리는 사각형([])로 표현
- 한 다이어그램에 노드 8개 이내로 간결하게
- 예시:
\`\`\`mermaid
flowchart TD
    A[시작] --> B{조건?}
    B -->|Yes| C[실행]
    B -->|No| D[종료]
\`\`\``,
  },
  {
    id: 'mermaid-sequence',
    name: 'Mermaid 시퀀스 다이어그램',
    description: '통신, 데이터 흐름, 상호작용 순서를 표현',
    category: 'visualization',
    prompt: `## Mermaid 시퀀스 다이어그램 사용 규칙
- 두 개 이상의 주체가 상호작용하는 과정은 시퀀스 다이어그램으로 표현하세요
- 참여자(participant)에 한글 별칭을 붙여 가독성 확보
- 메시지는 간결하게, 핵심 동작만 포함`,
  },
  {
    id: 'mermaid-state',
    name: 'Mermaid 상태 다이어그램',
    description: '상태 전이, 모드 변경, 라이프사이클을 표현',
    category: 'visualization',
    prompt: `## Mermaid 상태 다이어그램 사용 규칙
- 상태 변화가 있는 시스템은 stateDiagram-v2로 시각화하세요
- 각 상태에 한글 설명을 넣고, 전이 조건을 화살표에 표기`,
  },
  {
    id: 'mermaid-mindmap',
    name: 'Mermaid 마인드맵',
    description: '개념의 구조와 관계를 트리 형태로 시각화',
    category: 'visualization',
    prompt: `## Mermaid 마인드맵 사용 규칙
- 챕터의 핵심 개념 구조를 마인드맵으로 한눈에 보여주세요
- 챕터 시작이나 끝에 "전체 개념 지도"로 활용
- 예시:
\`\`\`mermaid
mindmap
  root((피지컬 컴퓨팅))
    입력
      센서
        온도
        빛
      버튼
    처리
      마이크로컨트롤러
    출력
      LED
      모터
      부저
\`\`\``,
  },
  {
    id: 'mermaid-pie',
    name: 'Mermaid 파이/XY 차트',
    description: '데이터 비율이나 추세를 차트로 시각화',
    category: 'visualization',
    prompt: `## Mermaid 차트 사용 규칙
- 데이터 비율을 보여줄 때 pie 차트, 추세를 보여줄 때 xychart-beta를 사용하세요
- 파이 차트 예시:
\`\`\`mermaid
pie title 센서 활용 분야
    "환경 모니터링" : 40
    "보안/안전" : 25
    "자동화" : 20
    "헬스케어" : 15
\`\`\`
- XY 차트 예시:
\`\`\`mermaid
xychart-beta
    title "온도 변화"
    x-axis [9시, 10시, 11시, 12시, 13시]
    y-axis "온도(°C)" 20 --> 35
    line [22, 25, 28, 31, 29]
\`\`\``,
  },
  {
    id: 'mermaid-gantt',
    name: 'Mermaid 간트/타임라인',
    description: '프로젝트 일정, 학습 로드맵을 타임라인으로 표현',
    category: 'visualization',
    prompt: `## Mermaid 타임라인/간트 사용 규칙
- 프로젝트 단계나 학습 로드맵은 timeline 또는 gantt로 시각화하세요
- 타임라인 예시:
\`\`\`mermaid
timeline
    title 프로젝트 진행
    1주차 : 문제 발견 : 센서 학습
    2주차 : 프로토타입 제작
    3주차 : 테스트 및 개선
    4주차 : 발표 및 설치
\`\`\``,
  },
  {
    id: 'mermaid-class',
    name: 'Mermaid 클래스/ER 다이어그램',
    description: '데이터 구조, 객체 관계를 다이어그램으로 표현',
    category: 'visualization',
    prompt: `## Mermaid 클래스/ER 다이어그램 사용 규칙
- 데이터 구조나 객체 간 관계를 보여줄 때 classDiagram 또는 erDiagram 사용
- 클래스 다이어그램은 속성과 메서드를 명확히 표기
- 관계선은 한글 라벨로 설명`,
  },
  {
    id: 'emoji-visual',
    name: '이모지 시각 언어',
    description: '이모지를 체계적으로 활용한 시각적 구분과 강조',
    category: 'visualization',
    prompt: `## 이모지 시각 언어 규칙
- 섹션 구분에 일관된 이모지 체계를 사용하세요:
  - 🎯 학습 목표 | 💡 동기 부여 | 📚 핵심 개념
  - 🔨 실습 | 📝 전체 코드 | ⚠️ 주의사항
  - ✅ 점검 | 🚀 도전 과제 | 🔗 다음 장
- 난이도 표시: ⭐(기본) ⭐⭐(응용) ⭐⭐⭐(도전)
- 상태 표시: ✅ 완료 | ⏳ 진행중 | ❌ 실패`,
  },
  {
    id: 'concept-comparison',
    name: '개념 비교 다이어그램',
    description: '유사 개념들의 차이점을 시각적으로 비교',
    category: 'visualization',
    prompt: `## 개념 비교 시각화 규칙
- 두 개 이상의 개념을 비교할 때는 마크다운 테이블 대신 Mermaid나 볼드+목록으로 표현하세요
- "A vs B" 형태의 비교는 아래 패턴 사용:

**A 방식**
- 특징 1
- 특징 2

**B 방식**
- 특징 1
- 특징 2

> 핵심 차이: [한 문장 요약]`,
  },

  // ── 실습/활동 ──
  {
    id: 'step-by-step',
    name: '단계별 실습',
    description: '번호가 매겨진 순차적 실습으로 완성 코드까지 안내',
    category: 'practice',
    prompt: `## 단계별 실습 작성 규칙
- 각 Step에는 **목표**, **코드**, **실행 결과**를 반드시 포함
- Step 간에 이전 코드를 점진적으로 확장하는 스캐폴딩 방식
- 마지막에 "📝 전체 코드" 섹션으로 완성본 제공
- 각 Step의 코드에는 새로 추가된 부분에만 주석 표시`,
  },
  {
    id: 'challenge-levels',
    name: '단계별 도전 과제',
    description: '쉬움→보통→어려움 3단계 과제로 자기주도 학습',
    category: 'practice',
    prompt: `## 단계별 도전 과제 규칙
- "🚀 더 해보기" 섹션에 3단계 도전 과제를 넣으세요:
  - ⭐ 기본: 배운 내용을 약간 변형
  - ⭐⭐ 응용: 새로운 조건을 추가
  - ⭐⭐⭐ 도전: 스스로 설계가 필요한 과제
- 각 과제에 힌트를 <details> 태그로 숨겨서 제공`,
  },
  {
    id: 'mini-project',
    name: '미니 프로젝트',
    description: '챕터 끝에 배운 내용을 종합하는 소규모 프로젝트',
    category: 'practice',
    prompt: `## 미니 프로젝트 규칙
- 챕터 끝에 배운 핵심 개념들을 종합하는 미니 프로젝트를 제시하세요
- 요구사항을 명확히 나열하고, 예상 완성 결과를 설명
- 완성 코드는 <details> 태그로 숨겨서 먼저 시도해보게 유도`,
  },

  // ── 이해 촉진 ──
  {
    id: 'analogy-first',
    name: '비유 우선 설명',
    description: '모든 새 개념을 일상적 비유로 먼저 소개',
    category: 'comprehension',
    prompt: `## 비유 우선 설명 규칙
- 모든 새로운 개념은 반드시 "비유 → 정의 → 예시" 3단계로 설명하세요
- 비유는 학습자의 일상 경험에서 가져오기 (학교, 게임, 음식 등)
- 형식: "~는 마치 **~**와 같아요. [비유 설명] → 정확히 말하면, [정의]"`,
  },
  {
    id: 'before-after',
    name: 'Before/After 비교',
    description: '변경 전후를 나란히 보여주어 차이를 직관적으로 이해',
    category: 'comprehension',
    prompt: `## Before/After 비교 규칙
- 코드 개선이나 개념 변화를 보여줄 때 "Before → After" 패턴을 사용하세요
- 두 코드 블록을 나란히 배치하고, 변경된 부분을 주석으로 강조
- "무엇이 바뀌었나요?" 질문으로 학습자의 관찰력 유도`,
  },
  {
    id: 'common-mistakes',
    name: '자주 하는 실수',
    description: '학습자가 흔히 빠지는 함정을 미리 경고',
    category: 'comprehension',
    prompt: `## 자주 하는 실수 섹션 규칙
- "⚠️ 자주 하는 실수" 섹션에서 최소 3개의 흔한 실수를 다루세요
- 각 실수에 대해: 잘못된 코드 → 에러/문제 → 올바른 코드 순서로 설명
- 실수의 원인을 "왜 이런 실수를 할까?" 형태로 설명`,
  },
  {
    id: 'mental-model',
    name: '멘탈 모델 구축',
    description: '추상적 개념의 내부 작동 원리를 시각적으로 설명',
    category: 'comprehension',
    prompt: `## 멘탈 모델 구축 규칙
- 추상적 개념은 "내부에서 무슨 일이 일어나는지" 시각적으로 보여주세요
- Mermaid 다이어그램 또는 단계별 설명으로 내부 동작 과정을 풀어서 설명
- "컴퓨터/시스템 입장에서 생각하면..." 패턴 활용`,
  },

  // ── 평가/점검 ──
  {
    id: 'self-check',
    name: '자기 점검 퀴즈',
    description: '핵심 개념 이해를 확인하는 질문과 숨겨진 정답',
    category: 'assessment',
    prompt: `## 자기 점검 퀴즈 규칙
- "✅ 스스로 점검하기" 섹션에 3~5개의 점검 질문을 넣으세요
- 단순 암기가 아닌 이해/적용 수준의 질문
- 정답은 <details><summary>정답 확인</summary>답변</details> 형태로 숨기기
- 코드 예측 문제도 포함 (이 코드의 출력은?)`,
  },
  {
    id: 'learning-checklist',
    name: '학습 목표 체크리스트',
    description: '챕터 시작에 체크박스 형태의 학습 목표 제시',
    category: 'assessment',
    prompt: `## 학습 목표 체크리스트 규칙
- 챕터 시작에 "🎯 이 장에서 배우는 것" 섹션을 반드시 포함
- 각 목표는 "- [ ] ~할 수 있다" 형태의 체크박스
- 목표는 구체적이고 측정 가능해야 함 (Bloom's Taxonomy 기반)
- 챕터 끝에서 이 체크리스트를 다시 언급하며 달성 여부 점검`,
  },
  {
    id: 'output-prediction',
    name: '출력 예측 연습',
    description: '코드를 보고 실행 결과를 먼저 예측하게 한 뒤 정답 공개',
    category: 'assessment',
    prompt: `## 출력 예측 연습 규칙
- 중요 코드 예제 후에 "이 코드의 실행 결과를 예측해보세요" 질문을 넣으세요
- 정답은 <details> 태그로 숨기기
- 예측이 틀렸을 때 "왜 그런 결과가 나오는지" 설명 포함`,
  },

  // ── 흥미/동기 ──
  {
    id: 'real-world-connection',
    name: '실생활 연결',
    description: '배우는 내용이 실제로 어디에 쓰이는지 사례 제시',
    category: 'engagement',
    prompt: `## 실생활 연결 규칙
- "💡 왜 이걸 배우나요?" 섹션에서 실생활/산업 사례를 제시하세요
- "이 기술은 실제로 [구체적 서비스/제품]에서 사용됩니다" 형태
- 학습자의 관심사와 연결 (게임, SNS, 유튜브 등)`,
  },
  {
    id: 'story-driven',
    name: '스토리 기반 학습',
    description: '캐릭터나 시나리오를 통해 개념을 전달',
    category: 'engagement',
    prompt: `## 스토리 기반 학습 규칙
- 챕터에 일관된 시나리오나 캐릭터를 설정하세요
- "영희가 카페를 운영하는데..." 같은 맥락에서 개념을 설명
- 시나리오가 챕터 전체에 걸쳐 이어지며 점점 발전`,
  },
  {
    id: 'think-aloud',
    name: '생각 말하기 (Think Aloud)',
    description: '전문가의 사고 과정을 투명하게 보여주기',
    category: 'engagement',
    prompt: `## 생각 말하기 (Think Aloud) 규칙
- 문제 해결 과정에서 "내가 이 문제를 보면 먼저 ~를 생각합니다" 형태로 사고 과정을 노출
- 왜 그런 결정을 했는지, 다른 선택지는 왜 안 되는지 설명
- 인용구(>) 블록을 활용하여 "사고 과정" 표시`,
  },
  {
    id: 'next-preview',
    name: '다음 장 미리보기',
    description: '챕터 끝에 다음에 배울 내용을 흥미롭게 예고',
    category: 'engagement',
    prompt: `## 다음 장 미리보기 규칙
- 챕터 마지막에 "🔗 다음 장 미리보기" 섹션 포함
- "지금까지 ~를 배웠으니, 다음에는 ~를 할 수 있게 됩니다" 형태
- 다음 장에서 만들 결과물이나 해결할 문제를 미리 제시하여 기대감 유발`,
  },
];

/**
 * 주제/분야별 추천 장치 세트
 */
export const RECOMMENDED_SETS = {
  'programming': {
    label: '프로그래밍 교육',
    devices: ['mermaid-flowchart', 'step-by-step', 'analogy-first', 'common-mistakes', 'self-check', 'challenge-levels', 'output-prediction', 'next-preview'],
  },
  'physical-computing': {
    label: '피지컬 컴퓨팅/메이커',
    devices: ['mermaid-flowchart', 'mermaid-state', 'step-by-step', 'analogy-first', 'before-after', 'common-mistakes', 'learning-checklist', 'real-world-connection', 'next-preview'],
  },
  'data-science': {
    label: '데이터 과학/AI',
    devices: ['mermaid-flowchart', 'mermaid-sequence', 'step-by-step', 'mental-model', 'concept-comparison', 'self-check', 'real-world-connection', 'mini-project'],
  },
  'general-theory': {
    label: '이론/개념 교육',
    devices: ['concept-comparison', 'analogy-first', 'mental-model', 'learning-checklist', 'self-check', 'real-world-connection', 'story-driven', 'next-preview'],
  },
  'workshop': {
    label: '워크숍/연수',
    devices: ['step-by-step', 'before-after', 'challenge-levels', 'think-aloud', 'mini-project', 'learning-checklist'],
  },
};

/**
 * 선택된 장치 ID 배열로부터 프롬프트 텍스트 생성
 */
export function buildDevicesPrompt(selectedDeviceIds) {
  if (!selectedDeviceIds || selectedDeviceIds.length === 0) return '';

  const devices = selectedDeviceIds
    .map(id => PEDAGOGICAL_DEVICES.find(d => d.id === id))
    .filter(Boolean);

  if (devices.length === 0) return '';

  const sections = devices.map(d => d.prompt).join('\n\n');

  return `
# 교육적 장치 (반드시 적용할 것!)
아래 교육적 장치들을 챕터 작성에 적극 활용하세요.

${sections}
`;
}
