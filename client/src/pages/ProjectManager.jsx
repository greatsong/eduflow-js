import { useState, useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch } from '../api/client';

const TABS = ['프로젝트 설정', '참고자료', '직접 입력', '프롬프트 설정'];

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
          <option value="">+ 새 프로젝트 만들기</option>
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
      {activeTab === 0 && <ProjectSettingsTab project={currentProject} onCreated={fetchProjects} onUpdated={fetchProjects} />}
      {activeTab === 1 && <ReferencesTab projectId={currentProject?.name} />}
      {activeTab === 2 && <DirectInputTab projectId={currentProject?.name} />}
      {activeTab === 3 && <PromptSettingsTab projectId={currentProject?.name} />}
    </div>
  );
}

// ============================================================
// 탭 1: 프로젝트 설정 (새 프로젝트 / 기존 프로젝트 수정)
// ============================================================
function ProjectSettingsTab({ project, onCreated, onUpdated }) {
  const { selectProject } = useProjectStore();
  const [form, setForm] = useState({
    name: '', title: '', author: '', description: '', target_audience: '',
  });
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [tocPrompt, setTocPrompt] = useState('');
  const [chapterPrompt, setChapterPrompt] = useState('');

  // 템플릿 목록 로드
  useEffect(() => {
    apiFetch('/api/projects/templates/list').then(setTemplates).catch(() => {});
  }, []);

  // 기존 프로젝트 선택 시 정보 로드
  useEffect(() => {
    if (!project) {
      // 새 프로젝트 모드: 폼 초기화
      setForm({ name: '', title: '', author: '', description: '', target_audience: '' });
      setSelectedTemplate('');
      setTocPrompt('');
      setChapterPrompt('');
      setShowPromptEditor(false);
      setMessage('');
      return;
    }

    // 기존 프로젝트: 정보 로드
    setLoading(true);
    Promise.all([
      apiFetch(`/api/projects/${project.name}`).catch(() => ({})),
      apiFetch(`/api/projects/${project.name}/template-info`).catch(() => ({})),
    ]).then(([config, templateInfo]) => {
      setForm({
        name: project.name,
        title: config.title || project.title || '',
        author: config.author || '',
        description: config.description || '',
        target_audience: config.target_audience || '',
      });
      setSelectedTemplate(templateInfo.template_id || '');
      setTocPrompt(templateInfo.toc_prompt_addition || '');
      setChapterPrompt(templateInfo.chapter_prompt_addition || '');
      if (templateInfo.template_id) setShowPromptEditor(true);
    }).finally(() => setLoading(false));
  }, [project]);

  // 템플릿 선택 시 프롬프트 로드 (새 프로젝트 모드에서만)
  useEffect(() => {
    if (project) return; // 기존 프로젝트면 무시
    if (!selectedTemplate) {
      setTocPrompt('');
      setChapterPrompt('');
      setShowPromptEditor(false);
      return;
    }
    const tmpl = templates.find((t) => t.id === selectedTemplate);
    if (tmpl) {
      setTocPrompt(tmpl.toc_prompt_addition || '');
      setChapterPrompt(tmpl.chapter_prompt_addition || '');
    }
  }, [selectedTemplate, templates, project]);

  const handleCreate = async () => {
    if (!form.name || !form.title) {
      setError('프로젝트 ID와 제목은 필수입니다');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const body = {
        ...form,
        template_id: selectedTemplate || undefined,
        custom_prompt_config: selectedTemplate ? {
          toc_prompt_addition: tocPrompt,
          chapter_prompt_addition: chapterPrompt,
        } : undefined,
      };
      await apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(body) });
      await onCreated();
      selectProject(form.name);
      setMessage('프로젝트가 생성되었습니다!');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!form.title) {
      setError('제목은 필수입니다');
      return;
    }
    setError('');
    setSaving(true);
    try {
      // config.json 업데이트
      await apiFetch(`/api/projects/${project.name}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: form.title,
          author: form.author,
          description: form.description,
          target_audience: form.target_audience,
        }),
      });
      // template-info.json 업데이트
      await apiFetch(`/api/projects/${project.name}/template-info`, {
        method: 'PUT',
        body: JSON.stringify({
          template_id: selectedTemplate,
          toc_prompt_addition: tocPrompt,
          chapter_prompt_addition: chapterPrompt,
        }),
      });
      await onUpdated();
      setMessage('프로젝트가 업데이트되었습니다!');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-gray-500">프로젝트 정보 로딩 중...</div>;
  }

  const isEditMode = !!project;

  return (
    <div className="max-w-2xl">
      <h3 className="text-lg font-semibold mb-4">
        {isEditMode ? '✏️ 프로젝트 수정' : '🆕 새 프로젝트 만들기'}
      </h3>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      {message && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{message}</div>}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field
          label="프로젝트 ID"
          placeholder="my-book"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          disabled={isEditMode}
        />
        <Field label="제목" placeholder="나의 교육자료" value={form.title}
          onChange={(v) => setForm({ ...form, title: v })} />
        <Field label="작성자" placeholder="홍길동" value={form.author}
          onChange={(v) => setForm({ ...form, author: v })} />
        <Field label="대상 독자" placeholder="프로그래밍 입문자" value={form.target_audience}
          onChange={(v) => setForm({ ...form, target_audience: v })} />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          rows={3} placeholder="이 교육자료는..." value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>

      {/* 템플릿 선택 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">템플릿</label>
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

      {/* 프롬프트 편집 토글 */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setShowPromptEditor(!showPromptEditor)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
        >
          {showPromptEditor ? '▾ 프롬프트 설정 접기' : '▸ 프롬프트 설정 보기/수정'}
        </button>

        {showPromptEditor && (
          <div className="mt-3 space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                목차 생성 프롬프트 추가 지침
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed bg-white"
                rows={8}
                value={tocPrompt}
                onChange={(e) => setTocPrompt(e.target.value)}
                placeholder="목차 생성 시 AI에게 전달될 추가 지침..."
              />
              <p className="mt-1 text-xs text-gray-400">
                목차 자동 생성 시 이 지침이 프롬프트에 추가됩니다
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                챕터 작성 프롬프트 추가 지침
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed bg-white"
                rows={8}
                value={chapterPrompt}
                onChange={(e) => setChapterPrompt(e.target.value)}
                placeholder="챕터 작성 시 AI에게 전달될 추가 지침..."
              />
              <p className="mt-1 text-xs text-gray-400">
                각 챕터 생성 시 이 지침이 프롬프트에 추가됩니다
              </p>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={isEditMode ? handleUpdate : handleCreate}
        disabled={saving}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? '저장 중...' : isEditMode ? '💾 프로젝트 업데이트' : '🚀 프로젝트 만들기'}
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
  const [discussionText, setDiscussionText] = useState('');
  const [tocText, setTocText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [inputMode, setInputMode] = useState('discussion'); // 'discussion' | 'toc'

  useEffect(() => {
    if (!projectId) return;
    // 기존 데이터 로드 (master-context.md와 toc.md/toc.json)
    loadExistingData();
  }, [projectId]);

  const loadExistingData = async () => {
    try {
      // master-context.md (방향성 논의 요약)
      const contextRes = await fetch(`/api/projects/${projectId}/context`);
      if (contextRes.ok) {
        const data = await contextRes.json();
        if (data.content) setDiscussionText(data.content);
      }
    } catch {}

    try {
      // toc.md 또는 toc.json
      const tocRes = await fetch(`/api/projects/${projectId}/toc`);
      if (tocRes.ok) {
        const data = await tocRes.json();
        if (data.toc_md) setTocText(data.toc_md);
      }
    } catch {}
  };

  if (!projectId) {
    return <p className="text-gray-500">먼저 프로젝트를 선택하세요.</p>;
  }

  const handleSaveDiscussion = async () => {
    setSaving(true);
    setMessage('');
    try {
      await apiFetch(`/api/projects/${projectId}/context`, {
        method: 'PUT',
        body: JSON.stringify({ content: discussionText }),
      });
      setMessage('논의사항이 저장되었습니다!');
    } catch (e) {
      setMessage('저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveToc = async () => {
    setSaving(true);
    setMessage('');
    try {
      await apiFetch(`/api/projects/${projectId}/toc/direct`, {
        method: 'POST',
        body: JSON.stringify({ toc_md: tocText }),
      });
      setMessage('목차가 저장되었습니다!');
    } catch (e) {
      setMessage('저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h3 className="text-lg font-semibold mb-2">📝 목차 및 논의사항 직접 입력</h3>
      <p className="text-sm text-gray-500 mb-4">
        AI와의 대화 없이, 이미 정리된 목차나 논의사항을 직접 입력하여 바로 챕터 생성 단계로 이동할 수 있습니다.
      </p>

      {/* 모드 선택 */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setInputMode('discussion')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            inputMode === 'discussion' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          💬 논의사항 입력
        </button>
        <button
          onClick={() => setInputMode('toc')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            inputMode === 'toc' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          📋 목차 입력
        </button>
      </div>

      {inputMode === 'discussion' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            방향성 논의 내용 (master-context.md)
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed"
            rows={15}
            value={discussionText}
            onChange={(e) => setDiscussionText(e.target.value)}
            placeholder={`# 교육 목표
이 교육자료의 목표는...

# 대상 독자
- 프로그래밍 경험이 없는 입문자
- 자기주도 학습을 원하는 학습자

# 난이도
입문 ~ 초급

# 학습 시간
약 20차시 (1차시 = 50분)

# 주요 학습 내용
- 기초 개념 이해
- 실습 예제
- 프로젝트 진행`}
          />
          <p className="mt-1 text-xs text-gray-400">
            Markdown 형식으로 작성. AI 목차 생성 및 챕터 작성 시 참조됩니다.
          </p>
          <button
            onClick={handleSaveDiscussion}
            disabled={saving}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '💾 논의사항 저장'}
          </button>
        </div>
      )}

      {inputMode === 'toc' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            목차 직접 입력 (Markdown 형식)
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed"
            rows={15}
            value={tocText}
            onChange={(e) => setTocText(e.target.value)}
            placeholder={`# Part 1. 시작하기
## Chapter 1. 개발 환경 설정
- 예상 시간: 30분
- 학습 목표: 개발 환경을 구성할 수 있다

## Chapter 2. 첫 번째 프로그램
- 예상 시간: 50분
- 학습 목표: Hello World를 출력할 수 있다

# Part 2. 기초 개념
## Chapter 3. 변수와 자료형
- 예상 시간: 50분
- 학습 목표: 변수를 선언하고 사용할 수 있다`}
          />
          <p className="mt-1 text-xs text-gray-400">
            # Part, ## Chapter 형식으로 작성하면 자동으로 JSON 구조로 변환됩니다.
          </p>
          <button
            onClick={handleSaveToc}
            disabled={saving}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '💾 목차 저장 및 변환'}
          </button>
        </div>
      )}

      {message && (
        <p className={`mt-4 text-sm ${message.includes('실패') ? 'text-red-600' : 'text-green-600'}`}>
          {message}
        </p>
      )}
    </div>
  );
}

// ============================================================
// 탭 4: 프롬프트 설정
// ============================================================
function PromptSettingsTab({ projectId }) {
  const [templateInfo, setTemplateInfo] = useState(null);
  const [tocPrompt, setTocPrompt] = useState('');
  const [chapterPrompt, setChapterPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    apiFetch(`/api/projects/${projectId}/template-info`)
      .then((data) => {
        setTemplateInfo(data);
        setTocPrompt(data.toc_prompt_addition || '');
        setChapterPrompt(data.chapter_prompt_addition || '');
      })
      .catch(() => {
        setTemplateInfo({ exists: false });
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (!projectId) {
    return <p className="text-gray-500">먼저 프로젝트를 선택하세요.</p>;
  }

  if (loading) {
    return <p className="text-gray-400">로딩 중...</p>;
  }

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await apiFetch(`/api/projects/${projectId}/template-info`, {
        method: 'PUT',
        body: JSON.stringify({
          toc_prompt_addition: tocPrompt,
          chapter_prompt_addition: chapterPrompt,
        }),
      });
      setMessage('저장되었습니다!');
    } catch (e) {
      setMessage('저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h3 className="text-lg font-semibold mb-4">⚙️ 프롬프트 설정</h3>
      <p className="text-sm text-gray-500 mb-6">
        목차 생성 및 챕터 작성 시 AI에게 전달되는 추가 지침을 설정합니다.
        {templateInfo?.template_name && (
          <span className="ml-2 text-blue-600">
            (템플릿: {templateInfo.template_name})
          </span>
        )}
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            목차 생성 프롬프트 추가 지침
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed"
            rows={10}
            value={tocPrompt}
            onChange={(e) => setTocPrompt(e.target.value)}
            placeholder="목차 생성 시 AI에게 전달될 추가 지침..."
          />
          <p className="mt-1 text-xs text-gray-400">
            AI가 목차를 자동 생성할 때 이 지침이 프롬프트에 추가됩니다
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            챕터 작성 프롬프트 추가 지침
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed"
            rows={10}
            value={chapterPrompt}
            onChange={(e) => setChapterPrompt(e.target.value)}
            placeholder="챕터 작성 시 AI에게 전달될 추가 지침..."
          />
          <p className="mt-1 text-xs text-gray-400">
            AI가 각 챕터를 작성할 때 이 지침이 프롬프트에 추가됩니다
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '💾 저장'}
          </button>
          {message && (
            <span className={`text-sm ${message.includes('실패') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 공통 컴포넌트
// ============================================================
function Field({ label, placeholder, value, onChange, disabled = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm ${disabled ? 'bg-gray-100 text-gray-500' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
