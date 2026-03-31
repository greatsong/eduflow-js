import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { apiFetch, API_BASE, getApiKey } from '../api/client';
import ReactMarkdown from 'react-markdown';

// 정보·AI 교육 특화 평가 프리셋
const PRESET_CATEGORIES = [
  {
    category: '컴퓨팅 사고력',
    color: 'bg-blue-50 text-blue-700',
    presets: [
      { name: '알고리즘 설계', prompt: '중학교 "정보" 교과서의 **"정렬 알고리즘"** 단원을 작성해주세요.\n\n조건:\n- 대상: 중학교 2학년 (프로그래밍 경험 없음)\n- 버블 정렬, 선택 정렬을 일상생활 비유로 도입 (예: 키 순서대로 줄 세우기)\n- 각 알고리즘의 동작 과정을 단계별로 보여주는 예시 (숫자 5개)\n- 스크래치 블록 코딩 → 파이썬 코드 순서로 구현\n- 두 알고리즘의 비교 표 (비교 횟수, 교환 횟수, 장단점)\n- 생각해보기: "카드 10장을 가장 빠르게 정렬하는 나만의 방법은?"\n- 평가: 트레이싱 문제 2개 + 코딩 문제 1개 (정답·해설 포함)' },
      { name: '추상화와 분해', prompt: '고등학교 "정보" 수업에서 **"문제 분해와 추상화"**를 가르치는 교육자료를 작성해주세요.\n\n조건:\n- 실생활 문제: "학교 축제 부스 배치 최적화"를 예시로 사용\n- 문제 분해: 큰 문제를 하위 문제 5개로 나누는 과정을 시각적으로 표현\n- 추상화: 불필요한 정보를 제거하고 핵심 변수만 추출하는 과정 시연\n- 패턴 인식: 유사한 문제(교실 좌석 배치, 주차장 배치)와의 공통점 발견\n- 알고리즘 설계: 분해된 하위 문제 각각의 해결 절차를 의사코드로 작성\n- 학생 활동: 모둠별로 "급식 메뉴 최적화" 문제를 분해·추상화하는 워크시트' },
    ],
  },
  {
    category: 'AI·머신러닝 개념',
    color: 'bg-emerald-50 text-emerald-700',
    presets: [
      { name: 'AI 원리 설명', prompt: '고등학교 "인공지능 기초" 과목에서 **"지도학습의 원리"**를 설명하는 교육자료를 작성해주세요.\n\n조건:\n- 비유: "시험공부"에 빗대어 설명 (문제집=훈련데이터, 정답=라벨, 실전시험=예측)\n- 분류와 회귀의 차이를 학생 친화적 예시로 구분 (스팸 판별 vs 시험 점수 예측)\n- k-NN 알고리즘을 "가장 가까운 친구에게 물어보기"로 설명\n- 과적합/과소적합을 "벼락치기 vs 대충 공부"로 비유\n- 코드 없이 개념만으로 이해할 수 있도록 구성\n- 학생이 직접 해볼 수 있는 언플러그드 활동 1개 설계\n- 확인 퀴즈 3문항 (정답·해설 포함)' },
      { name: '데이터 리터러시', prompt: '중학교 "정보" 과목의 **"데이터 수집과 시각화"** 단원을 작성해주세요.\n\n조건:\n- 실습 시나리오: "우리 반 학생들의 통학 시간 조사"\n- 데이터 수집: 설문 설계 → 응답 수집 → 스프레드시트 정리 과정\n- 데이터 정제: 결측값, 이상값 처리를 학생 수준에서 설명\n- 시각화: 같은 데이터를 막대그래프, 원그래프, 히스토그램으로 표현했을 때 각각 어떤 인사이트가 보이는지 비교\n- "데이터로 거짓말하기": 축 조작, 일부 데이터만 선택 등 왜곡 사례 3개\n- 학생 활동: 공공데이터 포털에서 데이터를 찾아 시각화하는 미니 프로젝트 가이드\n- 평가: 주어진 그래프를 비판적으로 분석하는 서술형 문항 2개' },
    ],
  },
  {
    category: '프로그래밍 교육',
    color: 'bg-purple-50 text-purple-700',
    presets: [
      { name: '파이썬 입문', prompt: '중학교 "정보" 수업에서 **"파이썬으로 반복문 배우기"** 챕터를 작성해주세요.\n\n조건:\n- 대상: 스크래치만 해본 중학생 (텍스트 코딩 처음)\n- 도입: 스크래치의 "~번 반복하기" 블록과 파이썬 for문 대응 비교\n- for문: range() 함수를 "몇 번 반복할지 정하는 기계"로 설명\n- while문: "~할 때까지 계속"의 개념으로 도입, 무한루프 주의사항\n- 단계별 예제 5개:\n  ① 별(*) 찍기 (1~10개)\n  ② 구구단 한 단 출력\n  ③ 1부터 N까지 합 구하기\n  ④ 리스트의 최댓값 찾기\n  ⑤ 숫자 맞추기 게임 (while문)\n- 각 예제에 "코드 따라하기 → 변형 과제" 구조\n- 흔한 실수 TOP 3 (들여쓰기, 콜론 누락, 무한루프)과 해결법\n- 평가: 코드 트레이싱 2문항 + 코딩 과제 1문항' },
      { name: 'AI 코딩 실습', prompt: '고등학교 "인공지능 기초" 과목의 **"나만의 이미지 분류기 만들기"** 실습 가이드를 작성해주세요.\n\n조건:\n- 도구: Google Teachable Machine + Python (선택)\n- 프로젝트: "교실에서 분리수거 도우미" (캔/페트병/종이 분류)\n- Step 1: Teachable Machine으로 3가지 클래스 학습 데이터 수집 (웹캠 활용)\n- Step 2: 모델 학습 및 테스트, 정확도 확인\n- Step 3: 오분류 사례 분석 → 데이터 보강 → 재학습\n- Step 4: (심화) Python으로 학습된 모델 불러와서 실시간 분류\n- 각 단계에 스크린샷 위치 표시: [스크린샷: ~]\n- 토론 주제: "AI가 실수하면 누구 책임인가?" (AI 윤리 연계)\n- 루브릭: 데이터 품질(30%) + 모델 성능(30%) + 개선 과정(20%) + 발표(20%)' },
    ],
  },
  {
    category: '교육과정·평가',
    color: 'bg-amber-50 text-amber-700',
    presets: [
      { name: '정보 교과 목차', prompt: '"고등학교 인공지능 기초" 교과서 목차를 6개 단원으로 구성해주세요.\n\n조건:\n- 2022 개정 교육과정 "인공지능 기초" 성취기준 반영\n- 각 단원: 대주제 + 소주제 3~4개 + 핵심 성취기준 코드\n- 단원 구성:\n  ① AI의 이해 (역사, 분류, 사회적 영향)\n  ② 데이터와 AI (수집, 전처리, 특성 공학)\n  ③ 기계학습 (지도/비지도/강화학습)\n  ④ 딥러닝 기초 (신경망, CNN, 자연어처리)\n  ⑤ AI 프로젝트 (기획→개발→평가)\n  ⑥ AI와 사회 (윤리, 편향, 미래 직업)\n- 각 소주제에 권장 차시(시수), 핵심 활동, 평가 방법 명시\n- 단원 간 선수학습 관계를 화살표 다이어그램으로 표현\n- 교과역량(컴퓨팅 사고력, AI 리터러시, 디지털 윤리) 매핑표 포함' },
      { name: 'AI 윤리 평가문항', prompt: '고등학교 "인공지능 기초" 과목의 **"AI 윤리와 사회적 영향"** 단원 평가문항 세트를 설계해주세요.\n\n성취기준: "인공지능 기술의 사회적 영향을 분석하고, 윤리적 딜레마 상황에서 합리적으로 판단할 수 있다"\n\n포함할 문항:\n1. 선택형 3문항 (AI 편향, 개인정보, 저작권 관련 4지선다)\n2. 서술형 2문항:\n   - "AI 면접 시스템이 특정 성별에 불리한 결과를 내는 경우 어떻게 해결할 수 있을까?" (채점 기준표 포함)\n   - "생성형 AI로 만든 과제물 제출의 윤리적 문제를 논하시오" (채점 기준표 포함)\n3. 수행평가 1문항: "AI 윤리 가이드라인 제안서" 모둠 프로젝트 (루브릭 포함)\n\n각 문항에 평가 요소, 정답/예시 답안, 오답 유인 분석을 포함해주세요.' },
    ],
  },
  {
    category: '수준별 설명력',
    color: 'bg-rose-50 text-rose-700',
    presets: [
      { name: '개념 수준 조절', prompt: '**"신경망(Neural Network)의 작동 원리"**를 다음 3가지 수준으로 각각 설명해주세요:\n\n1. **초등학생** (비유만 사용, 수식 없이, 200자 내외)\n   - "뇌의 신경세포가 서로 연결되어 있는 것처럼..."으로 시작\n2. **중학생** (간단한 수식, 실생활 예시, 400자 내외)\n   - 가중치, 활성화 함수를 비유로 설명\n   - 손글씨 숫자 인식 예시 활용\n3. **고등학생** (수학적 표현 포함, 600자 내외)\n   - 퍼셉트론 수식, 역전파 개념, 학습률\n   - 간단한 XOR 문제로 다층 신경망 필요성 설명\n\n각 수준에서 도입 질문 1개, 핵심 설명, 확인 퀴즈 1개를 포함하세요.\n한국어가 자연스럽고 각 수준에 맞는 어휘와 톤을 사용하세요.' },
      { name: '오개념 교정', prompt: '학생들이 AI·정보 분야에서 자주 가지는 **오개념 5가지**를 교정하는 교육자료를 작성해주세요.\n\n다룰 오개념:\n1. "AI는 스스로 생각한다" → 실제: 패턴 매칭과 통계적 추론\n2. "데이터가 많으면 무조건 좋다" → 실제: 데이터 품질과 편향 문제\n3. "코딩은 암기다" → 실제: 문제 해결 과정이 핵심\n4. "AI가 인간의 일자리를 모두 대체한다" → 실제: 협업과 새로운 직업\n5. "알고리즘은 항상 공정하다" → 실제: 설계자의 가치관과 데이터 편향 반영\n\n각 오개념에 대해:\n- 학생이 왜 이렇게 생각하는지 원인 분석\n- 올바른 개념을 비유와 구체적 사례로 설명\n- 스스로 확인할 수 있는 질문 1개\n- 수업에서 활용할 수 있는 토론 주제 1개' },
    ],
  },
];

