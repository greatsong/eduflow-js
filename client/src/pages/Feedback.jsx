import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { apiFetch, apiStreamPost } from '../api/client';
import ChatInterface from '../components/ChatInterface';

// 가이드라인 프리셋 목록
const GUIDELINE_PRESETS = [
  { id: 'formal', label: '격식체(~입니다) 사용' },
  { id: 'casual', label: '구어체(~해요) 사용' },
  { id: 'code_include', label: '코드 블록 포함' },
  { id: 'code_exclude', label: '코드 블록 금지' },
  { id: 'mermaid', label: 'Mermaid 다이어그램 사용' },
  { id: 'real_life', label: '실생활 사례 포함' },
  { id: 'humor', label: '유머/위트 포함' },
  { id: 'academic', label: '학술적 톤 유지' },
];

// 저장된 가이드라인 문자열에서 프리셋 체크 상태와 자유 텍스트를 분리
function parseGuidelines(guidelinesStr) {
  if (!guidelinesStr) return { checked: new Set(), freeText: '' };
  const lines = guidelinesStr.split('\n');
  const checked = new Set();
  const freeLines = [];
  for (const line of lines) {
    const trimmed = line.replace(/^-\s*/, '').trim();
    const preset = GUIDELINE_PRESETS.find((p) => p.label === trimmed);
    if (preset) {
      checked.add(preset.id);
    } else if (trimmed) {
      freeLines.push(line);
    }
  }
  return { checked, freeText: freeLines.join('\n') };
}

// 프리셋 체크 상태 + 자유 텍스트 → 가이드라인 문자열
function buildGuidelines(checkedIds, freeText) {
  const presetLines = GUIDELINE_PRESETS
    .filter((p) => checkedIds.has(p.id))
    .map((p) => `- ${p.label}`);
  const parts = [];
  if (presetLines.length > 0) parts.push(presetLines.join('\n'));
  if (freeText.trim()) parts.push(freeText.trim());
  return parts.join('\n');
}

