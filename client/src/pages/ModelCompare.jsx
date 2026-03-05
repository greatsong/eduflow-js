import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { apiFetch, API_BASE } from '../api/client';
import ReactMarkdown from 'react-markdown';

// 에듀플로 워크플로우별 + 템플릿별 정밀 평가 프리셋
const PRESET_CATEGORIES = [
  {
    category: '방향성 논의 (Step 1)',
    color: 'bg-blue-50 text-blue-700',
    presets: [
      { name: '교육 방향 설계', prompt: '고등학교 1학년 대상 "인공지능과 데이터" 선택 교과목의 교육자료를 만들려 합니다. 2022 개정 교육과정의 핵심역량(디지털 소양, 컴퓨팅 사고력)을 반영하면서, 학생들이 실생활 데이터를 활용해 AI를 체험할 수 있는 방향을 제안해주세요. 대상 학생 수준, 선수학습 요건, 학습 목표 3개, 차별화 포인트를 구체적으로 설명해주세요.' },
      { name: '교육 니즈 분석', prompt: '중소기업 신입사원 대상 "데이터 리터러시" 사내교육 프로그램을 기획합니다. 다음 조건을 반영해주세요:\n- 대상: 비전공자 (마케팅, 영업, 인사 직군)\n- 기간: 주 2시간 × 8주\n- 목표: 엑셀/스프레드시트 → 데이터 시각화 → AI 도구 활용까지\n- 제약: 코딩 경험 없음, 실무 적용 가능해야 함\n\n이 프로그램의 교육 방향, 단계별 학습 로드맵, 예상 난관과 해결책을 제안해주세요.' },
    ],
  },
  {
    category: '목차 구성 (Step 2)',
    color: 'bg-emerald-50 text-emerald-700',
    presets: [
      { name: '교과서 목차', prompt: '중학교 2학년 "정보" 교과서 목차를 8개 단원으로 구성해주세요.\n\n조건:\n- 2022 개정 교육과정 "정보" 성취기준 반영\n- 각 단원: 대주제 1개 + 소주제 3~4개\n- 각 소주제에 \'생각해보기 → 배울 내용 → 정리하기 → 평가하기\' 구조 명시\n- 난이도 점진적 상승 (컴퓨팅 사고력 → 알고리즘 → 간단한 코딩)\n- 단원 간 연결고리 설명\n\n목차를 계층적으로 정리하고, 각 단원의 핵심 학습 목표와 예상 차시(시수)를 함께 제시해주세요.' },
      { name: '실습형 목차', prompt: '"Python으로 배우는 데이터 분석" 프로그래밍 강의 목차를 12개 챕터로 구성해주세요.\n\n조건:\n- 대상: 프로그래밍 초보자 (비전공 대학생)\n- 각 챕터: 이론(20%) + 실습(60%) + 프로젝트(20%)\n- 실습 예제는 실제 공공데이터 활용 (인구, 날씨, 교통 등)\n- 챕터마다 \'체크포인트\' 학습 확인 문항 포함\n- 마지막 3챕터는 미니 프로젝트 (데이터 수집 → 분석 → 시각화 → 보고서)\n\n각 챕터에 필요한 라이브러리, 예상 학습 시간, 선수학습 챕터를 표로 정리해주세요.' },
    ],
  },
  {
    category: '챕터 집필 (Step 4)',
    color: 'bg-purple-50 text-purple-700',
    presets: [
      { name: '교과서 챕터', prompt: '중학교 2학년 정보 교과서의 "알고리즘과 프로그래밍" 단원 중 **"반복 구조 이해하기"** 소주제를 집필해주세요.\n\n작성 조건:\n- 분량: A4 3~4페이지 분량의 마크다운\n- 구조: 생각해보기(도입 질문) → 배울 내용(개념 설명) → 활동하기(실습) → 정리하기(요약) → 평가하기(문제)\n- 비유: 일상생활의 반복(양치질, 운동 루틴 등)에서 출발\n- 코드: 스크래치 블록 코딩과 파이썬 텍스트 코딩 병행\n- 시각 자료: [그림], [표], [순서도] 위치 표시\n- 평가: 기본 문제 3개 + 도전 문제 1개 (정답·해설 포함)\n- 어려운 용어에는 괄호로 쉬운 풀이 제공\n- 톤: 학생에게 말하듯 친근하게, \'~해볼까요?\', \'~이렇게 생각해봅시다\'' },
      { name: '워크숍 자료', prompt: '"ChatGPT를 활용한 업무 자동화" 3시간 워크숍 자료의 **2번째 세션: "프롬프트 엔지니어링 실전"** 부분을 작성해주세요.\n\n작성 조건:\n- 대상: 사무직 직장인 20명\n- 시간: 60분 (강의 20분 + 실습 30분 + 공유 10분)\n- 구조: 학습목표 → 핵심개념 → 시연 → 실습과제 → 팁 정리\n- 실습과제 3개: ①이메일 초안 작성 ②회의록 요약 ③보고서 데이터 분석\n- 각 실습에 \'나쁜 프롬프트 vs 좋은 프롬프트\' 비교 예시 포함\n- 실습 시 참가자가 따라할 수 있는 단계별 가이드\n- 강사 노트(진행 팁, 예상 질문과 답변) 별도 섹션으로 포함' },
    ],
  },
  {
    category: '피드백·개선 (Step 3)',
    color: 'bg-amber-50 text-amber-700',
    presets: [
      { name: '목차 피드백', prompt: '다음은 "초등학생을 위한 코딩 첫걸음" 교재 목차 초안입니다. 교육 전문가 관점에서 피드백해주세요.\n\n1장: 컴퓨터란 무엇인가\n2장: 스크래치 설치하기\n3장: 캐릭터 움직이기\n4장: 조건문 배우기\n5장: 반복문 배우기\n6장: 변수 이해하기\n7장: 나만의 게임 만들기\n8장: 인공지능 소개\n\n다음 관점에서 분석해주세요:\n1. 난이도 곡선이 적절한지 (초등 3~4학년 기준)\n2. 누락된 핵심 개념이 있는지\n3. 각 장의 연결성과 흐름\n4. 동기부여 요소가 충분한지\n5. 구체적인 개선안 (장 순서 변경, 추가, 삭제, 통합 제안)' },
      { name: '콘텐츠 품질 검수', prompt: '다음은 AI가 생성한 교육 콘텐츠입니다. 품질을 검수하고 개선점을 지적해주세요.\n\n---\n## 머신러닝이란?\n\n머신러닝은 기계가 학습하는 것입니다. 데이터를 넣으면 패턴을 찾아서 예측을 합니다. 지도학습, 비지도학습, 강화학습이 있습니다.\n\n### 지도학습\n정답이 있는 데이터로 학습합니다. 예를 들어 스팸 메일 분류가 있습니다.\n\n### 비지도학습\n정답이 없는 데이터에서 패턴을 찾습니다. 고객 세그먼테이션이 예시입니다.\n\n### 강화학습\n시행착오를 통해 학습합니다. 알파고가 대표적입니다.\n---\n\n다음 기준으로 평가하고, 개선된 버전을 작성해주세요:\n1. 교육적 구조화 (도입-전개-정리)\n2. 비유와 예시의 적절성 (대상: 고등학생)\n3. 학습자 참여 유도 요소\n4. 시각적 구성 (마크다운 활용)\n5. 평가/확인 문항 포함 여부' },
    ],
  },
  {
    category: '교수법·한국어 품질',
    color: 'bg-rose-50 text-rose-700',
    presets: [
      { name: '수준별 설명력', prompt: '**"확률과 통계에서의 베이즈 정리"**를 다음 3가지 수준으로 각각 설명해주세요:\n\n1. **초등학생 수준** (비유와 이야기로, 수식 없이, 200자 내외)\n2. **고등학생 수준** (기본 수식 포함, 실생활 예시, 400자 내외)\n3. **대학생 수준** (수학적 정의, 증명 스케치, 응용 분야, 600자 내외)\n\n각 수준에서:\n- 도입 질문 1개\n- 핵심 설명\n- 확인 퀴즈 1개\n를 포함해주세요. 한국어가 자연스럽고, 각 수준에 맞는 어휘와 톤을 사용하세요.' },
      { name: '평가문항 설계', prompt: '"생태계와 환경" 단원(중학교 과학)의 성취기준 "[9과15-01] 생태계 구성 요소와 환경 요인이 생물에 미치는 영향을 설명할 수 있다"에 대한 평가문항 세트를 설계해주세요.\n\n포함할 문항 유형:\n1. 선택형 4문항 (4지선다, 정답률 70% 목표)\n2. 서술형 2문항 (채점 기준표 포함, 배점 각 5점)\n3. 수행평가 1문항 (모둠 활동, 루브릭 포함)\n\n각 문항에는:\n- 평가 요소 (지식/기능/태도)\n- 정답 및 해설\n- 오답 유인 분석 (선택형의 경우)\n- 예시 답안 (서술형의 경우)\n를 포함해주세요.' },
    ],
  },
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
  // 'blind' | 'open' | 'auto'
  const [mode, setMode] = useState('blind');
  const [selectedModelIds, setSelectedModelIds] = useState([]);

  // idle | prelim | prelim-rank | finals-prompt | finals | finals-rank | done
  // auto 모드: idle | auto-running | auto-evaluating | auto-done
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

  useEffect(() => {
    apiFetch('/api/models').then(({ models }) => setAllModels(models)).catch(() => {});
  }, []);

  const availableModels = useMemo(() => {
    const keys = {
      anthropic: !!localStorage.getItem('eduflow_api_key'),
      openai: !!localStorage.getItem('eduflow_openai_key'),
      google: !!localStorage.getItem('eduflow_google_key'),
      upstage: !!localStorage.getItem('eduflow_upstage_key'),
    };
    return allModels.filter((m) => keys[m.provider]);
  }, [allModels]);

  const blind = mode === 'blind';

  // 공개/자동 모드: 체크된 모델들
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
    setRoundHistory([]);
    setRoundPrompts([]);
    setPhase('finals-prompt');
    setRound(1);
    setPrompt('');
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

    if (round < TOTAL_ROUNDS) {
      setRound((r) => r + 1);
      setPhase('finals-prompt');
      setPrompt('');
    } else {
      setPhase('done');
    }
  };

  const resetAll = () => {
    setPhase('idle'); setRound(0); setResults({}); setShuffledOrder([]);
    setRankings([]); setTop5([]); setRoundScores({}); setRoundHistory([]); setRoundPrompts([]); setPrompt('');
    setAutoEvalResult(null); setAutoEvalText('');
  };

  // AI 자동 평가 실행
  const runAutoEvaluate = useCallback(async () => {
    if (!prompt.trim() || modelsToRun.length < 2) return;
    const modelIds = modelsToRun.map((m) => m.id);
    setShuffledOrder(modelIds);
    setRunning(true);
    setPhase('auto-running');
    setAutoEvalResult(null);
    setAutoEvalText('');
    const init = {};
    for (const m of modelIds) init[m] = { text: '', status: 'waiting', elapsed: null, charCount: null };
    setResults(init);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${API_BASE}/api/compare/auto-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ models: modelIds, prompt: prompt, judgeModel: autoJudgeModel }),
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
            if (data.type === 'phase' && data.phase === 'evaluating') {
              setPhase('auto-evaluating');
            }
            if (data.type === 'evaluate-text') {
              setAutoEvalText((prev) => prev + data.content);
            }
            if (data.type === 'evaluate-result') {
              setAutoEvalResult(data.result);
              setPhase('auto-done');
            }
            if (data.type === 'evaluate-error') {
              setAutoEvalText((prev) => prev + '\n[평가 오류: ' + data.message + ']');
              setPhase('auto-done');
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    } finally { setRunning(false); abortRef.current = null; }
  }, [prompt, modelsToRun, autoJudgeModel]);

  const toggleModelSelection = (id) => {
    setSelectedModelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const getModelInfo = (id) => allModels.find((m) => m.id === id) || { display_name: id, tier: '', provider: '' };
  const getCardTitle = (modelId, idx) => {
    if (blind) return `Model ${LABELS[idx] || `#${idx + 1}`}`;
    const info = getModelInfo(modelId);
    return info.display_name;
  };
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

  // 프로바이더별 그룹핑 (공개 모드 체크박스용)
  const modelsByProvider = useMemo(() => {
    const groups = {};
    for (const m of availableModels) {
      if (!groups[m.provider]) groups[m.provider] = [];
      groups[m.provider].push(m);
    }
    return groups;
  }, [availableModels]);

  const providerNames = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', upstage: 'Upstage' };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI 모델 비교</h2>
          <p className="text-gray-500 mt-1">
            {mode === 'blind' ? '블라인드 토너먼트: 익명 비교 → Top 5 → 3회 결선'
              : mode === 'open' ? '공개 비교: 모델을 직접 선택하고 결과를 나란히 비교'
              : 'AI 자동 평가: 선택한 모델들의 응답을 AI가 자동으로 채점하고 순위를 매깁니다'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {phase !== 'idle' && (
            <>
              <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${isAutoMode ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
                {phase === 'prelim' || phase === 'prelim-rank' ? '예선'
                  : phase === 'done' ? '최종 결과'
                  : phase === 'auto-running' ? '모델 생성 중'
                  : phase === 'auto-evaluating' ? 'AI 평가 중'
                  : phase === 'auto-done' ? 'AI 평가 완료'
                  : phase === 'finals-prompt' ? `결선 ${round}회 준비`
                  : `결선 ${round}/${TOTAL_ROUNDS}회`}
              </span>
              <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700">처음부터</button>
            </>
          )}
        </div>
      </div>

      {/* 모드 토글 — idle 상태에서만 변경 가능 */}
      {phase === 'idle' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-gray-700">비교 방식</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {[
                { key: 'blind', label: '블라인드 (익명)' },
                { key: 'open', label: '공개 (모델 선택)' },
                { key: 'auto', label: 'AI 자동 평가' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setMode(key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${mode === key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 공개/자동 모드: 모델 체크박스 */}
          {mode !== 'blind' && (
            <div className="mt-4 space-y-3">
              {Object.entries(modelsByProvider).map(([provider, models]) => (
                <div key={provider}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PROVIDER_BADGES[provider] || 'bg-gray-100'}`}>
                      {providerNames[provider] || provider}
                    </span>
                    <button onClick={() => {
                      const allIds = models.map((m) => m.id);
                      const allSelected = allIds.every((id) => selectedModelIds.includes(id));
                      setSelectedModelIds((prev) => allSelected ? prev.filter((id) => !allIds.includes(id)) : [...new Set([...prev, ...allIds])]);
                    }} className="text-[10px] text-gray-400 hover:text-gray-600">
                      전체 {models.every((m) => selectedModelIds.includes(m.id)) ? '해제' : '선택'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {models.map((m) => {
                      const checked = selectedModelIds.includes(m.id);
                      return (
                        <label key={m.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-all ${
                          checked ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleModelSelection(m.id)} className="sr-only" />
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                            checked ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'
                          }`}>
                            {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </span>
                          <span className="font-medium">{m.display_name}</span>
                          <span className="text-[10px] text-gray-400">{m.tier}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-400">{selectedModelIds.length}개 선택됨 {selectedModelIds.length < 2 && '(최소 2개 선택)'}</p>
              {mode === 'auto' && (
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                  <span className="text-sm font-medium text-gray-600">심사위원 모델</span>
                  <select value={autoJudgeModel} onChange={(e) => setAutoJudgeModel(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
                    {allModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.display_name} ({m.tier})</option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400">이 모델이 다른 모델들의 응답을 평가합니다</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 진행률 — 블라인드/공개 모드에서만 */}
      {phase !== 'idle' && !isAutoMode && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            {['예선', '1회', '2회', '3회', '결과'].map((label, i) => {
              const active = (i === 0 && (phase === 'prelim' || phase === 'prelim-rank'))
                || (i >= 1 && i <= 3 && ((phase === 'finals-prompt' || phase === 'finals' || phase === 'finals-rank') && round === i))
                || (i === 4 && phase === 'done');
              const done = (i === 0 && phase !== 'prelim' && phase !== 'prelim-rank')
                || (i >= 1 && i <= 3 && (((phase === 'finals-prompt' || phase === 'finals' || phase === 'finals-rank') && round > i) || phase === 'done'));
              return (
                <div key={label} className="flex-1">
                  <div className={`h-2 rounded-full ${done ? 'bg-indigo-500' : active ? 'bg-indigo-300 animate-pulse' : 'bg-gray-200'}`} />
                  <p className={`text-xs mt-1 text-center ${active ? 'text-indigo-700 font-medium' : done ? 'text-indigo-500' : 'text-gray-400'}`}>{label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI 자동 평가 진행 상태 */}
      {isAutoMode && phase !== 'idle' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            {['모델 생성', 'AI 평가', '결과'].map((label, i) => {
              const active = (i === 0 && phase === 'auto-running')
                || (i === 1 && phase === 'auto-evaluating')
                || (i === 2 && phase === 'auto-done');
              const done = (i === 0 && (phase === 'auto-evaluating' || phase === 'auto-done'))
                || (i === 1 && phase === 'auto-done');
              return (
                <div key={label} className="flex-1">
                  <div className={`h-2 rounded-full ${done ? 'bg-emerald-500' : active ? 'bg-emerald-300 animate-pulse' : 'bg-gray-200'}`} />
                  <p className={`text-xs mt-1 text-center ${active ? 'text-emerald-700 font-medium' : done ? 'text-emerald-500' : 'text-gray-400'}`}>{label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 프롬프트 */}
      {(phase === 'idle' || phase === 'finals-prompt' || phase === 'prelim' || phase === 'finals') && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {phase === 'finals-prompt' ? `결선 ${round}회차 프롬프트` : '프롬프트'}
            </h3>
            {phase === 'finals-prompt' && roundPrompts.length > 0 && (
              <span className="text-xs text-gray-400">이전과 다른 프롬프트를 선택하면 더 공정합니다</span>
            )}
          </div>
          <div className="space-y-2">
            {PRESET_CATEGORIES.map((cat) => (
              <div key={cat.category} className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${cat.color}`}>{cat.category}</span>
                {cat.presets.map((p) => (
                  <button key={p.name} onClick={() => setPrompt(p.prompt)} disabled={!canEditPrompt}
                    className={`px-3 py-1 rounded-full text-xs transition-colors disabled:opacity-40 ${
                      roundPrompts.includes(p.prompt) ? 'bg-gray-100 text-gray-400 line-through' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}>{p.name}</button>
                ))}
              </div>
            ))}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} disabled={!canEditPrompt}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
            placeholder={phase === 'finals-prompt' ? `${round}회차에 사용할 프롬프트를 입력하세요...` : '비교할 프롬프트를 입력하세요...'} />
          {phase === 'idle' && (
            <div className="flex items-center gap-3">
              {mode === 'auto' ? (
                <button onClick={runAutoEvaluate} disabled={!prompt.trim() || modelsToRun.length < 2}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-sm font-medium hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition-all">
                  AI 자동 평가 시작 ({modelsToRun.length}개 모델)
                </button>
              ) : (
                <button onClick={startTournament} disabled={!prompt.trim() || modelsToRun.length < 2}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all">
                  {blind ? `토너먼트 시작 (${modelsToRun.length}개 모델)` : `비교 시작 (${modelsToRun.length}개 모델)`}
                </button>
              )}
              {modelsToRun.length < 2 && (
                <p className="text-xs text-orange-600">
                  {mode === 'blind' ? '2개 이상 프로바이더의 API 키를 설정해주세요' : '2개 이상 모델을 선택해주세요'}
                </p>
              )}
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

      {/* 중지 -> 바로 투표 */}
      {running && (phase === 'prelim' || phase === 'finals' || phase === 'auto-running') && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-red-700 text-sm mb-2">생성이 너무 길면 중지하고 현재까지의 결과로 투표할 수 있습니다</p>
          <button onClick={() => {
            abortRef.current?.abort();
            setRunning(false);
            setResults((prev) => {
              const copy = { ...prev };
              for (const [id, r] of Object.entries(copy)) {
                if (r.status === 'streaming' || r.status === 'waiting') {
                  copy[id] = { ...r, status: r.text ? 'done' : 'error', error: r.text ? undefined : '중지됨' };
                }
              }
              return copy;
            });
            if (phase === 'prelim') setPhase('prelim-rank');
            if (phase === 'finals') setPhase('finals-rank');
            if (phase === 'auto-running') setPhase('auto-done');
          }}
            className="px-6 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
            중지 → 바로 투표
          </button>
        </div>
      )}

      {/* 예선 Top 5 선택 */}
      {phase === 'prelim-rank' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
          <p className="text-indigo-800 font-medium">예선 완료! 느낌적으로 좋은 Top {Math.min(TOP_N, validModels.length)}개를 골라주세요</p>
          <p className="text-indigo-600 text-sm mt-1">{rankings.length}/{Math.min(TOP_N, validModels.length)} 선택</p>
          {rankings.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              {rankings.map((mid) => {
                const idx = shuffledOrder.indexOf(mid);
                return (
                  <span key={mid} className={`text-sm font-medium px-2.5 py-1 rounded border ${getLabelColor(idx)}`}>
                    {blind ? LABELS[idx] : getModelInfo(mid).display_name}
                  </span>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={confirmTop5} disabled={rankings.length < Math.min(TOP_N, validModels.length)}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-bold disabled:opacity-40 transition-all">
              {rankings.length < Math.min(TOP_N, validModels.length) ? `${Math.min(TOP_N, validModels.length) - rankings.length}개 더 선택` : 'Top 5 확정 → 결선 3회전!'}
            </button>
            {rankings.length > 0 && <button onClick={() => setRankings([])} className="text-sm text-gray-500 hover:text-gray-700">초기화</button>}
          </div>
        </div>
      )}

      {/* 결선 순위 */}
      {phase === 'finals-rank' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-purple-800 font-medium">{round}회차 완료! 순위를 매겨주세요 (느낌적으로)</p>
          <p className="text-purple-600 text-sm mt-1">클릭 순서 = 1등 → 2등 → ... ({rankings.length}/{validModels.length})</p>
          {rankings.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              {rankings.map((mid, i) => {
                const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' };
                const idx = shuffledOrder.indexOf(mid);
                return (
                  <div key={mid} className="flex items-center gap-1">
                    <span className={`w-6 h-6 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-xs font-bold`}>{i + 1}</span>
                    <span className={`text-sm font-medium px-2 py-0.5 rounded border ${getLabelColor(idx)}`}>
                      {blind ? LABELS[idx] : getModelInfo(mid).display_name}
                    </span>
                    {i < rankings.length - 1 && <span className="text-gray-300 mx-1">{'>'}</span>}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={confirmFinalsRanking} disabled={rankings.length < validModels.length}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-bold disabled:opacity-40 transition-all">
              {rankings.length < validModels.length ? `${validModels.length - rankings.length}개 남음` : round < TOTAL_ROUNDS ? `확정 → ${round + 1}회차 프롬프트 선택` : '확정 → 최종 결과!'}
            </button>
            {rankings.length > 0 && <button onClick={() => setRankings([])} className="text-sm text-gray-500 hover:text-gray-700">초기화</button>}
          </div>
        </div>
      )}

      {/* 최종 결과 */}
      {phase === 'done' && (
        <div className="bg-white rounded-xl border-2 border-amber-300 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">최종 결과 (3회 합산)</h3>
          <div className="space-y-3 mb-6">
            {finalResults.map((item, i) => {
              const info = getModelInfo(item.modelId);
              const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' };
              return (
                <div key={item.modelId} className={`flex items-center gap-4 p-3 rounded-xl ${i === 0 ? 'bg-amber-50 border-2 border-amber-300' : 'bg-gray-50'}`}>
                  <span className={`w-10 h-10 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-lg font-bold shrink-0`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${PROVIDER_BADGES[info.provider] || 'bg-gray-100'}`}>{info.display_name}</span>
                      <span className="text-xs text-gray-400">{info.tier}</span>
                      {i === 0 && <span className="text-amber-500 font-bold">CHAMPION</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {item.scores.map((s, ri) => <span key={ri}>{ri + 1}회: {s}점</span>)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-bold text-gray-900">{item.total}점</p>
                    <p className="text-xs text-gray-400">/ {TOTAL_ROUNDS * top5.length}점</p>
                  </div>
                  {info.pricing && <span className="text-xs text-gray-400 shrink-0">${info.pricing.input}/${info.pricing.output}</span>}
                </div>
              );
            })}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">회차별 상세</summary>
            <div className="mt-3 space-y-3">
              {roundHistory.map((rh) => (
                <div key={rh.round} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-600 mb-1">{rh.round}회차</p>
                  <p className="text-xs text-gray-400 mb-2 truncate" title={rh.prompt}>{rh.prompt}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {rh.rankings.map((r) => {
                      const info = getModelInfo(r.modelId);
                      const style = RANK_STYLES[r.rank - 1] || { bg: 'bg-gray-300', text: 'text-white' };
                      return (
                        <span key={r.modelId} className="flex items-center gap-1">
                          <span className={`w-5 h-5 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-[10px] font-bold`}>{r.rank}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${PROVIDER_BADGES[info.provider] || 'bg-gray-100'}`}>{info.display_name}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </details>
          <div className="text-center mt-4">
            <button onClick={resetAll} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">새 비교</button>
          </div>
        </div>
      )}

      {/* AI 자동 평가 결과 */}
      {phase === 'auto-done' && autoEvalResult && (
        <div className="bg-white rounded-xl border-2 border-emerald-300 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">AI 자동 평가 결과</h3>
          <p className="text-sm text-gray-500 text-center mb-4">심사위원: {getModelInfo(autoJudgeModel).display_name}</p>

          {/* 순위 */}
          {autoEvalResult.ranking?.length > 0 && (
            <div className="space-y-3 mb-6">
              {autoEvalResult.ranking.map((modelId, i) => {
                const info = getModelInfo(modelId);
                const scores = autoEvalResult.evaluations?.[modelId];
                const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' };
                return (
                  <div key={modelId} className={`flex items-center gap-4 p-4 rounded-xl ${i === 0 ? 'bg-emerald-50 border-2 border-emerald-300' : 'bg-gray-50'}`}>
                    <span className={`w-10 h-10 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-lg font-bold shrink-0`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${PROVIDER_BADGES[info.provider] || 'bg-gray-100'}`}>{info.display_name}</span>
                        <span className="text-xs text-gray-400">{info.tier}</span>
                        {i === 0 && <span className="text-emerald-600 font-bold">CHAMPION</span>}
                      </div>
                      {scores && (
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {[
                            { key: 'accuracy', label: '정확성' },
                            { key: 'structure', label: '구조화' },
                            { key: 'educational', label: '교육적 가치' },
                            { key: 'korean', label: '한국어' },
                            { key: 'creativity', label: '창의성' },
                          ].map(({ key, label }) => (
                            <div key={key} className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-400">{label}</span>
                              <span className={`text-xs font-bold ${scores[key] >= 8 ? 'text-emerald-600' : scores[key] >= 6 ? 'text-blue-600' : 'text-gray-600'}`}>{scores[key]}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {scores?.comment && <p className="text-xs text-gray-500 mt-1">{scores.comment}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {scores && <p className="text-xl font-bold text-gray-900">{scores.total}점</p>}
                      <p className="text-xs text-gray-400">/ 50점</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 종합 요약 */}
          {autoEvalResult.summary && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-gray-700 mb-1">종합 평가</p>
              <p className="text-sm text-gray-600">{autoEvalResult.summary}</p>
            </div>
          )}

          <div className="text-center">
            <button onClick={resetAll} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">새 비교</button>
          </div>
        </div>
      )}

      {/* AI 평가 중 텍스트 표시 */}
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
      {shuffledOrder.length > 0 && phase !== 'done' && phase !== 'auto-done' && phase !== 'finals-prompt' && (
        <div className={`grid gap-4 ${gridCols}`}>
          {shuffledOrder.map((modelId, idx) => {
            const r = results[modelId] || {};
            const rank = getRank(modelId);
            const canClick = (phase === 'prelim-rank' || phase === 'finals-rank') && r.status !== 'error';
            const rankStyle = rank ? (RANK_STYLES[rank - 1] || { bg: 'bg-gray-300', text: 'text-white', border: 'border-gray-400', ring: 'ring-gray-200' }) : null;
            const info = getModelInfo(modelId);

            return (
              <div key={modelId} onClick={() => canClick && handleRankToggle(modelId)}
                className={`bg-white rounded-xl border-2 flex flex-col overflow-hidden transition-all ${
                  rank ? `${rankStyle.border} ring-2 ${rankStyle.ring} shadow-md` : 'border-gray-200'
                } ${canClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow-md' : ''}`}>
                <div className={`px-4 py-3 border-b bg-gray-50 flex items-center justify-between ${rank ? rankStyle.border : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    {rank ? (
                      <span className={`w-8 h-8 rounded-full ${rankStyle.bg} ${rankStyle.text} flex items-center justify-center text-sm font-bold`}>{rank}</span>
                    ) : (
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border ${getLabelColor(idx)}`}>
                        {blind ? LABELS[idx] : (info.display_name || '')[0]}
                      </span>
                    )}
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        {getCardTitle(modelId, idx)}
                      </span>
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