const ALL_PRESETS = PRESET_CATEGORIES.flatMap((cat) => cat.presets.map((p) => ({ ...p, category: cat.category })));
const SCORE_KEYS = [
  { key: 'accuracy', label: '정확성' },
  { key: 'structure', label: '구조화' },
  { key: 'educational', label: '교육적 가치' },
  { key: 'korean', label: '한국어' },
  { key: 'creativity', label: '창의성' },
];

const LABELS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T'];
const LABEL_COLORS = [
  'bg-rose-100 text-rose-700 border-rose-300',
  'bg-sky-100 text-sky-700 border-sky-300',
  'bg-amber-100 text-amber-700 border-amber-300',
  'bg-emerald-100 text-emerald-700 border-emerald-300',
  'bg-violet-100 text-violet-700 border-violet-300',
];
const RANK_STYLES = [
  { bg: 'bg-amber-400', text: 'text-white', border: 'border-amber-400', ring: 'ring-amber-300' },
  { bg: 'bg-gray-400', text: 'text-white', border: 'border-gray-400', ring: 'ring-gray-300' },
  { bg: 'bg-orange-600', text: 'text-white', border: 'border-orange-600', ring: 'ring-orange-300' },
  { bg: 'bg-sky-500', text: 'text-white', border: 'border-sky-500', ring: 'ring-sky-300' },
  { bg: 'bg-indigo-500', text: 'text-white', border: 'border-indigo-500', ring: 'ring-indigo-300' },
];
const PROVIDER_BADGES = {
  anthropic: 'bg-orange-100 text-orange-800',
  openai: 'bg-green-100 text-green-800',
  google: 'bg-blue-100 text-blue-800',
  upstage: 'bg-purple-100 text-purple-800',
};