// AI 응답에서 json:toc-update 코드블록 감지
function extractTocUpdate(text) {
  const match = text.match(/```json:toc-update\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed.parts && Array.isArray(parsed.parts)) return parsed;
  } catch {}
  return null;
}

// json:toc-update 블록을 짧은 안내문으로 교체 (렌더링용)
function stripTocUpdateBlock(content) {
  return content.replace(
    /```json:toc-update\s*[\s\S]*?```/g,
    '> 📋 **수정된 목차 JSON** — 아래 버튼으로 적용할 수 있습니다.'
  );
}

export default function Feedback() {
  const navigate = useNavigate();
  const { currentProject, refreshProgress } = useProjectStore();
  const { messages, isStreaming, setMessages, addMessage, appendToLastMessage, setStreaming, clearMessages } = useChatStore();

  const [toc, setToc] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [models, setModels] = useState([]);
  const [loadedProject, setLoadedProject] = useState(null);
  const [applyingToc, setApplyingToc] = useState(false);
  const [tocAppliedMsgIdx, setTocAppliedMsgIdx] = useState(new Set());
  const [guidelines, setGuidelines] = useState('');
  const [guidelinesSaved, setGuidelinesSaved] = useState(true);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [checkedPresets, setCheckedPresets] = useState(new Set());
  const [freeText, setFreeText] = useState('');

  // 모델 목록 로드
  useEffect(() => {
    apiFetch('/api/models').then((d) => {
      setModels(d.models);
      apiFetch('/api/models/default/conversation').then((r) => setModel(r.modelId));
    }).catch(() => {});
  }, []);

  // TOC는 페이지 방문할 때마다 최신으로 로드 (Step 2에서 재생성 반영)
  useEffect(() => {
    if (!currentProject) return;
    apiFetch(`/api/projects/${currentProject.name}/toc`)
      .then((d) => setToc(d.toc))
      .catch(() => setToc(null));
    apiFetch(`/api/projects/${currentProject.name}/progress`)
      .then((d) => setConfirmed(d.step3_confirmed || false))
      .catch(() => setConfirmed(false));
    apiFetch(`/api/projects/${currentProject.name}/toc/guidelines`)
      .then((d) => {
        const g = d.guidelines || '';
        setGuidelines(g);
        const parsed = parseGuidelines(g);
        setCheckedPresets(parsed.checked);
        setFreeText(parsed.freeText);
        setGuidelinesSaved(true);
      })
      .catch(() => {});
  }, [currentProject]);

  // 대화는 프로젝트 변경 시에만 로드 (채팅 상태 유지)
  useEffect(() => {
    if (!currentProject || currentProject.name === loadedProject) return;
    setLoadedProject(currentProject.name);
    apiFetch(`/api/projects/${currentProject.name}/discussions/3`)
      .then((d) => setMessages(d.messages || []))
      .catch(() => setMessages([]));
  }, [currentProject]);

  // 채팅 전송
  const handleSend = useCallback(async (message) => {
    if (!currentProject) return;

    addMessage('user', message);
    addMessage('assistant', '');
    setStreaming(true);

    try {
      const allMessages = [...messages, { role: 'user', content: message }];

      await apiStreamPost(
        `/api/projects/${currentProject.name}/discussions/3/chat`,
        { message, model, messages: allMessages },
        {
          onText: (text) => appendToLastMessage(text),
          onDone: () => setStreaming(false),
          onError: (e) => {
            appendToLastMessage(`\n\n❌ 오류: ${e.message}`);
            setStreaming(false);
          },
        }
      );
    } catch (e) {
      appendToLastMessage(`\n\n❌ 오류: ${e.message}`);
      setStreaming(false);
    }
  }, [currentProject, model, messages]);

  // 대화 초기화
  const handleClear = async () => {
    if (!currentProject) return;
    await apiFetch(`/api/projects/${currentProject.name}/discussions/3`, { method: 'DELETE' });
    clearMessages();
  };

  // 챕터 필드(제목·시간 등) 인라인 수정
  const handleUpdateChapterField = async (partIdx, chIdx, field, newValue) => {
    if (!currentProject || !toc) return;
    const newToc = {
      ...toc,
      parts: toc.parts.map((p, pi) => pi !== partIdx ? p : {
        ...p,
        chapters: p.chapters.map((c, ci) => ci !== chIdx ? c : { ...c, [field]: newValue }),
      }),
    };
    setToc(newToc); // 낙관적 갱신
    try {
      await apiFetch(`/api/projects/${currentProject.name}/toc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toc: newToc }),
      });
    } catch (e) {
      alert(`저장 실패: ${e.message}`);
      // 실패 시 서버 값으로 복원
      apiFetch(`/api/projects/${currentProject.name}/toc`).then((d) => setToc(d.toc)).catch(() => {});
    }
  };

  // AI 응답에서 목차 수정 적용
  const handleApplyTocUpdate = async (tocData, msgIdx) => {
    if (!currentProject || applyingToc) return;
    setApplyingToc(true);
    try {
      await apiFetch(`/api/projects/${currentProject.name}/toc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toc: tocData }),
      });
      setToc(tocData);
      setTocAppliedMsgIdx((prev) => new Set([...prev, msgIdx]));
      setConfirmed(false); // 목차 변경 시 확정 상태 리셋
    } catch (e) {
      alert(`목차 적용 실패: ${e.message}`);
    } finally {
      setApplyingToc(false);
    }
  };

  // 프리셋 체크 토글
  const togglePreset = (presetId) => {
    setCheckedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(presetId)) next.delete(presetId);
      else next.add(presetId);
      const combined = buildGuidelines(next, freeText);
      setGuidelines(combined);
      setGuidelinesSaved(false);
      return next;
    });
  };

  // 자유 텍스트 변경
  const handleFreeTextChange = (value) => {
    setFreeText(value);
    const combined = buildGuidelines(checkedPresets, value);
    setGuidelines(combined);
    setGuidelinesSaved(false);
  };

  // 가이드라인 저장
  const handleSaveGuidelines = async () => {
    if (!currentProject) return;
    const combined = buildGuidelines(checkedPresets, freeText);
    try {
      await apiFetch(`/api/projects/${currentProject.name}/toc/guidelines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guidelines: combined }),
      });
      setGuidelines(combined);
      setGuidelinesSaved(true);
    } catch (e) {
      alert(`저장 실패: ${e.message}`);
    }
  };

  // 목차 확정
  const handleConfirm = async () => {
    if (!currentProject) return;
    try {
      await apiFetch(`/api/projects/${currentProject.name}/toc/confirm`, { method: 'POST' });
      setConfirmed(true);
      refreshProgress();
    } catch (e) {
      alert(`확정 실패: ${e.message}`);
    }
  };

  if (!currentProject) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">먼저 프로젝트를 선택하세요</p>
      </div>
    );
  }

  if (!toc) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">먼저 Step 2에서 목차를 생성하세요</p>
      </div>
    );
  }

  const totalChapters = (toc.parts || []).reduce((sum, p) => sum + (p.chapters || []).length, 0);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">✅ Step 3: 피드백 & 컨펌</h2>
          <p className="text-sm text-gray-500">생성된 목차를 검토하고 Claude와 함께 개선합니다.</p>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* 메인: 채팅 + 목차 */}
      <div className="flex-1 flex gap-6 min-h-0 min-w-0">
        {/* 채팅 영역 (1/2) */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white rounded-xl border border-gray-200 p-4">
          <ChatInterface
            messages={messages}
            isStreaming={isStreaming}
            onSend={handleSend}
            onClear={handleClear}
            placeholder="목차에 대한 의견을 말씀해주세요..."
            contentTransform={stripTocUpdateBlock}
            renderAfterMessage={(msg, idx) => {
              if (msg.role !== 'assistant') return null;
              const tocUpdate = extractTocUpdate(msg.content || '');
              if (!tocUpdate) return null;
              const applied = tocAppliedMsgIdx.has(idx);
              return (
                <div className={`mt-2 p-3 rounded-lg border ${applied ? 'bg-green-50 border-green-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  {applied ? (
                    <p className="text-sm text-green-700 font-medium">✅ 수정된 목차가 적용되었습니다!</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-emerald-700 flex-1">
                        📋 AI가 수정된 목차를 제안했습니다 ({tocUpdate.parts?.length || 0}개 Part,{' '}
                        {(tocUpdate.parts || []).reduce((s, p) => s + (p.chapters || []).length, 0)}개 Chapter)
                      </p>
                      <button
                        onClick={() => handleApplyTocUpdate(tocUpdate, idx)}
                        disabled={applyingToc}
                        className="px-4 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {applyingToc ? '적용 중...' : '✏️ 목차에 적용'}
                      </button>
                    </div>
                  )}
                </div>
              );
            }}
          />
        </div>

        {/* 목차 + 확정 영역 (1/2) */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">📋 현재 목차</h3>

          {/* 목차 표시 */}
          <div className="flex-1 overflow-y-auto mb-4 space-y-3">
            <div className="space-y-1 text-sm">
              <p><span className="font-medium text-gray-700">제목:</span> {toc.title}</p>
              <p><span className="font-medium text-gray-700">대상:</span> {toc.target_audience}</p>
              <p className="text-blue-600 font-medium">
                {(toc.parts || []).length}개 Part, {totalChapters}개 Chapter
              </p>
            </div>

            <hr className="border-gray-200" />

            {(toc.parts || []).map((part, pi) => (
              <div key={part.part_number} className="space-y-1">
                <p className="font-medium text-gray-900 text-sm">
                  📚 Part {part.part_number}: {part.part_title}
                </p>
                <p className="text-xs text-gray-500 italic">{part.part_description}</p>
                {(part.chapters || []).map((ch, ci) => (
                  <div key={ch.chapter_id} className="ml-4 text-sm text-gray-700 flex items-center gap-2">
                    <span className="text-gray-400 shrink-0">{ch.chapter_id}:</span>
                    <input
                      type="text"
                      defaultValue={ch.chapter_title || ''}
                      placeholder="챕터 제목"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== (ch.chapter_title || '')) handleUpdateChapterField(pi, ci, 'chapter_title', v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      className="flex-1 min-w-0 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400"
                      title="제목을 수정하고 Enter 또는 포커스 이동 시 저장됩니다"
                    />
                    <input
                      type="text"
                      defaultValue={ch.estimated_time || ''}
                      placeholder="예: 50분"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (ch.estimated_time || '')) handleUpdateChapterField(pi, ci, 'estimated_time', v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      className="w-20 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400"
                      title="시간을 수정하고 Enter 또는 포커스 이동 시 저장됩니다"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 생성 가이드라인 */}
          <div className="border-t border-gray-200 pt-3 mb-3">
            <button
              onClick={() => setShowGuidelines(!showGuidelines)}
              className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              <span>{showGuidelines ? '▼' : '▶'}</span>
              <span>📝 콘텐츠 생성 가이드라인</span>
              {guidelines.trim() && <span className="text-xs text-emerald-400">(작성됨)</span>}
            </button>
            {showGuidelines && (
              <div className="mt-2 space-y-3">
                <p className="text-xs text-gray-500">
                  챕터 생성 시 AI가 참고할 지침을 설정하세요.
                </p>

                {/* 프리셋 체크박스 */}
                <div className="grid grid-cols-2 gap-1.5">
                  {GUIDELINE_PRESETS.map((preset) => (
                    <label
                      key={preset.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors text-xs ${
                        checkedPresets.has(preset.id)
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedPresets.has(preset.id)}
                        onChange={() => togglePreset(preset.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{preset.label}</span>
                    </label>
                  ))}
                </div>

                {/* 자유 텍스트 */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">추가 지침 (자유 입력)</p>
                  <textarea
                    value={freeText}
                    onChange={(e) => handleFreeTextChange(e.target.value)}
                    placeholder="예시:&#10;- 교양과학 베스트셀러 톤으로 작성&#10;- 각 챕터마다 재미있는 에피소드 포함&#10;- 힌튼-불 가문 연결고리 언급"
                    className="w-full h-20 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <button
                  onClick={handleSaveGuidelines}
                  disabled={guidelinesSaved}
                  className={`w-full py-2 text-sm font-medium rounded-lg transition-colors ${
                    guidelinesSaved
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {guidelinesSaved ? '저장됨' : '가이드라인 저장'}
                </button>
              </div>
            )}
          </div>

          {/* 확정 버튼 */}
          <div className="border-t border-gray-200 pt-3">
            {confirmed ? (
              <div className="space-y-2">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-700 font-medium">✅ 목차가 확정되었습니다!</p>
                  <p className="text-xs text-green-600 mt-1">이제 챕터 제작 단계로 넘어갈 수 있습니다.</p>
                </div>
                <button
                  onClick={() => navigate('/chapters')}
                  className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  ✍️ Step 4: 챕터 제작으로 →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  목차가 만족스러우신가요? 확정 후에도 Step 2에서 수정할 수 있습니다.
                </p>
                <button
                  onClick={handleConfirm}
                  disabled={isStreaming}
                  className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  ✅ 목차 확정하기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
