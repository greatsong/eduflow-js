import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { apiFetch, API_BASE } from '../api/client';
import ReactMarkdown from 'react-markdown';

const PRESETS = [
  { name: '교육자료 생성', prompt: '"인공지능의 역사와 발전" 주제로 고등학생 대상 교육자료 1페이지를 작성해주세요. 핵심 개념, 주요 사건 타임라인, 학습 활동을 포함해주세요.' },
  { name: '목차 구성', prompt: '"데이터 과학 입문" 교재의 목차를 10개 챕터로 구성해주세요. 각 챕터에 2-3개 소주제를 포함하세요.' },
  { name: '개념 설명', prompt: '중학생이 이해할 수 있도록 "머신러닝"이 무엇인지 비유와 예시를 들어 설명해주세요.' },
  { name: '퀴즈 생성', prompt: '"광합성" 주제로 선다형 5문제와 서술형 2문제를 만들어주세요. 정답과 해설도 포함하세요.' },
  { name: '한국어 품질', prompt: '다음 문장을 자연스러운 한국어로 다듬어주세요: "인공지능은 매우 빠른 속도로 발전하고 있는 기술인데 이것은 우리의 생활에 많은 영향을 끼치고 있습니다."' },
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

  // 모드: 'blind' | 'named' | 'judge'
  const [mode, setMode] = useState('blind');
  const [selectedModelIds, setSelectedModelIds] = useState([]);

  // idle | prelim | prelim-rank | finals-prompt | finals | finals-rank | done
  const [phase, setPhase] = useState('idle');
  const [round, setRound] = useState(0);
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [shuffledOrder, setShuffledOrder] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [worstPicks, setWorstPicks] = useState([]);
  const [selectionMode, setSelectionMode] = useState('best');
  const [top5, setTop5] = useState([]);
  const [roundScores, setRoundScores] = useState({});
  const [roundHistory, setRoundHistory] = useState([]);
  const [roundPrompts, setRoundPrompts] = useState([]);
  const [judgeResult, setJudgeResult] = useState(null);
  const [judging, setJudging] = useState(false);
  const abortRef = useRef(null);

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

  const modelsToRun = useMemo(() => {
    if (mode === 'blind') return availableModels;
    return availableModels.filter((m) => selectedModelIds.includes(m.id));
  }, [mode, availableModels, selectedModelIds]);

  const isBlind = mode === 'blind';

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
    const ordered = isBlind ? shuffle(modelIds) : modelIds;
    setShuffledOrder(ordered);
    setRunning(true);
    setRankings([]);
    setJudgeResult(null);
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
  }, [isBlind]);

  // AI 심사 호출
  const runJudge = useCallback(async (currentResults, currentOrder, activePrompt) => {
    setJudging(true);
    const outputs = currentOrder
      .filter((id) => currentResults[id]?.status === 'done' && currentResults[id]?.text)
      .map((id, idx) => ({ label: `응답 ${LABELS[idx]}`, modelId: id, text: currentResults[id].text }));

    if (outputs.length < 2) { setJudging(false); return; }

    try {
      const res = await fetch(`${API_BASE}/api/compare/judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ outputs: outputs.map(({ label, text }) => ({ label, text })), prompt: activePrompt }),
      });
      const data = await res.json();
      if (data.rankings) {
        const labelMap = {};
        outputs.forEach((o, i) => { labelMap[`응답 ${LABELS[i]}`] = o.modelId; });
        const mapped = data.rankings.map((r) => ({ ...r, modelId: labelMap[r.label] }));
        setJudgeResult({ rankings: mapped, summary: data.summary });
      }
    } catch (err) {
      console.error('Judge error:', err);
    } finally { setJudging(false); }
  }, []);

  useEffect(() => {
    if (allDone && !running) {
      if (phase === 'prelim') {
        if (mode === 'judge') runJudge(results, shuffledOrder, prompt);
        setPhase('prelim-rank');
      }
      if (phase === 'finals') {
        if (mode === 'judge') runJudge(results, shuffledOrder, roundPrompts[round - 1] || prompt);
        setPhase('finals-rank');
      }
    }
  }, [allDone, running, phase, mode, results, shuffledOrder, roundPrompts, round, prompt, runJudge]);

  const startTournament = () => {
    if (!prompt.trim() || modelsToRun.length < 2) return;
    setPhase('prelim');
    setRound(0); setTop5([]); setRoundScores({}); setRoundHistory([]); setRoundPrompts([]);
    setWorstPicks([]); setSelectionMode('best');
    runModels(modelsToRun.map((m) => m.id), prompt);
  };

  const handleRankToggle = (modelId) => {
    if (mode === 'judge') return; // AI 심사 모드에서는 수동 클릭 불가
    if (phase === 'prelim-rank') {
      if (selectionMode === 'best') {
        setRankings((prev) => {
          if (prev.includes(modelId)) return prev.filter((id) => id !== modelId);
          if (prev.length >= Math.min(TOP_N, validModels.length)) return prev;
          return [...prev, modelId];
        });
        setWorstPicks((prev) => prev.filter((id) => id !== modelId));
      } else {
        setWorstPicks((prev) => {
          if (prev.includes(modelId)) return prev.filter((id) => id !== modelId);
          if (prev.length >= TOP_N) return prev;
          return [...prev, modelId];
        });
        setRankings((prev) => prev.filter((id) => id !== modelId));
      }
      return;
    }
    // finals-rank
    setRankings((prev) => {
      if (prev.includes(modelId)) return prev.filter((id) => id !== modelId);
      if (prev.length >= validModels.length) return prev;
      return [...prev, modelId];
    });
  };

  // AI 심사 모드: judge 결과로 자동 Top 5 선정
  const autoConfirmTop5 = () => {
    if (!judgeResult) return;
    const sorted = [...judgeResult.rankings].sort((a, b) => a.rank - b.rank);
    const bestIds = sorted.slice(0, Math.min(TOP_N, sorted.length)).map((r) => r.modelId).filter(Boolean);
    const worstIds = sorted.length > TOP_N ? sorted.slice(TOP_N).map((r) => r.modelId).filter(Boolean) : [];
    setTop5(bestIds);
    setWorstPicks(worstIds);
    const init = {};
    for (const id of bestIds) init[id] = [];
    setRoundScores(init);
    setRoundHistory([]);
    setRoundPrompts([]);
    setPhase('finals-prompt');
    setRound(1);
    setPrompt('');
  };

  const confirmTop5 = () => {
    if (rankings.length < 2) return;
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
    const scoreList = mode === 'judge' && judgeResult ? judgeResult.rankings : null;

    setRoundScores((prev) => {
      const copy = { ...prev };
      if (scoreList) {
        scoreList.forEach((r) => {
          if (r.modelId && copy[r.modelId] !== undefined) {
            copy[r.modelId] = [...(copy[r.modelId] || []), r.score || (n - (r.rank - 1))];
          }
        });
        top5.forEach((id) => {
          if (!scoreList.find((r) => r.modelId === id)) copy[id] = [...(copy[id] || []), 0];
        });
      } else {
        rankings.forEach((id, i) => { if (!copy[id]) copy[id] = []; copy[id] = [...copy[id], n - i]; });
        top5.forEach((id) => { if (!rankings.includes(id)) { if (!copy[id]) copy[id] = []; copy[id] = [...copy[id], 0]; } });
      }
      return copy;
    });

    const roundRankings = scoreList
      ? [...scoreList].sort((a, b) => a.rank - b.rank).map((r, i) => ({ modelId: r.modelId, rank: i + 1 }))
      : rankings.map((id, i) => ({ modelId: id, rank: i + 1 }));
    setRoundHistory((prev) => [...prev, { round, prompt: roundPrompts[round - 1] || prompt, rankings: roundRankings }]);

    if (round < TOTAL_ROUNDS) {
      setRound((r) => r + 1);
      setPhase('finals-prompt');
      setPrompt('');
      setJudgeResult(null);
    } else {
      setPhase('done');
    }
  };

  const resetAll = () => {
    setPhase('idle'); setRound(0); setResults({}); setShuffledOrder([]);
    setRankings([]); setWorstPicks([]); setSelectionMode('best');
    setTop5([]); setRoundScores({}); setRoundHistory([]); setRoundPrompts([]); setPrompt('');
    setJudgeResult(null); setJudging(false);
  };

  const toggleModelSelection = (id) => {
    setSelectedModelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const getModelInfo = (id) => allModels.find((m) => m.id === id) || { display_name: id, tier: '', provider: '' };
  const getCardTitle = (modelId, idx) => {
    if (isBlind) return `Model ${LABELS[idx] || `#${idx + 1}`}`;
    return getModelInfo(modelId).display_name;
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

  const modelsByProvider = useMemo(() => {
    const groups = {};
    for (const m of availableModels) {
      if (!groups[m.provider]) groups[m.provider] = [];
      groups[m.provider].push(m);
    }
    return groups;
  }, [availableModels]);

  const providerNames = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', upstage: 'Upstage' };

  const modeColor = mode === 'blind' ? 'indigo' : mode === 'named' ? 'emerald' : 'purple';

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI 모델 비교</h2>
          <p className="text-gray-500 mt-1">
            {mode === 'blind' && '블라인드 토너먼트: 익명 비교 → Top 5 → 3회 결선'}
            {mode === 'named' && '공개 비교: 모델을 직접 선택하고 나란히 비교'}
            {mode === 'judge' && 'AI 심사: Claude Sonnet 4.6이 자동으로 평가'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {phase !== 'idle' && (
            <>
              <span className={`px-3 py-1.5 bg-${modeColor}-100 text-${modeColor}-800 rounded-lg text-sm font-medium`}>
                {mode === 'judge' && '🤖 '}
                {phase === 'prelim' || phase === 'prelim-rank' ? '예선'
                  : phase === 'done' ? '최종 결과'
                  : phase === 'finals-prompt' ? `결선 ${round}회 준비`
                  : `결선 ${round}/${TOTAL_ROUNDS}회`}
              </span>
              <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700">처음부터</button>
            </>
          )}
        </div>
      </div>

      {/* 모드 선택 — idle 상태에서만 */}
      {phase === 'idle' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">비교 방식</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {[
                { key: 'blind', label: '블라인드', icon: '🎭' },
                { key: 'named', label: '공개 비교', icon: '📋' },
                { key: 'judge', label: 'AI 심사', icon: '🤖' },
              ].map((m) => (
                <button key={m.key} onClick={() => setMode(m.key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    mode === m.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-gray-400">
            {mode === 'blind' && '모든 모델을 익명으로 비교 → 사용자가 직접 투표'}
            {mode === 'named' && '원하는 모델만 골라서 실명 비교 → 사용자가 직접 투표'}
            {mode === 'judge' && 'Claude Sonnet 4.6이 모든 모델의 응답을 자동 평가 (Anthropic API 키 필요)'}
          </div>

          {/* 모델 체크박스 (named/judge) */}
          {mode !== 'blind' && (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">비교할 모델 선택</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedModelIds(availableModels.map((m) => m.id))} className="text-xs text-blue-600 hover:text-blue-800">전체 선택</button>
                  <button onClick={() => setSelectedModelIds([])} className="text-xs text-gray-500 hover:text-gray-700">전체 해제</button>
                </div>
              </div>
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
            </div>
          )}
        </div>
      )}

      {/* 진행률 */}
      {phase !== 'idle' && (
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
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => setPrompt(p.prompt)} disabled={!canEditPrompt}
                className={`px-3 py-1 rounded-full text-xs transition-colors disabled:opacity-40 ${
                  roundPrompts.includes(p.prompt) ? 'bg-gray-100 text-gray-400 line-through' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}>{p.name}</button>
            ))}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} disabled={!canEditPrompt}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
            placeholder={phase === 'finals-prompt' ? `${round}회차에 사용할 프롬프트를 입력하세요...` : '비교할 프롬프트를 입력하세요...'} />
          {phase === 'idle' && (
            <div className="flex items-center gap-3">
              <button onClick={startTournament} disabled={!prompt.trim() || modelsToRun.length < 2}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all">
                {mode === 'blind' ? '🎭' : mode === 'named' ? '📋' : '🤖'} 토너먼트 시작 ({modelsToRun.length}개 모델)
              </button>
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

      {/* 중지 -> 바로 투표/심사 */}
      {running && (phase === 'prelim' || phase === 'finals') && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-red-700 text-sm mb-2">
            생성이 너무 길면 중지하고 현재까지의 결과로 {mode === 'judge' ? 'AI 심사를' : '투표를'} 진행할 수 있습니다
          </p>
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
          }}
            className="px-6 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
            중지 → {mode === 'judge' ? 'AI 심사' : '바로 투표'}
          </button>
        </div>
      )}

      {/* AI 심사 중 로딩 */}
      {judging && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-purple-400 border-t-purple-700 rounded-full animate-spin" />
            <span className="text-purple-700 font-medium">Claude Sonnet 4.6이 평가 중...</span>
          </div>
        </div>
      )}

      {/* 예선 Top 5 선택 (blind/named: 수동) */}
      {phase === 'prelim-rank' && mode !== 'judge' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center space-y-3">
          <p className="text-indigo-800 font-medium">예선 완료! 카드를 클릭해 Best / Worst를 골라주세요</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => setSelectionMode('best')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectionMode === 'best' ? 'bg-emerald-500 text-white shadow-md' : 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
              Best 선택 ({rankings.length}/{Math.min(TOP_N, validModels.length)})
            </button>
            <button onClick={() => setSelectionMode('worst')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectionMode === 'worst' ? 'bg-red-500 text-white shadow-md' : 'bg-white border border-red-300 text-red-700 hover:bg-red-50'}`}>
              Worst 선택 ({worstPicks.length}/{TOP_N})
            </button>
          </div>
          {(rankings.length > 0 || worstPicks.length > 0) && (
            <div className="space-y-2">
              {rankings.length > 0 && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-xs text-emerald-600 font-medium">Best:</span>
                  {rankings.map((mid) => {
                    const idx = shuffledOrder.indexOf(mid);
                    return (
                      <span key={mid} className={`text-sm font-medium px-2.5 py-1 rounded border ${isBlind ? getLabelColor(idx) : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
                        {getCardTitle(mid, idx)}
                      </span>
                    );
                  })}
                </div>
              )}
              {worstPicks.length > 0 && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-xs text-red-600 font-medium">Worst:</span>
                  {worstPicks.map((mid) => (
                    <span key={mid} className="text-sm font-medium px-2.5 py-1 rounded border bg-red-50 text-red-600 border-red-300 line-through">
                      {getCardTitle(mid, shuffledOrder.indexOf(mid))}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-center gap-2">
            <button onClick={confirmTop5} disabled={rankings.length < 2}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-bold disabled:opacity-40 transition-all">
              {rankings.length < 2 ? '2개 이상 Best를 선택해주세요' : `Top ${rankings.length} 확정 → 결선 3회전!`}
            </button>
            {(rankings.length > 0 || worstPicks.length > 0) && (
              <button onClick={() => { setRankings([]); setWorstPicks([]); }} className="text-sm text-gray-500 hover:text-gray-700">초기화</button>
            )}
          </div>
        </div>
      )}

      {/* 예선 결과 (judge: AI 심사) */}
      {phase === 'prelim-rank' && mode === 'judge' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <p className="text-purple-800 font-medium text-center">
            {judgeResult ? '🤖 AI 심사 완료!' : judging ? 'AI가 평가 중입니다...' : '평가 대기 중...'}
          </p>
          {judgeResult && (
            <>
              <div className="space-y-2 max-w-2xl mx-auto">
                {[...judgeResult.rankings].sort((a, b) => a.rank - b.rank).map((r, i) => {
                  const info = getModelInfo(r.modelId);
                  const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' };
                  return (
                    <div key={r.label} className="flex items-center gap-3 bg-white rounded-lg p-2.5 border">
                      <span className={`w-7 h-7 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-xs font-bold shrink-0`}>{r.rank}</span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${PROVIDER_BADGES[info.provider] || 'bg-gray-100'}`}>{info.display_name}</span>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{r.reasoning}</p>
                      </div>
                      <span className="text-lg font-bold text-gray-900 shrink-0">{r.score}점</span>
                    </div>
                  );
                })}
              </div>
              {judgeResult.summary && (
                <p className="text-sm text-gray-600 text-center italic">{judgeResult.summary}</p>
              )}
              <div className="text-center">
                <button onClick={autoConfirmTop5}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-bold transition-all">
                  Top {Math.min(TOP_N, judgeResult.rankings.length)} → 결선 3회전!
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 결선 순위 (blind/named: 수동) */}
      {phase === 'finals-rank' && mode !== 'judge' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-purple-800 font-medium">{round}회차 완료! 순위를 매겨주세요</p>
          <p className="text-purple-600 text-sm mt-1">클릭 순서 = 1등 → 2등 → ... ({rankings.length}/{validModels.length})</p>
          {rankings.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              {rankings.map((mid, i) => {
                const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' };
                const idx = shuffledOrder.indexOf(mid);
                return (
                  <div key={mid} className="flex items-center gap-1">
                    <span className={`w-6 h-6 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-xs font-bold`}>{i + 1}</span>
                    <span className={`text-sm font-medium px-2 py-0.5 rounded border ${isBlind ? getLabelColor(idx) : 'bg-white border-gray-300'}`}>
                      {getCardTitle(mid, idx)}
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

      {/* 결선 순위 (judge: AI 자동) */}
      {phase === 'finals-rank' && mode === 'judge' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <p className="text-purple-800 font-medium text-center">
            {judgeResult ? `🤖 ${round}회차 AI 심사 완료!` : judging ? 'AI가 평가 중...' : '평가 대기 중...'}
          </p>
          {judgeResult && (
            <>
              <div className="space-y-2 max-w-2xl mx-auto">
                {[...judgeResult.rankings].sort((a, b) => a.rank - b.rank).map((r, i) => {
                  const info = getModelInfo(r.modelId);
                  const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' };
                  return (
                    <div key={r.label} className="flex items-center gap-3 bg-white rounded-lg p-2.5 border">
                      <span className={`w-7 h-7 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-xs font-bold shrink-0`}>{r.rank}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${PROVIDER_BADGES[info.provider] || 'bg-gray-100'}`}>{info.display_name}</span>
                      <p className="text-xs text-gray-500 flex-1 truncate">{r.reasoning}</p>
                      <span className="text-lg font-bold text-gray-900 shrink-0">{r.score}점</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-center">
                <button onClick={confirmFinalsRanking}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-bold transition-all">
                  {round < TOTAL_ROUNDS ? `확정 → ${round + 1}회차` : '확정 → 최종 결과!'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 최종 결과 */}
      {phase === 'done' && (
        <div className="bg-white rounded-xl border-2 border-amber-300 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-1 text-center">최종 결과 (3회 합산)</h3>
          <p className="text-sm text-gray-500 text-center mb-4">
            {mode === 'blind' ? '🎭 블라인드' : mode === 'named' ? '📋 공개 비교' : '🤖 AI 심사'} 모드
          </p>
          <div className="space-y-3 mb-6">
            {finalResults.map((item, i) => {
              const info = getModelInfo(item.modelId);
              const style = RANK_STYLES[i] || { bg: 'bg-gray-300', text: 'text-white' };
              const maxTotal = mode === 'judge' ? TOTAL_ROUNDS * 100 : TOTAL_ROUNDS * top5.length;
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
                    <p className="text-xs text-gray-400">/ {maxTotal}점</p>
                  </div>
                  {info.pricing && <span className="text-xs text-gray-400 shrink-0">${info.pricing.input}/${info.pricing.output}</span>}
                </div>
              );
            })}
          </div>
          {worstPicks.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-red-700 mb-2">예선 탈락 (Worst)</h4>
              <div className="flex items-center gap-2 flex-wrap">
                {worstPicks.map((id) => {
                  const info = getModelInfo(id);
                  return (
                    <span key={id} className={`text-xs px-2 py-1 rounded-full line-through ${PROVIDER_BADGES[info.provider] || 'bg-gray-100'}`}>
                      {info.display_name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
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
            <button onClick={resetAll} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">새 토너먼트</button>
          </div>
        </div>
      )}

      {/* 카드 그리드 */}
      {shuffledOrder.length > 0 && phase !== 'done' && phase !== 'finals-prompt' && (
        <div className={`grid gap-4 ${gridCols}`}>
          {shuffledOrder.map((modelId, idx) => {
            const r = results[modelId] || {};
            const info = getModelInfo(modelId);
            const rank = getRank(modelId);
            const isWorst = worstPicks.includes(modelId);
            const isBest = phase === 'prelim-rank' && rankings.includes(modelId);
            const canClick = (phase === 'prelim-rank' || phase === 'finals-rank') && r.status !== 'error' && mode !== 'judge';
            const rankStyle = rank && phase !== 'prelim-rank' ? (RANK_STYLES[rank - 1] || { bg: 'bg-gray-300', text: 'text-white', border: 'border-gray-400', ring: 'ring-gray-200' }) : null;
            const judgeRank = judgeResult?.rankings?.find((jr) => jr.modelId === modelId);

            return (
              <div key={modelId} onClick={() => canClick && handleRankToggle(modelId)}
                className={`bg-white rounded-xl border-2 flex flex-col overflow-hidden transition-all ${
                  isWorst ? 'border-red-400 ring-2 ring-red-200 opacity-60'
                  : isBest ? 'border-emerald-400 ring-2 ring-emerald-200 shadow-md'
                  : rankStyle ? `${rankStyle.border} ring-2 ${rankStyle.ring} shadow-md`
                  : judgeRank ? 'border-purple-300 ring-1 ring-purple-200'
                  : 'border-gray-200'
                } ${canClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow-md' : ''}`}>
                <div className={`px-4 py-3 border-b bg-gray-50 flex items-center justify-between ${
                  isWorst ? 'border-red-300' : isBest ? 'border-emerald-300' : rankStyle ? rankStyle.border : 'border-gray-200'
                }`}>
                  <div className="flex items-center gap-2">
                    {isWorst ? (
                      <span className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center text-sm font-bold">X</span>
                    ) : isBest ? (
                      <span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">{rankings.indexOf(modelId) + 1}</span>
                    ) : rankStyle ? (
                      <span className={`w-8 h-8 rounded-full ${rankStyle.bg} ${rankStyle.text} flex items-center justify-center text-sm font-bold`}>{rank}</span>
                    ) : judgeRank ? (
                      <span className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold">{judgeRank.rank}</span>
                    ) : (
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border ${getLabelColor(idx)}`}>
                        {isBlind ? LABELS[idx] : (info.display_name || '')[0]}
                      </span>
                    )}
                    <div>
                      <span className="text-sm font-medium text-gray-700">{getCardTitle(modelId, idx)}</span>
                      {!isBlind && <span className="text-[10px] text-gray-400 ml-1">{info.tier}</span>}
                      {isWorst && <span className="text-xs ml-1 text-red-500">(Worst)</span>}
                      {isBest && <span className="text-xs ml-1 text-emerald-500">(Best {rankings.indexOf(modelId) + 1})</span>}
                      {rank && phase !== 'prelim-rank' && <span className="text-xs ml-1 opacity-60">({rank}등)</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.status === 'streaming' && <span className="inline-flex items-center gap-1 text-xs text-blue-600"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />생성 중</span>}
                    {r.status === 'done' && (
                      <div>
                        <p className="text-xs text-gray-500">{r.charCount?.toLocaleString()}자 / {r.elapsed}s</p>
                        {judgeRank && <p className="text-xs text-purple-600 font-medium">{judgeRank.score}점</p>}
                      </div>
                    )}
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