const TOP_N = 5;
const TOTAL_ROUNDS = 3;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ModelCompare() {
  const [allModels, setAllModels] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('blind');
  const [selectedModelIds, setSelectedModelIds] = useState([]);

  // idle | prelim | prelim-rank | finals-prompt | finals | finals-rank | done
  // auto: idle | auto-running | auto-evaluating | auto-done | auto-summary
  const [phase, setPhase] = useState('idle');
  const [round, setRound] = useState(0);
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [shuffledOrder, setShuffledOrder] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [top5, setTop5] = useState([]);
  const [roundScores, setRoundScores] = useState({});
  const [roundHistory, setRoundHistory] = useState([]);
  const [roundPrompts, setRoundPrompts] = useState([]);
  const abortRef = useRef(null);

  // AI 자동 평가 상태
  const [autoEvalResult, setAutoEvalResult] = useState(null);
  const [autoEvalText, setAutoEvalText] = useState('');
  const [autoJudgeModel, setAutoJudgeModel] = useState('claude-sonnet-4-6');
  const [autoHistory, setAutoHistory] = useState([]);
  const [batchQueue, setBatchQueue] = useState([]);
  const [batchIndex, setBatchIndex] = useState(-1);
  const batchAbortRef = useRef(false);
  const printRef = useRef(null);

  const [serverProviders, setServerProviders] = useState({});
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/models').then(({ models }) => setAllModels(models)).catch((err) => console.error('모델 목록 로드 실패', err)),
      apiFetch('/api/auth/status').then((d) => setServerProviders(d.serverProviders || {})).catch((err) => console.error('인증 상태 로드 실패', err)),
    ]).finally(() => setModelsLoading(false));
  }, []);

  const availableModels = useMemo(() => {
    const keys = {
      anthropic: serverProviders.anthropic || !!getApiKey('anthropic'),
      openai: serverProviders.openai || !!getApiKey('openai'),
      google: serverProviders.google || !!getApiKey('google'),
      upstage: serverProviders.upstage || !!getApiKey('upstage'),
    };
    return allModels.filter((m) => keys[m.provider]);
  }, [allModels, serverProviders]);

  const blind = mode === 'blind';
  const modelsToRun = useMemo(() => {
    if (mode === 'blind') return availableModels;
    return availableModels.filter((m) => selectedModelIds.includes(m.id));
  }, [mode, availableModels, selectedModelIds]);

  const allDone = useMemo(() => {
    const vals = Object.values(results);
    return vals.length > 0 && vals.every((r) => r.status === 'done' || r.status === 'error');
  }, [results]);

  const validModels = useMemo(() => shuffledOrder.filter((id) => results[id]?.status !== 'error'), [shuffledOrder, results]);

  const getAuthHeaders = () => {
    const h = {};
    const k = { anthropic: localStorage.getItem('eduflow_api_key'), openai: localStorage.getItem('eduflow_openai_key'), google: localStorage.getItem('eduflow_google_key'), upstage: localStorage.getItem('eduflow_upstage_key') };
    if (k.anthropic) h['x-api-key'] = k.anthropic;
    if (k.openai) h['x-openai-key'] = k.openai;
    if (k.google) h['x-google-key'] = k.google;
    if (k.upstage) h['x-upstage-key'] = k.upstage;
    return h;
  };

  const runModels = useCallback(async (modelIds, activePrompt) => {
    const ordered = mode === 'blind' ? shuffle(modelIds) : modelIds;
    setShuffledOrder(ordered);
    setRunning(true);
    setRankings([]);
    const init = {};
    for (const m of ordered) init[m] = { text: '', status: 'waiting', elapsed: null, charCount: null };
    setResults(init);

    // 이전 요청이 남아 있으면 중단
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${API_BASE}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ models: ordered, prompt: activePrompt, systemPrompt: '교육 콘텐츠 전문가로서 명확하고 구조화된 답변을 해주세요.' }),
        signal: controller.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') break;
          try {
            const data = JSON.parse(raw);
            setResults((prev) => {
              const copy = { ...prev };
              const mid = data.modelId;
              if (!mid) return copy;
              if (data.type === 'start') copy[mid] = { ...copy[mid], status: 'streaming' };
              else if (data.type === 'text') copy[mid] = { ...copy[mid], text: (copy[mid]?.text || '') + data.content };
              else if (data.type === 'complete') copy[mid] = { ...copy[mid], status: 'done', elapsed: data.elapsed, charCount: data.charCount };
              else if (data.type === 'error') copy[mid] = { ...copy[mid], status: 'error', error: data.message };
              return copy;
            });
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    } finally { setRunning(false); abortRef.current = null; }
  }, [mode]);

  useEffect(() => {
    if (allDone && !running) {
      if (phase === 'prelim') setPhase('prelim-rank');
      if (phase === 'finals') setPhase('finals-rank');
    }
  }, [allDone, running, phase]);

  const startTournament = () => {
    if (!prompt.trim() || modelsToRun.length < 2) return;
    setPhase('prelim');
    setRound(0); setTop5([]); setRoundScores({}); setRoundHistory([]); setRoundPrompts([]);
    runModels(modelsToRun.map((m) => m.id), prompt);
  };

  const handleRankToggle = (modelId) => {
    setRankings((prev) => {
      if (prev.includes(modelId)) return prev.slice(0, prev.indexOf(modelId));
      const max = phase === 'prelim-rank' ? Math.min(TOP_N, validModels.length) : validModels.length;
      if (prev.length >= max) return prev;
      return [...prev, modelId];
    });
  };

  const confirmTop5 = () => {
    const selected = rankings.slice(0, TOP_N);
    setTop5(selected);
    const init = {};
    for (const id of selected) init[id] = [];
    setRoundScores(init);
    setRoundHistory([]); setRoundPrompts([]);
    setPhase('finals-prompt'); setRound(1); setPrompt('');
  };

  const startFinalsRound = () => {
    if (!prompt.trim()) return;
    setRoundPrompts((prev) => [...prev, prompt]);
    setPhase('finals');
    runModels(top5, prompt);
  };

  const confirmFinalsRanking = () => {
    const n = validModels.length;
    setRoundScores((prev) => {
      const copy = { ...prev };
      rankings.forEach((id, i) => { if (!copy[id]) copy[id] = []; copy[id].push(n - i); });
      top5.forEach((id) => { if (!rankings.includes(id)) { if (!copy[id]) copy[id] = []; copy[id].push(0); } });
      return copy;
    });
    setRoundHistory((prev) => [...prev, { round, prompt: roundPrompts[round - 1] || prompt, rankings: rankings.map((id, i) => ({ modelId: id, rank: i + 1 })) }]);
    if (round < TOTAL_ROUNDS) { setRound((r) => r + 1); setPhase('finals-prompt'); setPrompt(''); }
    else setPhase('done');
  };

  const resetAll = () => {
    setPhase('idle'); setRound(0); setResults({}); setShuffledOrder([]);
    setRankings([]); setTop5([]); setRoundScores({}); setRoundHistory([]); setRoundPrompts([]); setPrompt('');
    setAutoEvalResult(null); setAutoEvalText('');
    setBatchQueue([]); setBatchIndex(-1); batchAbortRef.current = false;
  };

  // AI 자동 평가: 단일 프롬프트 실행
  const runSingleAutoEval = useCallback(async (evalPrompt, modelIds) => {
    setShuffledOrder(modelIds);
    setRunning(true);
    setAutoEvalResult(null);
    setAutoEvalText('');
    const init = {};
    for (const m of modelIds) init[m] = { text: '', status: 'waiting', elapsed: null, charCount: null };
    setResults(init);

    // 이전 요청이 남아 있으면 중단
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let evalResult = null;
    try {
      const res = await fetch(`${API_BASE}/api/compare/auto-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ models: modelIds, prompt: evalPrompt, judgeModel: autoJudgeModel }),
        signal: controller.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') break;
          try {
            const data = JSON.parse(raw);
            if (data.type === 'start' || data.type === 'text' || data.type === 'complete' || data.type === 'error') {
              setResults((prev) => {
                const copy = { ...prev };
                const mid = data.modelId;
                if (!mid) return copy;
                if (data.type === 'start') copy[mid] = { ...copy[mid], status: 'streaming' };
                else if (data.type === 'text') copy[mid] = { ...copy[mid], text: (copy[mid]?.text || '') + data.content };
                else if (data.type === 'complete') copy[mid] = { ...copy[mid], status: 'done', elapsed: data.elapsed, charCount: data.charCount };
                else if (data.type === 'error') copy[mid] = { ...copy[mid], status: 'error', error: data.message };
                return copy;
              });
            }
            if (data.type === 'phase' && data.phase === 'evaluating') setPhase('auto-evaluating');
            if (data.type === 'evaluate-text') setAutoEvalText((prev) => prev + data.content);
            if (data.type === 'evaluate-result') { evalResult = data.result; setAutoEvalResult(data.result); }
            if (data.type === 'evaluate-error') setAutoEvalText((prev) => prev + '\n[평가 오류: ' + data.message + ']');
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    } finally { setRunning(false); abortRef.current = null; }
    return evalResult;
  }, [autoJudgeModel]);

  // 개별 문제 평가
  const runAutoEvaluate = useCallback(async () => {
    if (!prompt.trim() || modelsToRun.length < 2) return;
    const modelIds = modelsToRun.map((m) => m.id);
    setPhase('auto-running');
    const presetMatch = ALL_PRESETS.find((p) => p.prompt === prompt);
    const result = await runSingleAutoEval(prompt, modelIds);
    if (result) {
      setAutoHistory((prev) => [...prev, { prompt, presetName: presetMatch?.name || '직접 입력', category: presetMatch?.category || '', result, timestamp: new Date().toISOString() }]);
    }
    setPhase('auto-done');
  }, [prompt, modelsToRun, runSingleAutoEval]);

  // 전체 문제 일괄 테스트
  const runBatchEvaluate = useCallback(async () => {
    if (modelsToRun.length < 2) return;
    const modelIds = modelsToRun.map((m) => m.id);
    batchAbortRef.current = false;
    setBatchQueue(ALL_PRESETS);
    for (let i = 0; i < ALL_PRESETS.length; i++) {
      if (batchAbortRef.current) break;
      const preset = ALL_PRESETS[i];
      setBatchIndex(i);
      setPhase('auto-running');
      setPrompt(preset.prompt);
      const result = await runSingleAutoEval(preset.prompt, modelIds);
      if (result) {
        setAutoHistory((prev) => [...prev, { prompt: preset.prompt, presetName: preset.name, category: preset.category, result, timestamp: new Date().toISOString() }]);
      }
      setPhase('auto-done');
    }
    setBatchIndex(-1); setBatchQueue([]);
    setPhase('auto-summary');
  }, [modelsToRun, runSingleAutoEval]);

  // 누적 결과 집계
  const aggregatedResults = useMemo(() => {
    if (autoHistory.length === 0) return [];
    const totals = {};
    for (const entry of autoHistory) {
      if (!entry.result?.evaluations) continue;
      for (const [modelId, scores] of Object.entries(entry.result.evaluations)) {
        if (!totals[modelId]) totals[modelId] = { total: 0, count: 0, details: {} };
        totals[modelId].total += scores.total || 0;
        totals[modelId].count += 1;
        for (const sk of SCORE_KEYS) {
          if (!totals[modelId].details[sk.key]) totals[modelId].details[sk.key] = 0;
          totals[modelId].details[sk.key] += scores[sk.key] || 0;
        }
      }
    }
    return Object.entries(totals)
      .map(([modelId, data]) => ({ modelId, ...data, avg: data.count ? (data.total / data.count).toFixed(1) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [autoHistory]);

  // PDF 저장
  const handlePrintPDF = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>AI 모델 비교 평가 결과</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; max-width: 900px; margin: 0 auto; }
        h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }
        .subtitle { text-align: center; color: #666; font-size: 13px; margin-bottom: 28px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: center; }
        th { background: #f5f5f5; font-weight: 600; }
        .rank-1 td { background: #fef3c7; font-weight: bold; }
        .section { margin: 20px 0; }
        .section h2 { font-size: 15px; border-bottom: 2px solid #333; padding-bottom: 4px; margin-bottom: 10px; }
        .detail { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin: 6px 0; font-size: 12px; }
        .detail-title { font-weight: 600; margin-bottom: 3px; }
        .detail-prompt { color: #888; font-size: 11px; margin-bottom: 5px; }
        .scores { display: flex; gap: 8px; flex-wrap: wrap; }
        .champion { color: #059669; }
        @media print { body { padding: 20px; } }
      </style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const toggleModelSelection = (id) => setSelectedModelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const getModelInfo = (id) => allModels.find((m) => m.id === id) || { display_name: id, tier: '', provider: '' };
  const getCardTitle = (modelId, idx) => blind ? `Model ${LABELS[idx] || `#${idx + 1}`}` : getModelInfo(modelId).display_name;
  const getLabelColor = (idx) => LABEL_COLORS[idx % LABEL_COLORS.length];
  const getRank = (modelId) => { const i = rankings.indexOf(modelId); return i === -1 ? null : i + 1; };

  const finalResults = useMemo(() => {
    if (phase !== 'done') return [];
    return top5.map((id) => ({ modelId: id, scores: roundScores[id] || [], total: (roundScores[id] || []).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  }, [phase, top5, roundScores]);

  const gridCols = shuffledOrder.length <= 2 ? 'grid-cols-1 md:grid-cols-2'
    : shuffledOrder.length <= 5 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  const canEditPrompt = phase === 'idle' || phase === 'finals-prompt';
  const isAutoMode = mode === 'auto';
  const modelsByProvider = useMemo(() => {
    const groups = {};
    for (const m of availableModels) { if (!groups[m.provider]) groups[m.provider] = []; groups[m.provider].push(m); }
    return groups;
  }, [availableModels]);
  const providerNames = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', upstage: 'Upstage' };
  const testedPresetNames = useMemo(() => new Set(autoHistory.map((h) => h.presetName)), [autoHistory]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI 모델 비교</h2>
          <p className="text-gray-500 mt-1">
            {mode === 'blind' ? '블라인드 토너먼트: 익명 비교 → Top 5 → 3회 결선'
              : mode === 'open' ? '공개 비교: 모델을 직접 선택하고 결과를 나란히 비교'
              : 'AI 자동 평가: 개별/전체 문제로 모델을 자동 채점하고 누적 결과를 PDF로 저장'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {phase !== 'idle' && (
            <>
              <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${isAutoMode ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
                {phase === 'prelim' || phase === 'prelim-rank' ? '예선'
                  : phase === 'done' ? '최종 결과'
                  : phase === 'auto-running' ? (batchQueue.length > 0 ? `일괄 ${batchIndex + 1}/${batchQueue.length}` : '모델 생성 중')
                  : phase === 'auto-evaluating' ? 'AI 평가 중'
                  : phase === 'auto-done' ? `평가 완료 (${autoHistory.length}건)`
                  : phase === 'auto-summary' ? '최종 결과'
                  : phase === 'finals-prompt' ? `결선 ${round}회 준비`
                  : `결선 ${round}/${TOTAL_ROUNDS}회`}
              </span>
              <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700">처음부터</button>
            </>
          )}
        </div>
      </div>

      {/* 모드 토글 */}
      {phase === 'idle' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          {modelsLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
              <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              모델 목록 로딩 중...
            </div>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-gray-700">비교 방식</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {[{ key: 'blind', label: '블라인드 (익명)' }, { key: 'open', label: '공개 (모델 선택)' }, { key: 'auto', label: 'AI 자동 평가' }].map(({ key, label }) => (
                <button key={key} onClick={() => setMode(key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${mode === key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{label}</button>
              ))}
            </div>
          </div>
          {mode !== 'blind' && (
            <div className="mt-4 space-y-3">
              {Object.entries(modelsByProvider).map(([provider, models]) => (
                <div key={provider}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PROVIDER_BADGES[provider] || 'bg-gray-100'}`}>{providerNames[provider] || provider}</span>
                    <button onClick={() => { const ids = models.map((m) => m.id); const all = ids.every((id) => selectedModelIds.includes(id)); setSelectedModelIds((prev) => all ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]); }}
                      className="text-[10px] text-gray-400 hover:text-gray-600">전체 {models.every((m) => selectedModelIds.includes(m.id)) ? '해제' : '선택'}</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {models.map((m) => { const checked = selectedModelIds.includes(m.id); return (
                      <label key={m.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-all ${checked ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleModelSelection(m.id)} className="sr-only" />
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                          {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        <span className="font-medium">{m.display_name}</span>
                        <span className="text-[10px] text-gray-400">{m.tier}</span>
                      </label>
                    ); })}
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-400">{selectedModelIds.length}개 선택됨 {selectedModelIds.length < 2 && '(최소 2개 선택)'}</p>
              {mode === 'auto' && (
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                  <span className="text-sm font-medium text-gray-600">심사위원 모델</span>
                  <select value={autoJudgeModel} onChange={(e) => setAutoJudgeModel(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
                    {allModels.map((m) => <option key={m.id} value={m.id}>{m.display_name} ({m.tier})</option>)}
                  </select>
                  <span className="text-xs text-gray-400">이 모델이 다른 모델들의 응답을 평가합니다</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 진행률 - 블라인드/공개 */}
      {phase !== 'idle' && !isAutoMode && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            {['예선', '1회', '2회', '3회', '결과'].map((label, i) => {
              const active = (i === 0 && (phase === 'prelim' || phase === 'prelim-rank')) || (i >= 1 && i <= 3 && ((phase === 'finals-prompt' || phase === 'finals' || phase === 'finals-rank') && round === i)) || (i === 4 && phase === 'done');
              const done = (i === 0 && phase !== 'prelim' && phase !== 'prelim-rank') || (i >= 1 && i <= 3 && (((phase === 'finals-prompt' || phase === 'finals' || phase === 'finals-rank') && round > i) || phase === 'done'));
              return (<div key={label} className="flex-1"><div className={`h-2 rounded-full ${done ? 'bg-indigo-500' : active ? 'bg-indigo-300 animate-pulse' : 'bg-gray-200'}`} /><p className={`text-xs mt-1 text-center ${active ? 'text-indigo-700 font-medium' : done ? 'text-indigo-500' : 'text-gray-400'}`}>{label}</p></div>);
            })}
          </div>
        </div>
      )}

      {/* AI 자동 평가 진행 상태 */}
      {isAutoMode && phase !== 'idle' && phase !== 'auto-summary' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            {['모델 생성', 'AI 평가', '결과'].map((label, i) => {
              const active = (i === 0 && phase === 'auto-running') || (i === 1 && phase === 'auto-evaluating') || (i === 2 && phase === 'auto-done');
              const done = (i === 0 && (phase === 'auto-evaluating' || phase === 'auto-done')) || (i === 1 && phase === 'auto-done');
              return (<div key={label} className="flex-1"><div className={`h-2 rounded-full ${done ? 'bg-emerald-500' : active ? 'bg-emerald-300 animate-pulse' : 'bg-gray-200'}`} /><p className={`text-xs mt-1 text-center ${active ? 'text-emerald-700 font-medium' : done ? 'text-emerald-500' : 'text-gray-400'}`}>{label}</p></div>);
            })}
          </div>
          {batchQueue.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>일괄 테스트: {batchIndex + 1} / {batchQueue.length}</span>
                <span>{batchQueue[batchIndex]?.name}</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${((batchIndex + 1) / batchQueue.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 프롬프트 */}
      {(phase === 'idle' || phase === 'finals-prompt' || phase === 'prelim' || phase === 'finals' || (isAutoMode && phase === 'auto-done')) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {phase === 'finals-prompt' ? `결선 ${round}회차 프롬프트`
                : isAutoMode && phase === 'auto-done' ? '다음 문제 선택 (또는 최종 결과 확인)'
                : '프롬프트'}
            </h3>
            {isAutoMode && autoHistory.length > 0 && phase !== 'auto-summary' && (
              <span className="text-xs text-emerald-600 font-medium">{autoHistory.length}건 완료</span>
            )}
          </div>
          <div className="space-y-2">
            {PRESET_CATEGORIES.map((cat) => (
              <div key={cat.category} className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${cat.color}`}>{cat.category}</span>
                {cat.presets.map((p) => {
                  const tested = testedPresetNames.has(p.name);
                  return (
                    <button key={p.name} onClick={() => setPrompt(p.prompt)} disabled={!canEditPrompt && phase !== 'auto-done'}
                      className={`px-3 py-1 rounded-full text-xs transition-colors disabled:opacity-40 ${
                        tested ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                        roundPrompts.includes(p.prompt) ? 'bg-gray-100 text-gray-400 line-through' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      }`}>{p.name} {tested && '(완료)'}</button>
                  );
                })}
              </div>
            ))}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} disabled={!canEditPrompt && phase !== 'auto-done'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
            placeholder={isAutoMode ? '개별 테스트할 프롬프트를 선택하거나 입력하세요...' : phase === 'finals-prompt' ? `${round}회차에 사용할 프롬프트를 입력하세요...` : '비교할 프롬프트를 입력하세요...'} />
          {(phase === 'idle' || (isAutoMode && phase === 'auto-done')) && (
            <div className="flex items-center gap-3 flex-wrap">
              {mode === 'auto' ? (
                <>
                  <button onClick={runAutoEvaluate} disabled={!prompt.trim() || modelsToRun.length < 2 || running}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-sm font-medium hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition-all">
                    개별 문제 테스트 ({modelsToRun.length}개 모델)
                  </button>
                  {phase === 'idle' && (
                    <button onClick={runBatchEvaluate} disabled={modelsToRun.length < 2 || running}
                      className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all">
                      전체 문제 일괄 테스트 ({ALL_PRESETS.length}개)
                    </button>
                  )}
                  {autoHistory.length > 0 && (
                    <button onClick={() => setPhase('auto-summary')}
                      className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-medium hover:from-amber-600 hover:to-orange-600 transition-all">
                      최종 결과 확인 ({autoHistory.length}건)
                    </button>
                  )}
                </>
              ) : (
                <button onClick={startTournament} disabled={!prompt.trim() || modelsToRun.length < 2}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all">
                  {blind ? `토너먼트 시작 (${modelsToRun.length}개 모델)` : `비교 시작 (${modelsToRun.length}개 모델)`}
                </button>
              )}
              {modelsToRun.length < 2 && <p className="text-xs text-orange-600">{mode === 'blind' ? '2개 이상 프로바이더의 API 키를 설정해주세요' : '2개 이상 모델을 선택해주세요'}</p>}
            </div>
          )}
          {phase === 'finals-prompt' && (
            <button onClick={startFinalsRound} disabled={!prompt.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-sm font-medium hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-all">
              {round}회차 시작
            </button>
          )}
        </div>
      )}

      {/* 중지 */}
      {running && (phase === 'prelim' || phase === 'finals' || phase === 'auto-running') && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-red-700 text-sm mb-2">생성이 너무 길면 중지하고 현재까지의 결과로 투표할 수 있습니다</p>
          <button onClick={() => {
            abortRef.current?.abort(); batchAbortRef.current = true; setRunning(false);
            setResults((prev) => { const copy = { ...prev }; for (const [id, r] of Object.entries(copy)) { if (r.status === 'streaming' || r.status === 'waiting') copy[id] = { ...r, status: r.text ? 'done' : 'error', error: r.text ? undefined : '중지됨' }; } return copy; });
            if (phase === 'prelim') setPhase('prelim-rank');
            if (phase === 'finals') setPhase('finals-rank');
            if (phase === 'auto-running') setPhase(autoHistory.length > 0 ? 'auto-summary' : 'auto-done');
          }} className="px-6 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
            {batchQueue.length > 0 ? '일괄 테스트 중지 → 결과 확인' : '중지 → 바로 투표'}
          </button>
        </div>
      )}

      {/* 예선 Top 5 */}
      {phase === 'prelim-rank' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
          <p className="text-indigo-800 font-medium">예선 완료! Top {Math.min(TOP_N, validModels.length)}개를 골라주세요</p>
          <p className="text-indigo-600 text-sm mt-1">{rankings.length}/{Math.min(TOP_N, validModels.length)} 선택</p>
          {rankings.length > 0 && <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">{rankings.map((mid) => { const idx = shuffledOrder.indexOf(mid); return <span key={mid} className={`text-sm font-medium px-2.5 py-1 rounded border ${getLabelColor(idx)}`}>{blind ? LABELS[idx] : getModelInfo(mid).display_name}</span>; })}</div>}
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={confirmTop5} disabled={rankings.length < Math.min(TOP_N, validModels.length)} className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-bold disabled:opacity-40 transition-all">
              {rankings.length < Math.min(TOP_N, validModels.length) ? `${Math.min(TOP_N, validModels.length) - rankings.length}개 더 선택` : 'Top 5 확정 → 결선!'}
            </button>
            {rankings.length > 0 && <button onClick={() => setRankings([])} className="text-sm text-gray-500 hover:text-gray-700">초기화</button>}
          </div>
        </div>
      )}

      {/* 결선 순위 */}
      {phase === 'finals-rank' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-purple-800 font-medium">{round}회차 완료! 순위를 매겨주세요</p>
          <p className="text-purple-600 text-sm mt-1">클릭 순서 = 1등 → 2등 → ... ({rankings.length}/{validModels.length})</p>
          {rankings.length > 0 && <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">{rankings.map((mid, i) => { const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' }; const idx = shuffledOrder.indexOf(mid); return (<div key={mid} className="flex items-center gap-1"><span className={`w-6 h-6 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-xs font-bold`}>{i + 1}</span><span className={`text-sm font-medium px-2 py-0.5 rounded border ${getLabelColor(idx)}`}>{blind ? LABELS[idx] : getModelInfo(mid).display_name}</span>{i < rankings.length - 1 && <span className="text-gray-300 mx-1">{'>'}</span>}</div>); })}</div>}
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={confirmFinalsRanking} disabled={rankings.length < validModels.length} className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-bold disabled:opacity-40 transition-all">
              {rankings.length < validModels.length ? `${validModels.length - rankings.length}개 남음` : round < TOTAL_ROUNDS ? `확정 → ${round + 1}회차` : '확정 → 최종 결과!'}
            </button>
            {rankings.length > 0 && <button onClick={() => setRankings([])} className="text-sm text-gray-500 hover:text-gray-700">초기화</button>}
          </div>
        </div>
      )}

      {/* 블라인드/공개 최종 결과 */}
      {phase === 'done' && (
        <div className="bg-white rounded-xl border-2 border-amber-300 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">최종 결과 (3회 합산)</h3>
          <div className="space-y-3 mb-6">
            {finalResults.map((item, i) => { const info = getModelInfo(item.modelId); const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' }; return (
              <div key={item.modelId} className={`flex items-center gap-4 p-3 rounded-xl ${i === 0 ? 'bg-amber-50 border-2 border-amber-300' : 'bg-gray-50'}`}>
                <span className={`w-10 h-10 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-lg font-bold shrink-0`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><span className={`text-sm font-medium px-2 py-0.5 rounded-full ${PROVIDER_BADGES[info.provider] || 'bg-gray-100'}`}>{info.display_name}</span><span className="text-xs text-gray-400">{info.tier}</span>{i === 0 && <span className="text-amber-500 font-bold">CHAMPION</span>}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">{item.scores.map((s, ri) => <span key={ri}>{ri + 1}회: {s}점</span>)}</div>
                </div>
                <div className="text-right shrink-0"><p className="text-xl font-bold text-gray-900">{item.total}점</p><p className="text-xs text-gray-400">/ {TOTAL_ROUNDS * top5.length}점</p></div>
              </div>
            ); })}
          </div>
          <div className="text-center mt-4"><button onClick={resetAll} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">새 비교</button></div>
        </div>
      )}

      {/* AI 자동 평가: 개별 결과 */}
      {phase === 'auto-done' && autoEvalResult && (
        <div className="bg-white rounded-xl border-2 border-emerald-300 p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-3">이번 테스트 결과</h3>
          <div className="space-y-2">
            {autoEvalResult.ranking?.map((modelId, i) => {
              const info = getModelInfo(modelId);
              const scores = autoEvalResult.evaluations?.[modelId];
              const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' };
              return (
                <div key={modelId} className={`flex items-center gap-3 p-3 rounded-lg ${i === 0 ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                  <span className={`w-8 h-8 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-sm font-bold shrink-0`}>{i + 1}</span>
                  <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${PROVIDER_BADGES[info.provider] || 'bg-gray-100'}`}>{info.display_name}</span>
                  {scores && <div className="flex items-center gap-2 flex-1 flex-wrap">{SCORE_KEYS.map(({ key, label }) => <span key={key} className="text-[10px] text-gray-500">{label}: <b className={scores[key] >= 8 ? 'text-emerald-600' : ''}>{scores[key]}</b></span>)}</div>}
                  {scores && <span className="text-lg font-bold text-gray-900 shrink-0">{scores.total}</span>}
                </div>
              );
            })}
          </div>
          {autoEvalResult.summary && <p className="text-xs text-gray-500 mt-2">{autoEvalResult.summary}</p>}
        </div>
      )}

      {/* AI 자동 평가: 최종 누적 결과 */}
      {phase === 'auto-summary' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border-2 border-amber-300 p-6">
            <div ref={printRef}>
              <h1 style={{ textAlign: 'center', fontSize: '22px', marginBottom: '4px' }}>AI 모델 비교 평가 보고서</h1>
              <p style={{ textAlign: 'center', color: '#666', fontSize: '13px', marginBottom: '24px' }}>
                심사위원: {getModelInfo(autoJudgeModel).display_name} | 테스트: {autoHistory.length}건 | {new Date().toLocaleDateString('ko-KR')}
              </p>

              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '15px', borderBottom: '2px solid #333', paddingBottom: '4px', marginBottom: '10px' }}>종합 순위</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ border: '1px solid #ddd', padding: '6px', background: '#f5f5f5' }}>순위</th>
                      <th style={{ border: '1px solid #ddd', padding: '6px', background: '#f5f5f5' }}>모델</th>
                      {SCORE_KEYS.map((sk) => <th key={sk.key} style={{ border: '1px solid #ddd', padding: '6px', background: '#f5f5f5' }}>{sk.label}</th>)}
                      <th style={{ border: '1px solid #ddd', padding: '6px', background: '#f5f5f5' }}>합계</th>
                      <th style={{ border: '1px solid #ddd', padding: '6px', background: '#f5f5f5' }}>평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedResults.map((item, i) => {
                      const info = getModelInfo(item.modelId);
                      return (
                        <tr key={item.modelId} style={i === 0 ? { background: '#fef3c7', fontWeight: 'bold' } : {}}>
                          <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ border: '1px solid #ddd', padding: '6px' }}>{info.display_name} <span style={{ color: '#999', fontSize: '11px' }}>{info.tier}</span></td>
                          {SCORE_KEYS.map((sk) => <td key={sk.key} style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{item.details[sk.key]}</td>)}
                          <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{item.total}</td>
                          <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>{item.avg}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <h2 style={{ fontSize: '15px', borderBottom: '2px solid #333', paddingBottom: '4px', marginBottom: '10px' }}>문제별 상세</h2>
                {autoHistory.map((entry, hi) => (
                  <div key={hi} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px', marginBottom: '6px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>{hi + 1}. {entry.presetName} {entry.category && <span style={{ color: '#888', fontWeight: 'normal' }}>({entry.category})</span>}</div>
                    <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>{entry.prompt.slice(0, 120)}...</div>
                    {entry.result?.ranking?.map((modelId, ri) => {
                      const info = getModelInfo(modelId);
                      const scores = entry.result.evaluations?.[modelId];
                      return (
                        <div key={modelId} style={{ display: 'flex', gap: '8px', padding: '1px 0', color: ri === 0 ? '#059669' : 'inherit', fontWeight: ri === 0 ? 'bold' : 'normal' }}>
                          <span style={{ width: '18px' }}>{ri + 1}.</span>
                          <span style={{ width: '110px' }}>{info.display_name}</span>
                          {scores && SCORE_KEYS.map(({ key }) => <span key={key} style={{ width: '40px', textAlign: 'center' }}>{scores[key]}</span>)}
                          {scores && <span style={{ fontWeight: 'bold' }}>= {scores.total}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button onClick={handlePrintPDF} className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:from-red-600 hover:to-pink-600 transition-all">
              PDF로 저장
            </button>
            <button onClick={() => { setPhase('auto-done'); setAutoEvalResult(null); }} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">추가 테스트</button>
            <button onClick={() => { resetAll(); setAutoHistory([]); }} className="px-5 py-2.5 bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-600">전체 초기화</button>
          </div>
        </div>
      )}

      {/* AI 평가 중 */}
      {phase === 'auto-evaluating' && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-semibold text-emerald-700">{getModelInfo(autoJudgeModel).display_name}이(가) 평가 중...</h3>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 max-h-[200px] overflow-y-auto text-xs text-gray-500 font-mono whitespace-pre-wrap">{autoEvalText || '분석 중...'}</div>
        </div>
      )}

      {/* 카드 그리드 */}
      {shuffledOrder.length > 0 && phase !== 'done' && phase !== 'auto-summary' && phase !== 'finals-prompt' && (
        <div className={`grid gap-4 ${gridCols}`}>
          {shuffledOrder.map((modelId, idx) => {
            const r = results[modelId] || {};
            const rank = getRank(modelId);
            const canClick = (phase === 'prelim-rank' || phase === 'finals-rank') && r.status !== 'error';
            const rankStyle = rank ? (RANK_STYLES[rank - 1] || { bg: 'bg-gray-300', text: 'text-white', border: 'border-gray-400', ring: 'ring-gray-200' }) : null;
            const info = getModelInfo(modelId);
            return (
              <div key={modelId} onClick={() => canClick && handleRankToggle(modelId)}
                className={`bg-white rounded-xl border-2 flex flex-col overflow-hidden transition-all ${rank ? `${rankStyle.border} ring-2 ${rankStyle.ring} shadow-md` : 'border-gray-200'} ${canClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow-md' : ''}`}>
                <div className={`px-4 py-3 border-b bg-gray-50 flex items-center justify-between ${rank ? rankStyle.border : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    {rank ? <span className={`w-8 h-8 rounded-full ${rankStyle.bg} ${rankStyle.text} flex items-center justify-center text-sm font-bold`}>{rank}</span>
                      : <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border ${getLabelColor(idx)}`}>{blind ? LABELS[idx] : (info.display_name || '')[0]}</span>}
                    <div>
                      <span className="text-sm font-medium text-gray-700">{getCardTitle(modelId, idx)}</span>
                      {!blind && <span className="text-[10px] text-gray-400 ml-1">{info.tier}</span>}
                      {rank && <span className="text-xs text-gray-400 ml-1">({rank}등)</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.status === 'streaming' && <span className="inline-flex items-center gap-1 text-xs text-blue-600"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />생성 중</span>}
                    {r.status === 'done' && <p className="text-xs text-gray-500">{r.charCount?.toLocaleString()}자 / {r.elapsed}s</p>}
                    {r.status === 'error' && <span className="text-xs text-red-500">오류</span>}
                    {r.status === 'waiting' && <span className="text-xs text-gray-400">대기 중...</span>}
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-y-auto max-h-[400px] text-sm">
                  {r.status === 'error' ? <p className="text-red-500">{r.error}</p>
                    : r.text ? <div className="prose prose-sm max-w-none"><ReactMarkdown>{r.text}</ReactMarkdown></div>
                    : r.status === 'waiting' ? <div className="flex items-center justify-center h-20"><div className="w-6 h-6 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" /></div>
                    : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
