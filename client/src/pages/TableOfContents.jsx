import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch, apiStreamPost } from '../api/client';

export default function TableOfContents() {
  const navigate = useNavigate();
  const { currentProject, refreshProgress } = useProjectStore();

  const [toc, setToc] = useState(null);
  const [model, setModel] = useState('claude-opus-4-5-20251101');
  const [models, setModels] = useState([]);
  const [activeTab, setActiveTab] = useState('generate');

  // 생성 상태
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');

  // 편집 상태
  const [editJson, setEditJson] = useState('');
  const [editError, setEditError] = useState('');

  // 모델 목록 로드
  useEffect(() => {
    apiFetch('/api/models').then((d) => {
      setModels(d.models);
      apiFetch('/api/models/default/chapter_generation').then((r) => setModel(r.modelId));
    }).catch(() => {});
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
          onClick={() => setActiveTab('edit')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'edit'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ✏️ 목차 편집
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
        <span className="text-xs text-gray-500">{chapter.estimated_time || '-'}</span>
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
