import { useState, useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch } from '../api/client';

const TABS = ['새 프로젝트', '참고자료', '직접 입력'];

export default function ProjectManager() {
  const { projects, currentProject, fetchProjects, selectProject, clearProject } = useProjectStore();
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => { fetchProjects(); }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">📁 프로젝트 관리</h2>

      {/* 프로젝트 선택 */}
      <div className="mb-6 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">프로젝트:</label>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          value={currentProject?.name || ''}
          onChange={(e) => e.target.value ? selectProject(e.target.value) : clearProject()}
        >
          <option value="">선택 안 함</option>
          {projects.map((p) => (
            <option key={p.name} value={p.name}>{p.title || p.name}</option>
          ))}
        </select>
        {currentProject && (
          <span className="text-sm text-green-600 font-medium">
            ✅ {currentProject.title}
          </span>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === i
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 0 && <NewProjectTab onCreated={fetchProjects} />}
      {activeTab === 1 && <ReferencesTab projectId={currentProject?.name} />}
      {activeTab === 2 && <DirectInputTab projectId={currentProject?.name} />}
    </div>
  );
}

// ============================================================
// 탭 1: 새 프로젝트 만들기
// ============================================================
function NewProjectTab({ onCreated }) {
  const { selectProject } = useProjectStore();
  const [form, setForm] = useState({
    name: '', title: '', author: '', description: '',
  });
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/projects/templates/list').then(setTemplates).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!form.name || !form.title) {
      setError('프로젝트 ID와 제목은 필수입니다');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const body = { ...form, template_id: selectedTemplate || undefined };
      await apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(body) });
      await onCreated();
      selectProject(form.name);
      setForm({ name: '', title: '', author: '', description: '' });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h3 className="text-lg font-semibold mb-4">🆕 새 프로젝트 만들기</h3>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="프로젝트 ID" placeholder="my-book" value={form.name}
          onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="제목" placeholder="나의 교육자료" value={form.title}
          onChange={(v) => setForm({ ...form, title: v })} />
        <Field label="작성자" placeholder="홍길동" value={form.author}
          onChange={(v) => setForm({ ...form, author: v })} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            rows={3} placeholder="이 교육자료는..." value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </div>

      {/* 템플릿 선택 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">템플릿 (선택사항)</label>
        <select
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
        >
          <option value="">없음 (직접 설정)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
          ))}
        </select>
        {selectedTemplate && (
          <p className="mt-1 text-xs text-gray-500">
            {templates.find((t) => t.id === selectedTemplate)?.description}
          </p>
        )}
      </div>

      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? '생성 중...' : '🚀 프로젝트 만들기'}
      </button>
    </div>
  );
}

// ============================================================
// 탭 2: 참고자료 관리
// ============================================================
function ReferencesTab({ projectId }) {
  const [files, setFiles] = useState([]);
  const [totalSize, setTotalSize] = useState(0);
  const [uploading, setUploading] = useState(false);

  const loadFiles = async () => {
    if (!projectId) return;
    try {
      const data = await apiFetch(`/api/projects/${projectId}/references`);
      setFiles(data.files);
      setTotalSize(data.totalSize);
    } catch { }
  };

  useEffect(() => { loadFiles(); }, [projectId]);

  if (!projectId) {
    return <p className="text-gray-500">먼저 프로젝트를 선택하세요.</p>;
  }

  const handleUpload = async (e) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;

    setUploading(true);
    const formData = new FormData();
    for (const f of fileList) formData.append('files', f);

    try {
      await fetch(`/api/projects/${projectId}/references`, {
        method: 'POST', body: formData,
      });
      await loadFiles();
    } catch { }
    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (filename) => {
    try {
      await apiFetch(`/api/projects/${projectId}/references/${filename}`, { method: 'DELETE' });
      await loadFiles();
    } catch { }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">📚 참고자료 관리</h3>

      {/* 업로드 */}
      <div className="mb-6">
        <label className="block mb-2">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700">
            {uploading ? '업로드 중...' : '📤 파일 선택 및 업로드'}
          </span>
          <input type="file" multiple accept=".md,.txt,.markdown,.docx,.pdf"
            onChange={handleUpload} className="hidden" />
        </label>
      </div>

      {/* 통계 */}
      <div className="flex gap-6 mb-4 text-sm text-gray-600">
        <span>파일 수: <strong>{files.length}</strong></span>
        <span>전체 크기: <strong>{(totalSize / 1024).toFixed(1)} KB</strong></span>
      </div>

      {/* 파일 목록 */}
      {files.length === 0 ? (
        <p className="text-gray-400 text-sm">참고자료가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.name} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
              <div>
                <span className="text-sm font-medium">📄 {f.name}</span>
                <span className="ml-2 text-xs text-gray-400">{(f.size / 1024).toFixed(1)} KB</span>
              </div>
              <button onClick={() => handleDelete(f.name)}
                className="text-xs text-red-500 hover:text-red-700">삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 탭 3: 직접 입력
// ============================================================
function DirectInputTab({ projectId }) {
  if (!projectId) {
    return <p className="text-gray-500">먼저 프로젝트를 선택하세요.</p>;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">📝 목차 및 논의사항 직접 입력</h3>
      <p className="text-gray-500 text-sm">
        Phase 4에서 TOC 생성 기능과 함께 구현 예정입니다.
      </p>
    </div>
  );
}

// ============================================================
// 공통 컴포넌트
// ============================================================
function Field({ label, placeholder, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
