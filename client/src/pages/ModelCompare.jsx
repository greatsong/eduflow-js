import { useState, useEffect, useRef } from 'react';
import { apiFetch, API_BASE } from '../api/client';
import ReactMarkdown from 'react-markdown';

const PRESETS = [
  {
    name: '교육자료 생성',
    prompt: '"인공지능의 역사와 발전" 주제로 고등학생 대상 교육자료 1페이지를 작성해주세요. 핵심 개념, 주요 사건 타임라인, 학습 활동을 포함해주세요.',
    system: '교육 콘텐츠 전문가로서 명확하고 구조화된 답변을 해주세요.',
  },
  {
    name: '목차 구성',
    prompt: '"데이터 과학 입문" 교재의 목차를 10개 챕터로 구성해주세요. 각 챕터에 2-3개 소주제를 포함하세요.',
    system: '교육과정 설계 전문가로서 체계적인 구조를 제안해주세요.',
  },
  {
    name: '개념 설명',
    prompt: '중학생이 이해할 수 있도록 "머신러닝"이 무엇인지 비유와 예시를 들어 설명해주세요.',
    system: '학생 눈높이에 맞춘 쉽고 재미있는 설명을 해주세요.',
  },
  {
    name: '퀴즈 생성',
    prompt: '"광합성" 주제로 선다형 5문제와 서술형 2문제를 만들어주세요. 정답과 해설도 포함하세요.',
    system: '평가 문항 전문가로서 다양한 난이도의 문제를 출제해주세요.',
  },
  {
    name: '한국어 품질',
    prompt: '다음 문장을 자연스러운 한국어로 다듬어주세요: "인공지능은 매우 빠른 속도로 발전하고 있는 기술인데 이것은 우리의 생활에 많은 영향을 끼치고 있습니다. 특히 교육 분야에서의 활용이 주목받고 있습니다."',
    system: '한국어 교정 전문가로서 문맥에 맞게 자연스럽게 다듬어주세요.',
  },
];

