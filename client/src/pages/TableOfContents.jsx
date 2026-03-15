import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch, apiStreamPost } from '../api/client';
import ModelSelector from '../components/ModelSelector';

// estimated_time 문자열 → 분 단위 파싱
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const s = timeStr.trim();
  // "1차시" → 50분
  const chasi = s.match(/(\d+)\s*차시/);
  if (chasi) return parseInt(chasi[1]) * 50;
  // "1시간" or "1시간 30분"
  const hourMin = s.match(/(\d+)\s*시간(?:\s*(\d+)\s*분)?/);
  if (hourMin) return parseInt(hourMin[1]) * 60 + (hourMin[2] ? parseInt(hourMin[2]) : 0);
  // "50분"
  const min = s.match(/(\d+)\s*분/);
  if (min) return parseInt(min[1]);
  // bare number → minutes
  const bare = s.match(/^(\d+)$/);
  if (bare) return parseInt(bare[1]);
  return 0;
}

// 분 → 예상 분량 문자열
function estimatedVolume(timeStr) {
  const minutes = parseTimeToMinutes(timeStr);
  if (minutes <= 0) return null;
  const charMin = (minutes * 60).toLocaleString();
  const charMax = (minutes * 100).toLocaleString();
  return `약 ${charMin}~${charMax}자`;
}

export default function TableOfContents() {
  const navigate = useNavigate();
  const { currentProject, refreshProgress } = useProjectStore();

  const [toc, setToc] = useState(null);
  const [model, setModel] = useState('claude-opus-4-5-20251101');
  const [activeTab, setActiveTab] = useState('generate');

  // 생성 상태
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');

  // 편집 상태
  const [editJson, setEditJson] = useState('');
  const [editError, setEditError] = useState('');

  // 기본 모델 로드
  useEffect(() => {
    apiFetch('/api/models/default/chapter_generation')
      .then((r) => setModel(r.modelId))
      .catch(() => {});
  }, []);

  // 프로젝트 변경 시 TOC 로드
  useEffect(() => {
    if (!currentProject) return;
    apiFetch(`/api/projects/${currentProject.name}/toc`)
      .then((d) => {
        setToc(d.toc);
        if (d.toc) setEditJson(JSON.stringify(d.toc, null, 2));
      })
      .catch(() => setToc(null));
  }, [currentProject]);

  // 목차 자동 생성
  const handleGenerate = async () => {
    if (!currentProject) return;
    setGenerating(true);
    setStreamText('');

    try {
      await apiStreamPost(
        `/api/projects/${currentProject.name}/toc/generate`,
        { model },
        {
          onText: (text) => setStreamText((prev) => prev + text),
          onDone: () => {
            setGenerating(false);
            refreshProgress();
            apiFetch(`/api/projects/${currentProject.name}/toc`)
              .then((d) => {
                setToc(d.toc);
                if (d.toc) setEditJson(JSON.stringify(d.toc, null, 2));
              });
          },
          onError: (e) => {
            setStreamText((prev) => prev + `\n\n❌ 오류: ${e.message}`);
            setGenerating(false);
          },
        }
      );
    } catch (e) {
      setStreamText(`❌ 오류: ${e.message}`);
      setGenerating(false);
    }
  };

  // 편집 저장
  const handleSave = async () => {
    setEditError('');
    try {
      const parsed = JSON.parse(editJson);
      await apiFetch(`/api/projects/${currentProject.name}/toc`, {
        method: 'PUT',
        body: JSON.stringify({ toc: parsed }),
      });
      setToc(parsed);
      setEditError('');
    } catch (e) {
      if (e instanceof SyntaxError) {
        setEditError(`JSON 형식 오류: ${e.message}`);
      } else {
        setEditError(`저장 실패: ${e.message}`);
      }
    }
  };

  if (!currentProject) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">먼저 프로젝트를 선택하세요</p>
      </div>
    );
  }

  const totalChapters = toc
    ? (toc.parts || []).reduce((sum, p) => sum + (p.chapters || []).length, 0)
    : 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📋 Step 2: 목차 작성</h2>
          <p className="text-sm text-gray-500">참고자료와 논의 내용을 바탕으로 교육자료의 목차를 작성합니다.</p>
        </div>
        <ModelSelector
          value={model}
          onChange={setModel}
          defaultPurpose="chapter_generation"
          className="px-3 py-1.5"
        />
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('generate')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'generate'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📝 목차 생성
        </button>
        <button
          onClick={() => setActiveTab('visual')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'visual'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🎨 비주얼 편집
        </button>
        <button
          onClick={() => setActiveTab('edit')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'edit'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ✏️ JSON 편집
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'generate' ? (
          <GenerateTab
            toc={toc}
            totalChapters={totalChapters}
            generating={generating}
            streamText={streamText}
            onGenerate={handleGenerate}
          />
        ) : activeTab === 'visual' ? (
          <VisualEditTab
            toc={toc}
            setToc={setToc}
            setEditJson={setEditJson}
            currentProject={currentProject}
          />
        ) : (
          <EditTab
            editJson={editJson}
            setEditJson={setEditJson}
            editError={editError}
            onSave={handleSave}
            hasToc={!!toc}
          />
        )}
      </div>

      {/* 다음 단계로 */}
      {toc && !generating && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => navigate('/feedback')}
            className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            ✅ Step 3: 피드백 & 컨펌으로 →
          </button>
        </div>
      )}
    </div>
  );
}

