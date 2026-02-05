import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch } from '../api/client';

const STATUS_COLORS = {
  '완료': 'bg-green-500',
  '진행중': 'bg-yellow-500',
  '미시작': 'bg-gray-400',
  '목차 없음': 'bg-gray-400',
  '방향 설정됨': 'bg-blue-500',
  '목차 완료': 'bg-blue-500',
};

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function ProjectCard({ project, onDetail, onPreview }) {
  const statusColor = STATUS_COLORS[project.status] || 'bg-gray-400';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-lg font-bold text-gray-900 line-clamp-1">{project.title}</h3>
        <span className={`${statusColor} text-white text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ml-2`}>
          {project.status}
        </span>
      </div>

      {/* 설명 */}
      {project.description && (
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{project.description}</p>
      )}

      {/* 메타 정보 */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400 mb-3">
        {project.author && <span>👤 {project.author}</span>}
        {project.createdAt && <span>📅 {project.createdAt.slice(0, 10)}</span>}
        {project.chapterCount > 0 && (
          <span>📖 {project.partCount}파트 · {project.chapterCount}챕터</span>
        )}
      </div>

      {/* 배지 */}
      <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-4">
        {project.a4Pages > 0 && <span className="bg-gray-100 px-2 py-0.5 rounded">📄 ~{project.a4Pages}페이지</span>}
        {project.totalTokens > 0 && <span className="bg-gray-100 px-2 py-0.5 rounded">🪙 {project.totalTokens.toLocaleString()} 토큰</span>}
        {project.cost > 0 && <span className="bg-gray-100 px-2 py-0.5 rounded">💰 ~${project.cost.toFixed(2)}</span>}
        {project.elapsedTime > 0 && <span className="bg-gray-100 px-2 py-0.5 rounded">⏱️ {Math.round(project.elapsedTime)}초</span>}
      </div>

      {/* 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => onDetail(project)}
          className="flex-1 text-xs py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          상세 보기
        </button>
        {project.hasChapters && (
          <button
            onClick={() => onPreview(project)}
            className="flex-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            📖 미리보기
          </button>
        )}
      </div>
    </div>
  );
}

function DetailPanel({ project, onClose }) {
  if (!project) return null;

  const toc = project.toc;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white h-full overflow-y-auto p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900">{project.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {project.description && (
          <p className="text-sm text-gray-500 mb-4">{project.description}</p>
        )}

        {/* 목차 트리 */}
        {toc && (
          <div className="mb-6">
            <h4 className="font-semibold text-gray-800 mb-2">목차</h4>
            {toc.target_audience && (
              <p className="text-xs text-gray-400 mb-2">대상: {toc.target_audience}</p>
            )}
            {(toc.parts || []).map((part) => (
              <div key={part.part_number} className="mb-3">
                <p className="font-medium text-sm text-gray-700">
                  Part {part.part_number}. {part.part_title}
                </p>
                {(part.chapters || []).map((ch) => {
                  const done = project.chapterFiles?.includes(`${ch.chapter_id}.md`);
                  return (
                    <p key={ch.chapter_id} className="text-xs text-gray-500 ml-4 py-0.5">
                      {ch.chapter_number}. {ch.chapter_title}
                      {ch.estimated_time && ` (${ch.estimated_time})`}
                      {done && ' ✅'}
                    </p>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* 생성 리포트 */}
        {project.model && (
          <div className="mb-6">
            <h4 className="font-semibold text-gray-800 mb-2">본문 생성 리포트</h4>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-sm font-bold">{project.completedChapters}/{project.totalChapters}</p>
                <p className="text-xs text-gray-400">완료/전체</p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-sm font-bold">{project.totalTokens.toLocaleString()}</p>
                <p className="text-xs text-gray-400">총 토큰</p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-sm font-bold">{project.cost > 0 ? `~$${project.cost.toFixed(2)}` : '-'}</p>
                <p className="text-xs text-gray-400">비용</p>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              모델: {project.model} | 생성일: {project.generatedAt ? project.generatedAt.slice(0, 10) : '-'}
            </p>
          </div>
        )}

        {/* 열람 */}
        <div>
          <h4 className="font-semibold text-gray-800 mb-2">열람</h4>
          <div className="flex gap-2">
            <span className={`flex-1 text-center text-xs py-2 rounded-lg ${project.hasSite ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
              🌐 {project.hasSite ? '사이트 있음' : '사이트 없음'}
            </span>
            <span className={`flex-1 text-center text-xs py-2 rounded-lg ${project.hasDocx ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              📥 {project.hasDocx ? 'DOCX 있음' : 'DOCX 없음'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({ project, onClose }) {
  const [selectedChapter, setSelectedChapter] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const chapters = project?.chapterFiles || [];

  useEffect(() => {
    if (chapters.length > 0 && !selectedChapter) {
      setSelectedChapter(chapters[0].replace('.md', ''));
    }
  }, [chapters]);

  useEffect(() => {
    if (!project || !selectedChapter) return;
    setLoading(true);
    apiFetch(`/api/portfolio/${project.name}/chapter/${selectedChapter}`)
      .then((d) => setContent(d.content))
      .catch(() => setContent('챕터를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, [project, selectedChapter]);

  if (!project) return null;

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">📖 미리보기: {project.title}</h3>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">닫기 ✕</button>
      </div>

      <select
        value={selectedChapter}
        onChange={(e) => setSelectedChapter(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
      >
        {chapters.map((f) => (
          <option key={f} value={f.replace('.md', '')}>{f.replace('.md', '')}</option>
        ))}
      </select>

      {loading ? (
        <div className="text-center py-8 text-gray-400">로딩 중...</div>
      ) : (
        <div className="prose prose-sm max-w-none max-h-[60vh] overflow-y-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content.length > 10000
              ? content.slice(0, 10000) + `\n\n---\n📝 전체 ${content.length.toLocaleString()}자 중 처음 10,000자만 표시합니다.`
              : content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export default function Portfolio() {
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('newest');
  const [filter, setFilter] = useState('all');
  const [detailProject, setDetailProject] = useState(null);
  const [previewProject, setPreviewProject] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/portfolio')
      .then((d) => {
        setProjects(d.projects);
        setStats(d.stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 정렬 + 필터
  const displayed = (() => {
    let list = [...projects];

    // 필터
    if (filter === 'completed') list = list.filter(p => p.status === '완료');
    else if (filter === 'inprogress') list = list.filter(p => p.status === '진행중');
    else if (filter === 'notstarted') list = list.filter(p => !['완료', '진행중'].includes(p.status));

    // 정렬
    if (sort === 'newest') list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    else if (sort === 'oldest') list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    else if (sort === 'name') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return list;
  })();

  if (loading) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">포트폴리오 로딩 중...</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">📊 포트폴리오</h2>
      <p className="text-sm text-gray-500 mb-6">에듀플로로 만든 교재 프로젝트를 한눈에 둘러보세요</p>

      {/* 통계 대시보드 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <StatCard label="총 프로젝트" value={`${stats.totalProjects}개`} />
          <StatCard label="완료" value={`${stats.completed}개`} />
          <StatCard label="총 챕터" value={`${stats.totalChapters}개`} />
          <StatCard label="총 분량" value={stats.totalPages > 0 ? `~${stats.totalPages}페이지` : '-'} />
          <StatCard label="총 생성 비용" value={stats.totalCost > 0 ? `~$${stats.totalCost.toFixed(2)}` : '-'} />
        </div>
      )}

      {/* 필터/정렬 바 */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="newest">최신순</option>
          <option value="oldest">오래된순</option>
          <option value="name">이름순</option>
        </select>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="all">전체</option>
          <option value="completed">완료</option>
          <option value="inprogress">진행중</option>
          <option value="notstarted">미시작</option>
        </select>
        <span className="text-sm text-gray-400">{displayed.length}개 프로젝트</span>
      </div>

      {/* 프로젝트 카드 그리드 */}
      {displayed.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-400">
            {projects.length === 0
              ? '아직 프로젝트가 없습니다. \'프로젝트 관리\' 페이지에서 새 프로젝트를 만들어보세요!'
              : '조건에 맞는 프로젝트가 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayed.map((p) => (
            <ProjectCard
              key={p.name}
              project={p}
              onDetail={setDetailProject}
              onPreview={setPreviewProject}
            />
          ))}
        </div>
      )}

      {/* 미리보기 패널 */}
      {previewProject && (
        <PreviewPanel project={previewProject} onClose={() => setPreviewProject(null)} />
      )}

      {/* 상세 보기 슬라이드 패널 */}
      {detailProject && (
        <DetailPanel project={detailProject} onClose={() => setDetailProject(null)} />
      )}
    </div>
  );
}