export default function ModelCompare() {
  const [allModels, setAllModels] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('교육 콘텐츠 전문가로서 명확하고 구조화된 답변을 해주세요.');
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/models').then(({ models }) => {
      setAllModels(models);
    }).catch(() => {});
  }, []);

  const toggleModel = (id) => {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const applyPreset = (preset) => {
    setPrompt(preset.prompt);
    setSystemPrompt(preset.system);
  };

  const runCompare = async () => {
    if (selectedModels.length < 2 || !prompt.trim()) return;

    setRunning(true);
    // 초기화
    const init = {};
    for (const m of selectedModels) {
      init[m] = { text: '', status: 'waiting', elapsed: null, charCount: null };
    }
    setResults(init);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const headers = {};
      const keys = {
        anthropic: localStorage.getItem('eduflow_api_key'),
        openai: localStorage.getItem('eduflow_openai_key'),
        google: localStorage.getItem('eduflow_google_key'),
        upstage: localStorage.getItem('eduflow_upstage_key'),
      };
      if (keys.anthropic) headers['x-api-key'] = keys.anthropic;
      if (keys.openai) headers['x-openai-key'] = keys.openai;
      if (keys.google) headers['x-google-key'] = keys.google;
      if (keys.upstage) headers['x-upstage-key'] = keys.upstage;

      const res = await fetch(`${API_BASE}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ models: selectedModels, prompt, systemPrompt }),
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

              if (data.type === 'start') {
                copy[mid] = { ...copy[mid], status: 'streaming' };
              } else if (data.type === 'text') {
                copy[mid] = { ...copy[mid], text: (copy[mid]?.text || '') + data.content };
              } else if (data.type === 'complete') {
                copy[mid] = { ...copy[mid], status: 'done', elapsed: data.elapsed, charCount: data.charCount };
              } else if (data.type === 'error') {
                copy[mid] = { ...copy[mid], status: 'error', error: data.message };
              }
              return copy;
            });
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Compare error:', err);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const getModelInfo = (id) => allModels.find((m) => m.id === id) || { display_name: id, tier: '' };

  const providerColor = {
    anthropic: 'bg-orange-100 text-orange-800 border-orange-200',
    openai: 'bg-green-100 text-green-800 border-green-200',
    google: 'bg-blue-100 text-blue-800 border-blue-200',
    upstage: 'bg-purple-100 text-purple-800 border-purple-200',
  };

  const providerBorder = {
    anthropic: 'border-orange-300',
    openai: 'border-green-300',
    google: 'border-blue-300',
    upstage: 'border-purple-300',
  };

  // 프로바이더별로 모델 그룹핑
  const grouped = {};
  for (const m of allModels) {
    if (!grouped[m.provider]) grouped[m.provider] = [];
    grouped[m.provider].push(m);
  }

  const providerLabels = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI (GPT)', google: 'Google (Gemini)', upstage: 'Upstage (Solar)' };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">AI 모델 비교</h2>
        <p className="text-gray-500 mt-1">같은 프롬프트로 여러 모델의 결과를 나란히 비교하세요 (최대 4개)</p>
      </div>

      {/* 모델 선택 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          모델 선택 <span className="text-gray-400 font-normal">({selectedModels.length}/4)</span>
        </h3>
        <div className="space-y-3">
          {Object.entries(grouped).map(([provider, models]) => (
            <div key={provider}>
              <p className="text-xs font-medium text-gray-500 mb-1.5">{providerLabels[provider] || provider}</p>
              <div className="flex flex-wrap gap-2">
                {models.map((m) => {
                  const selected = selectedModels.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleModel(m.id)}
                      disabled={running || (!selected && selectedModels.length >= 4)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                        selected
                          ? `${providerColor[provider]} border-current font-medium ring-2 ring-offset-1 ring-current/30`
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 disabled:opacity-40'
                      }`}
                    >
                      {m.display_name}
                      <span className="text-xs opacity-60 ml-1">({m.tier})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 프롬프트 입력 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">프롬프트</h3>
          <button
            onClick={() => setShowSystem(!showSystem)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showSystem ? '시스템 프롬프트 숨기기' : '시스템 프롬프트 설정'}
          </button>
        </div>

        {/* 프리셋 */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              disabled={running}
              className="px-3 py-1 rounded-full text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-40"
            >
              {p.name}
            </button>
          ))}
        </div>

        {showSystem && (
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={2}
            disabled={running}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="시스템 프롬프트..."
          />
        )}

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          disabled={running}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="비교할 프롬프트를 입력하세요..."
        />

        <div className="flex gap-2">
          <button
            onClick={runCompare}
            disabled={running || selectedModels.length < 2 || !prompt.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {running ? '생성 중...' : `${selectedModels.length}개 모델 비교 실행`}
          </button>
          {running && (
            <button
              onClick={handleStop}
              className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors"
            >
              중지
            </button>
          )}
        </div>
      </div>

      {/* 결과 비교 */}
      {Object.keys(results).length > 0 && (
        <div className={`grid gap-4 ${
          selectedModels.length === 2 ? 'grid-cols-2' :
          selectedModels.length === 3 ? 'grid-cols-3' :
          'grid-cols-2 lg:grid-cols-4'
        }`}>
          {selectedModels.map((modelId) => {
            const info = getModelInfo(modelId);
            const r = results[modelId] || {};
            const borderColor = providerBorder[info.provider] || 'border-gray-200';

            return (
              <div
                key={modelId}
                className={`bg-white rounded-xl border-2 ${borderColor} flex flex-col overflow-hidden`}
              >
                {/* 헤더 */}
                <div className={`px-4 py-3 border-b ${borderColor} bg-gray-50`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900">{info.display_name}</h4>
                      <p className="text-xs text-gray-500">{info.tier}</p>
                    </div>
                    <div className="text-right">
                      {r.status === 'streaming' && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          생성 중
                        </span>
                      )}
                      {r.status === 'done' && (
                        <div className="text-xs text-gray-500">
                          <p>{r.elapsed}s</p>
                          <p>{r.charCount?.toLocaleString()}자</p>
                        </div>
                      )}
                      {r.status === 'error' && (
                        <span className="text-xs text-red-600">오류</span>
                      )}
                      {r.status === 'waiting' && (
                        <span className="text-xs text-gray-400">대기 중</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 본문 */}
                <div className="flex-1 p-4 overflow-y-auto max-h-[500px] text-sm">
                  {r.status === 'error' ? (
                    <p className="text-red-600 text-sm">{r.error}</p>
                  ) : r.text ? (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{r.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">응답 대기 중...</p>
                  )}
                </div>

                {/* 가격 정보 */}
                {info.pricing && (
                  <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
                    ${info.pricing.input} / ${info.pricing.output} per 1M tokens
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}