function GenerateTab({ toc, totalChapters, generating, streamText, onGenerate }) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <button
          onClick={onGenerate}
          disabled={generating}
          className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {generating ? '목차 생성 중...' : toc ? '🔄 목차 재생성' : '🚀 목차 자동 생성'}
        </button>

        {streamText && (
          <div className="mt-4 bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-green-400 text-xs whitespace-pre-wrap font-mono">
              {streamText}{generating ? '▌' : ''}
            </pre>
          </div>
        )}
      </div>

      {toc && !generating && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 생성된 목차</h3>

          <div className="mb-4 space-y-1">
            <p className="text-sm"><span className="font-medium text-gray-700">제목:</span> {toc.title || '-'}</p>
            <p className="text-sm"><span className="font-medium text-gray-700">대상:</span> {toc.target_audience || '-'}</p>
            <p className="text-sm"><span className="font-medium text-gray-700">설명:</span> {toc.description || '-'}</p>
            <p className="text-sm text-blue-600 font-medium">
              총 {(toc.parts || []).length}개 Part, {totalChapters}개 Chapter
            </p>
          </div>

          <div className="space-y-4">
            {(toc.parts || []).map((part) => (
              <PartCard key={part.part_number} part={part} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PartCard({ part }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="font-medium text-gray-900">
          📚 Part {part.part_number}: {part.part_title}
        </span>
        <span className="text-gray-400">{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600 italic">{part.part_description}</p>
          {(part.chapters || []).map((ch) => (
            <ChapterItem key={ch.chapter_id} chapter={ch} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChapterItem({ chapter }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="border-l-2 border-blue-200 pl-3">
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
        onClick={() => setShowDetail(!showDetail)}
      >
        <span className="text-sm font-medium text-gray-800">
          {chapter.chapter_id}: {chapter.chapter_title}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500">{chapter.estimated_time || '-'}</span>
          {estimatedVolume(chapter.estimated_time) && (
            <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
              ({estimatedVolume(chapter.estimated_time)})
            </span>
          )}
        </div>
      </div>

      {showDetail && (
        <div className="px-2 py-2 text-sm text-gray-600 space-y-2">
          <div>
            <p className="font-medium text-gray-700 mb-1">학습 목표:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {(chapter.learning_objectives || []).map((obj, i) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-1">개요:</p>
            <p className="text-gray-600">{chapter.outline}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function VisualEditTab({ toc, setToc, setEditJson, currentProject }) {
  const [saveStatus, setSaveStatus] = useState('');

  if (!toc) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">먼저 '목차 생성' 탭에서 목차를 생성하세요.</p>
      </div>
    );
  }

  // 깊은 복사 후 상태 업데이트
  const updateToc = (updater) => {
    const newToc = JSON.parse(JSON.stringify(toc));
    updater(newToc);
    setToc(newToc);
    setEditJson(JSON.stringify(newToc, null, 2));
    setSaveStatus('');
  };

  // Part 추가
  const addPart = () => {
    updateToc((t) => {
      const parts = t.parts || [];
      const newNum = parts.length > 0 ? Math.max(...parts.map(p => p.part_number)) + 1 : 1;
      parts.push({
        part_number: newNum,
        part_title: '새 파트',
        part_description: '',
        chapters: [],
      });
      t.parts = parts;
    });
  };

  // Part 삭제
  const deletePart = (partIdx) => {
    if (!confirm(`Part ${toc.parts[partIdx].part_number}를 삭제하시겠습니까?`)) return;
    updateToc((t) => {
      t.parts.splice(partIdx, 1);
      // part_number 재정렬
      t.parts.forEach((p, i) => { p.part_number = i + 1; });
    });
  };

  // Part 제목 수정
  const updatePartTitle = (partIdx, value) => {
    updateToc((t) => { t.parts[partIdx].part_title = value; });
  };

  // Part 설명 수정
  const updatePartDesc = (partIdx, value) => {
    updateToc((t) => { t.parts[partIdx].part_description = value; });
  };

  // Chapter 추가
  const addChapter = (partIdx) => {
    updateToc((t) => {
      const chapters = t.parts[partIdx].chapters || [];
      const partNum = t.parts[partIdx].part_number;
      const chNum = chapters.length + 1;
      chapters.push({
        chapter_id: `${partNum}.${chNum}`,
        chapter_title: '새 챕터',
        estimated_time: '1차시',
        learning_objectives: ['학습 목표를 입력하세요'],
        outline: '',
      });
      t.parts[partIdx].chapters = chapters;
    });
  };

  // Chapter 삭제
  const deleteChapter = (partIdx, chIdx) => {
    if (!confirm('이 챕터를 삭제하시겠습니까?')) return;
    updateToc((t) => {
      t.parts[partIdx].chapters.splice(chIdx, 1);
      // chapter_id 재정렬
      const partNum = t.parts[partIdx].part_number;
      t.parts[partIdx].chapters.forEach((ch, i) => {
        ch.chapter_id = `${partNum}.${i + 1}`;
      });
    });
  };

  // Chapter 필드 수정
  const updateChapter = (partIdx, chIdx, field, value) => {
    updateToc((t) => { t.parts[partIdx].chapters[chIdx][field] = value; });
  };

  // Chapter 순서 변경
  const moveChapter = (partIdx, chIdx, direction) => {
    const newIdx = chIdx + direction;
    if (newIdx < 0 || newIdx >= toc.parts[partIdx].chapters.length) return;
    updateToc((t) => {
      const chapters = t.parts[partIdx].chapters;
      [chapters[chIdx], chapters[newIdx]] = [chapters[newIdx], chapters[chIdx]];
      // chapter_id 재정렬
      const partNum = t.parts[partIdx].part_number;
      chapters.forEach((ch, i) => { ch.chapter_id = `${partNum}.${i + 1}`; });
    });
  };

  // 학습 목표 추가
  const addObjective = (partIdx, chIdx) => {
    updateToc((t) => {
      const objs = t.parts[partIdx].chapters[chIdx].learning_objectives || [];
      objs.push('');
      t.parts[partIdx].chapters[chIdx].learning_objectives = objs;
    });
  };

  // 학습 목표 삭제
  const deleteObjective = (partIdx, chIdx, objIdx) => {
    updateToc((t) => {
      t.parts[partIdx].chapters[chIdx].learning_objectives.splice(objIdx, 1);
    });
  };

  // 학습 목표 수정
  const updateObjective = (partIdx, chIdx, objIdx, value) => {
    updateToc((t) => {
      t.parts[partIdx].chapters[chIdx].learning_objectives[objIdx] = value;
    });
  };

  // 저장
  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await apiFetch(`/api/projects/${currentProject.name}/toc`, {
        method: 'PUT',
        body: JSON.stringify({ toc }),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (e) {
      setSaveStatus('error');
      alert(`저장 실패: ${e.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* 상단 메타 정보 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">제목</label>
            <input
              type="text"
              value={toc.title || ''}
              onChange={(e) => updateToc((t) => { t.title = e.target.value; })}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">대상</label>
            <input
              type="text"
              value={toc.target_audience || ''}
              onChange={(e) => updateToc((t) => { t.target_audience = e.target.value; })}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">설명</label>
          <input
            type="text"
            value={toc.description || ''}
            onChange={(e) => updateToc((t) => { t.description = e.target.value; })}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Parts */}
      {(toc.parts || []).map((part, partIdx) => (
        <VisualPartCard
          key={partIdx}
          part={part}
          partIdx={partIdx}
          totalParts={(toc.parts || []).length}
          onUpdateTitle={(v) => updatePartTitle(partIdx, v)}
          onUpdateDesc={(v) => updatePartDesc(partIdx, v)}
          onDeletePart={() => deletePart(partIdx)}
          onAddChapter={() => addChapter(partIdx)}
          onDeleteChapter={(chIdx) => deleteChapter(partIdx, chIdx)}
          onUpdateChapter={(chIdx, field, value) => updateChapter(partIdx, chIdx, field, value)}
          onMoveChapter={(chIdx, dir) => moveChapter(partIdx, chIdx, dir)}
          onAddObjective={(chIdx) => addObjective(partIdx, chIdx)}
          onDeleteObjective={(chIdx, objIdx) => deleteObjective(partIdx, chIdx, objIdx)}
          onUpdateObjective={(chIdx, objIdx, value) => updateObjective(partIdx, chIdx, objIdx, value)}
        />
      ))}

      {/* Part 추가 & 저장 */}
      <div className="flex gap-3">
        <button
          onClick={addPart}
          className="flex-1 py-2.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg text-sm font-medium hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + 새 Part 추가
        </button>
        <button
          onClick={handleSave}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            saveStatus === 'saved'
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '저장 완료!' : '💾 저장'}
        </button>
      </div>
    </div>
  );
}

function VisualPartCard({
  part, partIdx, totalParts,
  onUpdateTitle, onUpdateDesc, onDeletePart,
  onAddChapter, onDeleteChapter, onUpdateChapter, onMoveChapter,
  onAddObjective, onDeleteObjective, onUpdateObjective,
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Part 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600 w-5 text-center"
        >
          {expanded ? '▼' : '▶'}
        </button>
        <span className="text-sm font-bold text-blue-600 shrink-0">Part {part.part_number}</span>
        <input
          type="text"
          value={part.part_title}
          onChange={(e) => onUpdateTitle(e.target.value)}
          className="flex-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-sm font-medium text-gray-900 px-1 py-0.5"
        />
        <button
          onClick={onDeletePart}
          className="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded hover:bg-red-50 transition-colors"
          title="Part 삭제"
        >
          삭제
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          {/* Part 설명 */}
          <input
            type="text"
            value={part.part_description || ''}
            onChange={(e) => onUpdateDesc(e.target.value)}
            placeholder="파트 설명..."
            className="w-full text-xs text-gray-500 italic border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 focus:outline-none"
          />

          {/* Chapters */}
          {(part.chapters || []).map((ch, chIdx) => (
            <VisualChapterItem
              key={chIdx}
              chapter={ch}
              chIdx={chIdx}
              totalChapters={(part.chapters || []).length}
              onUpdateChapter={(field, value) => onUpdateChapter(chIdx, field, value)}
              onDeleteChapter={() => onDeleteChapter(chIdx)}
              onMoveChapter={(dir) => onMoveChapter(chIdx, dir)}
              onAddObjective={() => onAddObjective(chIdx)}
              onDeleteObjective={(objIdx) => onDeleteObjective(chIdx, objIdx)}
              onUpdateObjective={(objIdx, value) => onUpdateObjective(chIdx, objIdx, value)}
            />
          ))}

          {/* Chapter 추가 */}
          <button
            onClick={onAddChapter}
            className="w-full py-2 border border-dashed border-gray-300 text-gray-400 rounded-lg text-xs hover:border-blue-400 hover:text-blue-500 transition-colors"
          >
            + 챕터 추가
          </button>
        </div>
      )}
    </div>
  );
}

function VisualChapterItem({
  chapter, chIdx, totalChapters,
  onUpdateChapter, onDeleteChapter, onMoveChapter,
  onAddObjective, onDeleteObjective, onUpdateObjective,
}) {
  const [showDetail, setShowDetail] = useState(false);
  const volume = estimatedVolume(chapter.estimated_time);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* 챕터 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white">
        {/* 순서 이동 버튼 */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={() => onMoveChapter(-1)}
            disabled={chIdx === 0}
            className="text-gray-400 hover:text-blue-600 disabled:opacity-30 text-xs leading-none"
            title="위로 이동"
          >
            ▲
          </button>
          <button
            onClick={() => onMoveChapter(1)}
            disabled={chIdx === totalChapters - 1}
            className="text-gray-400 hover:text-blue-600 disabled:opacity-30 text-xs leading-none"
            title="아래로 이동"
          >
            ▼
          </button>
        </div>

        <span className="text-xs text-gray-400 font-mono shrink-0 w-8">{chapter.chapter_id}</span>

        <input
          type="text"
          value={chapter.chapter_title}
          onChange={(e) => onUpdateChapter('chapter_title', e.target.value)}
          className="flex-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-sm text-gray-800 px-1"
        />

        <input
          type="text"
          value={chapter.estimated_time || ''}
          onChange={(e) => onUpdateChapter('estimated_time', e.target.value)}
          className="w-20 text-xs text-center bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          placeholder="시간"
        />

        {volume && (
          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded shrink-0">
            ({volume})
          </span>
        )}

        <button
          onClick={() => setShowDetail(!showDetail)}
          className="text-gray-400 hover:text-gray-600 text-xs px-1"
        >
          {showDetail ? '접기' : '상세'}
        </button>

        <button
          onClick={onDeleteChapter}
          className="text-red-400 hover:text-red-600 text-xs px-1"
          title="챕터 삭제"
        >
          ✕
        </button>
      </div>

      {/* 챕터 상세 */}
      {showDetail && (
        <div className="px-3 py-3 bg-gray-50 border-t border-gray-200 space-y-3">
          {/* 학습 목표 */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">학습 목표</p>
            {(chapter.learning_objectives || []).map((obj, objIdx) => (
              <div key={objIdx} className="flex items-center gap-1 mb-1">
                <span className="text-xs text-gray-400">•</span>
                <input
                  type="text"
                  value={obj}
                  onChange={(e) => onUpdateObjective(objIdx, e.target.value)}
                  className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  onClick={() => onDeleteObjective(objIdx)}
                  className="text-red-400 hover:text-red-600 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={onAddObjective}
              className="text-xs text-blue-500 hover:text-blue-700 mt-1"
            >
              + 목표 추가
            </button>
          </div>

          {/* 개요 */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">개요</p>
            <textarea
              value={chapter.outline || ''}
              onChange={(e) => onUpdateChapter('outline', e.target.value)}
              rows={2}
              className="w-full text-xs bg-white border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
              placeholder="챕터 개요..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EditTab({ editJson, setEditJson, editError, onSave, hasToc }) {
  if (!hasToc) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">먼저 '목차 생성' 탭에서 목차를 생성하세요.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <p className="text-sm text-gray-600">생성된 목차를 JSON 형식으로 직접 편집할 수 있습니다.</p>

      <textarea
        value={editJson}
        onChange={(e) => setEditJson(e.target.value)}
        className="w-full h-[500px] font-mono text-xs border border-gray-300 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        spellCheck={false}
      />

      {editError && (
        <p className="text-sm text-red-600">{editError}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onSave}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          💾 저장
        </button>
      </div>
    </div>
  );
}
