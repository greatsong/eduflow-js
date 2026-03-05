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
  const [blind, setBlind] = useState(true);
  const [selectedModelIds, setSelectedModelIds] = useState([]);

  // idle | prelim | prelim-rank | finals-prompt | finals | finals-rank | done
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

  // 공개 모드: 체크된 모델들
  const modelsToRun = useMemo(() => {
    if (blind) return availableModels;
    return availableModels.filter((m) => selectedModelIds.includes(m.id));
  }, [blind, availableModels, selectedModelIds]);

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
    const ordered = blind ? shuffle(modelIds) : modelIds;
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
  }, [blind]);

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
  };

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
            {blind ? '블라인드 토너먼트: 익명 비교 → Top 5 → 3회 결선' : '공개 비교: 모델을 직접 선택하고 결과를 나란히 비교'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {phase !== 'idle' && (
            <>
              <span className="px-3 py-1.5 bg-indigo-100 text-indigo-800 rounded-lg text-sm font-medium">
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

      {/* 모드 토글 — idle 상태에서만 변경 가능 */}
      {phase === 'idle' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">비교 방식</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button onClick={() => setBlind(true)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${blind ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                블라인드 (익명)
              </button>
              <button onClick={() => setBlind(false)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${!blind ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                공개 (모델 선택)
              </button>
            </div>
            <span className="text-xs text-gray-400">
              {blind ? '모든 모델을 익명으로 비교합니다' : '원하는 모델만 골라서 비교합니다'}
            </span>
          </div>

          {/* 공개 모드: 모델 체크박스 */}
          {!blind && (
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
                {blind ? `토너먼트 시작 (${modelsToRun.length}개 모델)` : `비교 시작 (${modelsToRun.length}개 모델)`}
              </button>
              {modelsToRun.length < 2 && (
                <p className="text-xs text-orange-600">
                  {blind ? '2개 이상 프로바이더의 API 키를 설정해주세요' : '2개 이상 모델을 선택해주세요'}
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
      {running && (phase === 'prelim' || phase === 'finals') && (
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

      {/* 카드 그리드 */}
      {shuffledOrder.length > 0 && phase !== 'done' && phase !== 'finals-prompt' && (
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
