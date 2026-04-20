import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { apiFetch, apiStreamPost, API_BASE } from '../api/client';
import { getAuthToken } from '../components/EntryForm';

const TABS = ['프로젝트 설정', '참고자료', '빠른 시작'];

// 간단한 마크다운 → HTML 변환
function simpleMarkdownToHtml(md) {
  if (!md) return '';
  let html = md;

  // 코드 블록 (```...```) — 먼저 처리하여 내부 내용이 다른 변환에 영향받지 않도록 함
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre style="background:#1e293b;color:#e2e8f0;border-radius:8px;padding:16px;overflow-x:auto;font-size:13px;line-height:1.5"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
    );
    return `__CODE_BLOCK_${idx}__`;
  });

  // 인라인 코드
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:0.9em">$1</code>');

  // 헤딩
  html = html.replace(/^#### (.+)$/gm, '<h4 style="font-size:1em;font-weight:700;margin:20px 0 8px;color:#1e293b">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:1.1em;font-weight:700;margin:24px 0 10px;color:#1e293b">$1</h3>');
  html = html.replace(/^## .+$/gm, ''); // 최상위 섹션 제목은 모달 헤더에 이미 표시

  // 볼드, 이탤릭
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 블록인용
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #93c5fd;padding:8px 16px;margin:12px 0;background:#eff6ff;color:#1e40af;border-radius:0 8px 8px 0">$1</blockquote>');

  // 테이블 (간단 처리)
  html = html.replace(/^\|(.+)\|$/gm, (match, inner) => {
    const cells = inner.split('|').map(c => c.trim());
    // 구분선 행 건너뛰기
    if (cells.every(c => /^[-:]+$/.test(c))) return '';
    const tag = 'td';
    const cellsHtml = cells.map(c => `<${tag} style="border:1px solid #e2e8f0;padding:6px 12px;font-size:0.85em">${c}</${tag}>`).join('');
    return `<tr>${cellsHtml}</tr>`;
  });
  // 테이블 행들을 table로 감싸기
  html = html.replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<table style="border-collapse:collapse;width:100%;margin:12px 0">$1</table>');

  // 리스트
  html = html.replace(/^- (.+)$/gm, '<li style="margin:4px 0;margin-left:20px;list-style:disc">$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li style="margin:4px 0;margin-left:20px;list-style:decimal">$2</li>');

  // 체크박스 리스트
  html = html.replace(/^- \[x\] (.+)$/gm, '<li style="margin:4px 0;margin-left:20px;list-style:none"><input type="checkbox" checked disabled> $1</li>');
  html = html.replace(/^- \[ \] (.+)$/gm, '<li style="margin:4px 0;margin-left:20px;list-style:none"><input type="checkbox" disabled> $1</li>');

  // details/summary
  html = html.replace(/<details><summary>(.+?)<\/summary>/g, '<details style="margin:12px 0;padding:8px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0"><summary style="cursor:pointer;font-weight:600;color:#475569">$1</summary>');

  // 단락: 빈 줄을 <br/>로 변환
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');

  // 코드 블록 복원
  codeBlocks.forEach((block, idx) => {
    html = html.replace(`__CODE_BLOCK_${idx}__`, block);
  });

  return html;
}

export default function ProjectManager() {
  const { projects, currentProject, fetchProjects, selectProject, clearProject } = useProjectStore();
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem('eduflow_pm_tab');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [userLimit, setUserLimit] = useState({ maxProjects: 99, projectCount: 0, isAdmin: false });

  const handleTabChange = (i) => {
    setActiveTab(i);
    sessionStorage.setItem('eduflow_pm_tab', String(i));
  };

  const fetchUserLimit = () => {
    apiFetch('/api/user/status')
      .then(data => setUserLimit({
        maxProjects: data.maxProjects || 1,
        projectCount: data.projectCount || 0,
        isAdmin: data.isAdmin || false,
      }))
      .catch(() => {});
  };

  useEffect(() => { fetchProjects(); fetchUserLimit(); }, []);

  const atLimit = !userLimit.isAdmin && userLimit.projectCount >= userLimit.maxProjects;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">📁 프로젝트 관리</h2>

      {/* 프로젝트 한도 정보 */}
      {!userLimit.isAdmin && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 ${
          atLimit ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
        }`}>
          <span className="font-medium">프로젝트: {userLimit.projectCount} / {userLimit.maxProjects}개</span>
          {atLimit && <span className="text-xs">— 한도에 도달했습니다. 관리자에게 한도 증가를 요청하세요.</span>}
        </div>
      )}

      {/* 프로젝트 선택 */}
      <div className="mb-6 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">프로젝트:</label>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          value={currentProject?.name || ''}
          onChange={(e) => e.target.value ? selectProject(e.target.value) : clearProject()}
        >
          {!atLimit && <option value="">+ 새 프로젝트 만들기</option>}
          {atLimit && !currentProject && <option value="">프로젝트를 선택하세요</option>}
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
            onClick={() => handleTabChange(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === i
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 0 && <ProjectSettingsTab project={currentProject} onCreated={() => { fetchProjects(); fetchUserLimit(); }} onUpdated={fetchProjects} atLimit={atLimit} />}
      {activeTab === 1 && <ReferencesTab projectId={currentProject?.name} />}
      {activeTab === 2 && <QuickStartTab projectId={currentProject?.name} />}
    </div>
  );
}

// ============================================================
// 탭 1: 프로젝트 설정 (새 프로젝트 / 기존 프로젝트 수정)
// ============================================================
function ProjectSettingsTab({ project, onCreated, onUpdated, atLimit }) {
  const { selectProject } = useProjectStore();
  const navigate = useNavigate();

  // 새 프로젝트 폼 임시저장 (페이지 이동 시 유지)
  const DRAFT_KEY = 'eduflow_project_draft';
  const loadDraft = () => {
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)); } catch { return null; }
  };
  const saveDraft = (data) => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  const clearDraft = () => sessionStorage.removeItem(DRAFT_KEY);

  const draft = !project ? loadDraft() : null;
  const [form, setForm] = useState(
    draft?.form || { name: '', title: '', author: '', description: '', target_audience: '' }
  );
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(draft?.selectedTemplate || '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPromptEditor, setShowPromptEditor] = useState(draft?.showPromptEditor || false);
  const [tocPrompt, setTocPrompt] = useState(draft?.tocPrompt || '');
  const [chapterPrompt, setChapterPrompt] = useState(draft?.chapterPrompt || '');
  const [includeHwDiagrams, setIncludeHwDiagrams] = useState(draft?.includeHwDiagrams || false);
  const [assessmentLevel, setAssessmentLevel] = useState(draft?.assessmentLevel ?? 2);
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [sampleContent, setSampleContent] = useState('');
  const [sampleTitle, setSampleTitle] = useState('');
  const [sampleLoading, setSampleLoading] = useState(false);

  // v2 템플릿 설계 상태
  const [templateMode, setTemplateMode] = useState(draft?.templateMode || 'v2');
  const [selectedWhat, setSelectedWhat] = useState(draft?.selectedWhat || '');
  const [selectedHow, setSelectedHow] = useState(draft?.selectedHow || '');
  const [selectedFeatures, setSelectedFeatures] = useState(draft?.selectedFeatures || []);
  const [contextAnswers, setContextAnswers] = useState(draft?.contextAnswers || {});
  const prevSelectedWhat = useRef(draft?.selectedWhat || '');
  const loadedProjectId = useRef(null); // 로드된 프로젝트 ID — 첫 useEffect 실행 시 리셋 방지
  const tocPromptDirty = useRef(false);
  const chapterPromptDirty = useRef(false);
  const [whats, setWhats] = useState([]);
  const [hows, setHows] = useState([]);
  const [features, setFeatures] = useState([]);
  const [compatibility, setCompatibility] = useState({ warnings: [] });
  const [defaultTocPrompt, setDefaultTocPrompt] = useState('');
  const [defaultChapterPrompt, setDefaultChapterPrompt] = useState('');

  // 새 프로젝트 폼 변경 시 자동 임시저장
  useEffect(() => {
    if (!project) {
      saveDraft({
        form, selectedTemplate, tocPrompt, chapterPrompt, showPromptEditor,
        includeHwDiagrams, assessmentLevel,
        templateMode, selectedWhat, selectedHow, selectedFeatures, contextAnswers,
      });
    }
  }, [form, selectedTemplate, tocPrompt, chapterPrompt, showPromptEditor,
      includeHwDiagrams, assessmentLevel,
      templateMode, selectedWhat, selectedHow, selectedFeatures, contextAnswers, project]);

  // 클래식 템플릿 목록 로드
  useEffect(() => {
    apiFetch('/api/projects/templates/list').then(setTemplates).catch(() => {});
  }, []);

  // v2 템플릿 목록 로드
  useEffect(() => {
    Promise.all([
      apiFetch('/api/projects/templates/whats').catch(() => []),
      apiFetch('/api/projects/templates/hows').catch(() => []),
      apiFetch('/api/projects/templates/features').catch(() => []),
    ]).then(([w, h, f]) => {
      setWhats(Array.isArray(w) ? w : []);
      setHows(Array.isArray(h) ? h : []);
      setFeatures(Array.isArray(f) ? f : []);
    });
  }, []);

  // WHAT 또는 HOW 변경 시 기본 기능 자동 선택 + 호환성 체크
  useEffect(() => {
    if (!selectedWhat || !selectedHow) {
      setCompatibility({ warnings: [] });
      return;
    }
    const what = whats.find(w => w.id === selectedWhat);
    const how = hows.find(h => h.id === selectedHow);
    if (!what || !how) return;

    // 기본 기능 자동 선택 (기존 프로젝트 로드 직후에는 저장된 features 유지)
    if (loadedProjectId.current) {
      // 로드된 프로젝트의 첫 useEffect 실행 — 건너뛰고 플래그 해제
      loadedProjectId.current = null;
    } else {
      const defaults = [...new Set([...(what.default_features || []), ...(how.default_features || [])])];
      const forbidden = new Set([...(what.forbidden_features || []), ...(how.forbidden_features || [])]);
      setSelectedFeatures(defaults.filter(f => !forbidden.has(f)));
    }

    // 호환성 경고 생성
    const warnings = [];
    const whatForbidden = what.forbidden_features || [];
    const howForbidden = how.forbidden_features || [];
    const howDefaults = how.default_features || [];
    const whatDefaults = what.default_features || [];
    for (const fId of whatDefaults) {
      if (howForbidden.includes(fId)) {
        const feat = features.find(f => f.id === fId);
        if (feat) warnings.push(`"${what.name}"의 기본 기능 "${feat.name}"은(는) "${how.name}" 모델과 호환되지 않아 비활성화됩니다.`);
      }
    }
    for (const fId of howDefaults) {
      if (whatForbidden.includes(fId)) {
        const feat = features.find(f => f.id === fId);
        if (feat) warnings.push(`"${how.name}"의 기본 기능 "${feat.name}"은(는) "${what.name}" 교과와 호환되지 않아 비활성화됩니다.`);
      }
    }
    setCompatibility({ warnings });

    // WHAT이 실제로 변경된 경우에만 컨텍스트 답변 리셋
    if (prevSelectedWhat.current && prevSelectedWhat.current !== selectedWhat) {
      setContextAnswers({});
      prevSelectedWhat.current = selectedWhat;
    }
  }, [selectedWhat, selectedHow, whats, hows, features]);

  // v2: WHAT/HOW/FEATURES 변경 시 디폴트 프롬프트 로드
  useEffect(() => {
    if (templateMode !== 'v2' || !selectedWhat || !selectedHow) {
      setDefaultTocPrompt('');
      setDefaultChapterPrompt('');
      return;
    }
    apiFetch('/api/projects/templates/compose-preview', {
      method: 'POST',
      body: JSON.stringify({ what_id: selectedWhat, how_id: selectedHow, features: selectedFeatures }),
    }).then((data) => {
      setDefaultTocPrompt(data.tocAddition || '');
      setDefaultChapterPrompt(data.chapterAddition || '');
      // 사용자가 직접 수정하지 않았으면 디폴트로 채움
      if (!tocPromptDirty.current) setTocPrompt(data.tocAddition || '');
      if (!chapterPromptDirty.current) setChapterPrompt(data.chapterAddition || '');
    }).catch(() => {});
  }, [selectedWhat, selectedHow, selectedFeatures, templateMode]);

  // 기존 프로젝트 선택 시 정보 로드
  useEffect(() => {
    if (!project) {
      // 새 프로젝트 모드: draft가 있으면 유지됨 (이미 useState에서 로드)
      // 이전 프로젝트에서 설정된 dirty 플래그를 해제해, 새 프로젝트 모드에서는
      // WHAT/HOW 선택 시 기본 프롬프트가 정상적으로 자동 채워지도록 한다.
      tocPromptDirty.current = false;
      chapterPromptDirty.current = false;
      setMessage('');
      return;
    }
    // 기존 프로젝트 선택 시 draft 삭제
    clearDraft();
    // 프로젝트 전환 시 dirty 플래그 초기화. 로드 완료 후 저장값 존재 여부에 따라
    // 다시 true로 설정된다 (아래 .then() 블록).
    tocPromptDirty.current = false;
    chapterPromptDirty.current = false;

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
      const loadedTocPrompt = templateInfo.toc_prompt_addition || '';
      const loadedChapterPrompt = templateInfo.chapter_prompt_addition || '';
      setTocPrompt(loadedTocPrompt);
      setChapterPrompt(loadedChapterPrompt);
      // 저장된 프롬프트가 존재하면 dirty로 표시하여, 직후의 compose-preview useEffect가
      // 이를 기본값으로 덮어쓰지 못하도록 보호한다. (기존 프로젝트 편집 시 커스텀 프롬프트 유실 방지)
      tocPromptDirty.current = loadedTocPrompt.length > 0;
      chapterPromptDirty.current = loadedChapterPrompt.length > 0;
      setIncludeHwDiagrams(config.include_hw_diagrams || false);
      setAssessmentLevel(config.assessment_level ?? 2);
      if (templateInfo.template_id) setShowPromptEditor(true);
      // v2 정보 로드 (template-info.json에 저장됨)
      if (templateInfo.what_id) {
        setTemplateMode('v2');
        // loadedProjectId 설정 → useEffect 첫 실행 시 features 덮어쓰기 방지
        loadedProjectId.current = project.name;
        prevSelectedWhat.current = templateInfo.what_id;
        setSelectedWhat(templateInfo.what_id || '');
        setSelectedHow(templateInfo.how_id || '');
        setSelectedFeatures(templateInfo.features || []);
        setContextAnswers(templateInfo.context_answers || {});
      } else if (templateInfo.template_id) {
        setTemplateMode('classic');
      }
    }).finally(() => setLoading(false));
  }, [project]);

  // 클래식 모드: 템플릿 선택 시 프롬프트 로드 (새 프로젝트 모드에서만)
  useEffect(() => {
    if (project) return; // 기존 프로젝트면 무시
    if (templateMode !== 'classic') return;
    if (!selectedTemplate) {
      setTocPrompt('');
      setChapterPrompt('');
      setShowPromptEditor(false);
      return;
    }
    const tmpl = templates.find((t) => t.id === selectedTemplate);
    if (tmpl) {
      // 사용자가 직접 수정한 프롬프트는 덮어쓰지 않음
      if (!tocPromptDirty.current) setTocPrompt(tmpl.toc_prompt_addition || '');
      if (!chapterPromptDirty.current) setChapterPrompt(tmpl.chapter_prompt_addition || '');
    }
  }, [selectedTemplate, templates, project, templateMode]);

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
        include_hw_diagrams: selectedFeatures.includes('hw_diagrams'),
        assessment_level: assessmentLevel,
      };

      if (selectedWhat && selectedHow) {
        body.what_id = selectedWhat;
        body.how_id = selectedHow;
        body.features = selectedFeatures;
        body.context_answers = contextAnswers;
      }
      // 프롬프트 추가 지침이 있으면 포함
      if (tocPrompt || chapterPrompt) {
        body.custom_prompt_config = {
          toc_prompt_addition: tocPrompt,
          chapter_prompt_addition: chapterPrompt,
        };
      }

      await apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(body) });
      clearDraft(); // 생성 완료 후 임시저장 삭제
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
          include_hw_diagrams: selectedFeatures.includes('hw_diagrams'),
          assessment_level: assessmentLevel,
        }),
      });
      // template-info.json 업데이트 (v2 정보 포함)
      const templateInfoBody = {
        toc_prompt_addition: tocPrompt,
        chapter_prompt_addition: chapterPrompt,
      };
      if (selectedWhat && selectedHow) {
        templateInfoBody.what_id = selectedWhat;
        templateInfoBody.how_id = selectedHow;
        templateInfoBody.features = selectedFeatures;
        templateInfoBody.context_answers = contextAnswers;
      }
      await apiFetch(`/api/projects/${project.name}/template-info`, {
        method: 'PUT',
        body: JSON.stringify(templateInfoBody),
      });
      await onUpdated();
      setMessage('updated');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleShowSample = async () => {
    if (!selectedTemplate) return;
    setSampleLoading(true);
    setSampleContent('');
    setSampleTitle('');
    try {
      const data = await apiFetch(`/api/projects/templates/samples/${selectedTemplate}`);
      setSampleContent(data.content);
      setSampleTitle(data.title);
      setShowSampleModal(true);
    } catch (e) {
      setError('샘플을 불러올 수 없습니다: ' + e.message);
    } finally {
      setSampleLoading(false);
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
      {message && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700 font-medium">
            {message === 'updated' ? '프로젝트가 업데이트되었습니다!' : message}
          </p>
        </div>
      )}

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

      {/* 교재 설계 (v2 모드) */}
      {(
        <div className="space-y-6 mb-6">
          {/* STEP 1: 교과 영역 */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">1</span>
              교과 영역
            </h4>
            <p className="text-sm text-gray-500 mb-3">교과별로 최적화된 프롬프트와 세부 설정이 제공됩니다</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {whats.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWhat(w.id)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                    selectedWhat === w.id
                      ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-2xl">{w.icon}</span>
                  <span className="text-sm font-medium text-gray-800">{w.name}</span>
                  {w.description && (
                    <span className="text-xs text-gray-400 leading-tight line-clamp-2">{w.description}</span>
                  )}
                </button>
              ))}
            </div>

            {/* 교과 컨텍스트 질문 */}
            {selectedWhat && (() => {
              const what = whats.find(w => w.id === selectedWhat);
              if (!what?.context_questions?.length) return null;
              return (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                  <h5 className="text-sm font-medium text-gray-700">교과 세부 설정</h5>
                  {what.context_questions.map(q => (
                    <div key={q.id}>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                      </label>
                      {q.type === 'select' ? (
                        <select
                          value={contextAnswers[q.id] || ''}
                          onChange={e => {
                            const scrollEl = document.querySelector('main [class*="overflow-y-auto"]');
                            const scrollTop = scrollEl?.scrollTop ?? 0;
                            setContextAnswers({ ...contextAnswers, [q.id]: e.target.value });
                            requestAnimationFrame(() => { if (scrollEl) scrollEl.scrollTop = scrollTop; });
                          }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                        >
                          <option value="">선택하세요</option>
                          {(q.options || []).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : q.type === 'textarea' ? (
                        <textarea
                          value={contextAnswers[q.id] || ''}
                          onChange={e => setContextAnswers({ ...contextAnswers, [q.id]: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          rows={3}
                          placeholder={q.placeholder || ''}
                        />
                      ) : (
                        <input
                          type="text"
                          value={contextAnswers[q.id] || ''}
                          onChange={e => setContextAnswers({ ...contextAnswers, [q.id]: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          placeholder={q.placeholder || ''}
                        />
                      )}
                      {q.help && <p className="text-xs text-gray-400 mt-1">{q.help}</p>}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* STEP 2: 교육 모델 */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">2</span>
              교육 모델
            </h4>
            <p className="text-sm text-gray-500 mb-3">어떤 형태로 만드나요?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {hows.map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setSelectedHow(h.id)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                    selectedHow === h.id
                      ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-2xl">{h.icon}</span>
                  <span className="text-sm font-medium text-gray-800">{h.name}</span>
                  {h.educational_model && (
                    <span className="text-xs text-gray-400">{h.educational_model}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* STEP 3: 기능 옵션 */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">3</span>
              기능 옵션
            </h4>
            <p className="text-sm text-gray-500 mb-3">어떤 도구를 사용하나요?</p>

            {/* 카테고리별 그룹 */}
            {[...new Set(features.map(f => f.category))].map(cat => {
              const catFeatures = features.filter(f => f.category === cat);
              if (catFeatures.length === 0) return null;
              const whatObj = whats.find(w => w.id === selectedWhat);
              const howObj = hows.find(h => h.id === selectedHow);
              const forbidden = new Set([
                ...(whatObj?.forbidden_features || []),
                ...(howObj?.forbidden_features || []),
              ]);
              return (
                <div key={cat} className="mb-3">
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{cat}</span>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {catFeatures.map(f => {
                      const isForbidden = forbidden.has(f.id);
                      const isChecked = selectedFeatures.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          disabled={isForbidden}
                          onClick={() => {
                            if (isForbidden) return;
                            setSelectedFeatures(prev =>
                              prev.includes(f.id)
                                ? prev.filter(id => id !== f.id)
                                : [...prev, f.id]
                            );
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                            isForbidden
                              ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                              : isChecked
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <span>{f.icon}</span>
                          <span>{f.name}</span>
                          {isForbidden && <span className="text-xs text-gray-400">(비호환)</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* 호환성 경고 */}
            {compatibility.warnings.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-1">
                {compatibility.warnings.map((w, i) => (
                  <p key={i}>&#9888;&#65039; {w}</p>
                ))}
              </div>
            )}
          </div>

          {/* v2 평가 단계 옵션 */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">평가 방식</label>
            <select
              value={assessmentLevel}
              onChange={(e) => setAssessmentLevel(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-full max-w-md"
            >
              <option value={0}>평가 없음 — 학습 내용만</option>
              <option value={1}>자기점검 — 체크리스트</option>
              <option value={2}>확인 문제 — 객관식+서술형 (기본)</option>
              <option value={3}>형성 평가 — 난이도별 문제+자기점검</option>
              <option value={4}>인터랙티브 — 채점+피드백+재도전</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {assessmentLevel === 4 ? '퀴즈 엔진이 배포 웹사이트에 자동 포함됩니다' : '챕터 끝에 선택한 방식의 평가가 포함됩니다'}
            </p>
          </div>

          {/* v2 선택 요약 */}
          {selectedWhat && selectedHow && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
              <span className="font-medium">설계 요약:</span>{' '}
              {whats.find(w => w.id === selectedWhat)?.icon}{' '}
              {whats.find(w => w.id === selectedWhat)?.name}{' + '}
              {hows.find(h => h.id === selectedHow)?.icon}{' '}
              {hows.find(h => h.id === selectedHow)?.name}
              {selectedFeatures.length > 0 && (
                <span className="text-emerald-600">
                  {' '}({selectedFeatures.length}개 기능 선택)
                </span>
              )}
            </div>
          )}
          {/* 프롬프트 편집 토글 */}
          <div>
            <button
              type="button"
              onClick={() => setShowPromptEditor(!showPromptEditor)}
              className="text-sm text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1"
            >
              {showPromptEditor ? '▾ 프롬프트 설정 접기' : '▸ 프롬프트 설정 보기/수정'}
            </button>

            {showPromptEditor && (
              <div className="mt-3 space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      목차 생성 프롬프트
                    </label>
                    {defaultTocPrompt && tocPrompt !== defaultTocPrompt && (
                      <button
                        type="button"
                        onClick={() => { tocPromptDirty.current = false; setTocPrompt(defaultTocPrompt); }}
                        className="text-xs text-emerald-600 hover:text-emerald-800"
                      >
                        기본값 복원
                      </button>
                    )}
                  </div>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed bg-white"
                    rows={8}
                    value={tocPrompt}
                    onChange={(e) => { tocPromptDirty.current = true; setTocPrompt(e.target.value); }}
                    placeholder={defaultTocPrompt ? '' : '교육모델/기능을 선택하면 기본 프롬프트가 자동으로 채워집니다'}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    {tocPrompt ? '이 프롬프트가 목차 생성 시 AI에게 전달됩니다 (직접 편집 가능)' : '교육모델과 기능 옵션을 선택하면 기본 프롬프트가 자동 생성됩니다'}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      챕터 작성 프롬프트
                    </label>
                    {defaultChapterPrompt && chapterPrompt !== defaultChapterPrompt && (
                      <button
                        type="button"
                        onClick={() => { chapterPromptDirty.current = false; setChapterPrompt(defaultChapterPrompt); }}
                        className="text-xs text-emerald-600 hover:text-emerald-800"
                      >
                        기본값 복원
                      </button>
                    )}
                  </div>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed bg-white"
                    rows={8}
                    value={chapterPrompt}
                    onChange={(e) => { chapterPromptDirty.current = true; setChapterPrompt(e.target.value); }}
                    placeholder={defaultChapterPrompt ? '' : '교육모델/기능을 선택하면 기본 프롬프트가 자동으로 채워집니다'}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    {chapterPrompt ? '이 프롬프트가 각 챕터 생성 시 AI에게 전달됩니다 (직접 편집 가능)' : '교육모델과 기능 옵션을 선택하면 기본 프롬프트가 자동 생성됩니다'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 샘플 미리보기 모달 (클래식 모드에서 사용) */}
      {showSampleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSampleModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">샘플 미리보기</h3>
                <p className="text-sm text-gray-500 mt-0.5">{sampleTitle}</p>
              </div>
              <button
                onClick={() => setShowSampleModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* 모달 본문 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div
                className="text-sm leading-relaxed text-gray-800"
                dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(sampleContent) }}
              />
            </div>
            {/* 모달 하단 */}
            <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center">
              <p className="text-xs text-gray-400">이 템플릿으로 생성되는 챕터의 예시입니다</p>
              <button
                onClick={() => setShowSampleModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 한도 도달 시 새 프로젝트 생성 차단 */}
      {!isEditMode && atLimit ? (
        <div className="w-full py-3 bg-gray-100 text-gray-500 rounded-lg font-medium text-center border border-gray-200">
          프로젝트 한도에 도달하여 새 프로젝트를 만들 수 없습니다
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={isEditMode ? handleUpdate : handleCreate}
            disabled={saving}
            className={`${isEditMode ? 'flex-1' : 'w-full'} py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors`}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isEditMode ? '업데이트 중...' : '프로젝트 생성 중...'}
              </span>
            ) : isEditMode ? '💾 프로젝트 업데이트' : '🚀 프로젝트 만들기'}
          </button>
          {isEditMode && (
            <button
              onClick={() => navigate('/discussion')}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              💬 방향성 논의 →
            </button>
          )}
        </div>
      )}
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
  const [showPaste, setShowPaste] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteFormat, setPasteFormat] = useState('text');
  const [pasteSaving, setPasteSaving] = useState(false);

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
      const headers = {};
      const token = getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${API_BASE}/api/projects/${projectId}/references`, {
        method: 'POST', headers, body: formData,
      });
      await loadFiles();
    } catch { }
    setUploading(false);
    e.target.value = '';
  };

  const handlePaste = async () => {
    if (!pasteTitle.trim() || !pasteContent.trim()) return;
    setPasteSaving(true);
    try {
      await apiFetch(`/api/projects/${projectId}/references/paste`, {
        method: 'POST',
        body: JSON.stringify({ title: pasteTitle.trim(), content: pasteContent, format: pasteFormat }),
      });
      setPasteTitle('');
      setPasteContent('');
      setShowPaste(false);
      await loadFiles();
    } catch { }
    setPasteSaving(false);
  };

  const handleDelete = async (filename) => {
    try {
      await apiFetch(`/api/projects/${projectId}/references/${filename}`, { method: 'DELETE' });
      await loadFiles();
    } catch { }
  };

  const formatIcon = (f) => {
    const icons = { pdf: '📕', docx: '📘', xlsx: '📊', xls: '📊', html: '🌐', htm: '🌐', hwp: '📝', hwpx: '📝', md: '📄', txt: '📄', csv: '📋', json: '📋' };
    return icons[f.format] || '📄';
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">참고자료 관리</h3>

      {/* 안내 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <p className="font-medium mb-1">교과서, 교육과정 문서, 수업 자료 등을 올리면 AI가 교재 생성 시 참고합니다.</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
          {['PDF', 'DOCX', 'XLSX', 'HTML', 'HWP', 'HWPX', 'TXT', 'MD', 'CSV', 'JSON'].map(fmt => (
            <span key={fmt} className="text-blue-600">{fmt} ✓</span>
          ))}
        </div>
        <p className="mt-1 text-xs text-blue-500">파일당 최대 50MB · 최대 20개</p>
      </div>

      {/* 파일 업로드 */}
      <div className="mb-4">
        <label className="block">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-emerald-700">
            {uploading ? '업로드 중...' : '📤 파일 업로드'}
          </span>
          <input type="file" multiple
            accept=".md,.txt,.markdown,.docx,.pdf,.csv,.xlsx,.xls,.json,.html,.htm,.hwp,.hwpx"
            onChange={handleUpload} className="hidden" />
        </label>
      </div>

      {/* 텍스트 복붙 */}
      <div className="mb-6">
        <button
          onClick={() => setShowPaste(!showPaste)}
          className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
        >
          <span>{showPaste ? '▾' : '▸'}</span>
          <span>텍스트 직접 입력 (복붙)</span>
        </button>

        {showPaste && (
          <div className="mt-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <input
              type="text"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="제목 (예: 교육과정 성취기준)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
            />
            <div className="flex gap-4 mb-3 text-sm">
              {[
                { value: 'text', label: '텍스트' },
                { value: 'html', label: 'HTML' },
                { value: 'markdown', label: '마크다운' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio" name="pasteFormat" value={opt.value}
                    checked={pasteFormat === opt.value}
                    onChange={(e) => setPasteFormat(e.target.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <textarea
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder="웹에서 복사한 내용, HTML 코드, 교육과정 텍스트 등을 붙여넣으세요..."
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            />
            <button
              onClick={handlePaste}
              disabled={pasteSaving || !pasteTitle.trim() || !pasteContent.trim()}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {pasteSaving ? '저장 중...' : '참고자료로 저장'}
            </button>
          </div>
        )}
      </div>

      {/* 통계 */}
      <div className="flex gap-6 mb-4 text-sm text-gray-600">
        <span>파일 수: <strong>{files.length}</strong></span>
        <span>전체 크기: <strong>{totalSize >= 1048576 ? `${(totalSize / 1048576).toFixed(1)} MB` : `${(totalSize / 1024).toFixed(1)} KB`}</strong></span>
      </div>

      {/* 파일 목록 */}
      {files.length === 0 ? (
        <p className="text-gray-400 text-sm">참고자료가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.name} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">{formatIcon(f)}</span>
                <span className="text-sm font-medium truncate">{f.name}</span>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {f.size >= 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${(f.size / 1024).toFixed(1)} KB`}
                </span>
                {f.parseable ? (
                  <span className="text-xs text-emerald-600 whitespace-nowrap" title="AI가 이 파일의 내용을 참고합니다">✅</span>
                ) : (
                  <span className="text-xs text-amber-500 whitespace-nowrap" title="이 형식은 텍스트 추출이 불가능합니다">⚠️</span>
                )}
              </div>
              <button onClick={() => handleDelete(f.name)}
                className="text-xs text-red-500 hover:text-red-700 ml-2 whitespace-nowrap">삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 탭 3: 프롬프트 설정
// ============================================================
function PromptSettingsTab({ projectId }) {
  const [templateInfo, setTemplateInfo] = useState(null);
  const [tocPrompt, setTocPrompt] = useState('');
  const [chapterPrompt, setChapterPrompt] = useState('');
  const [defaultTocPrompt, setDefaultTocPrompt] = useState('');
  const [defaultChapterPrompt, setDefaultChapterPrompt] = useState('');
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
        // v2 프로젝트: 디폴트 프롬프트 로드 (기본값 복원용)
        if (data.version === 2 && data.what_id && data.how_id) {
          apiFetch('/api/projects/templates/compose-preview', {
            method: 'POST',
            body: JSON.stringify({
              what_id: data.what_id,
              how_id: data.how_id,
              features: data.features || [],
            }),
          }).then((preview) => {
            setDefaultTocPrompt(preview.tocAddition || '');
            setDefaultChapterPrompt(preview.chapterAddition || '');
          }).catch(() => {});
        }
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
        교육모델과 기능 옵션에 따라 자동 생성된 프롬프트입니다. 직접 편집하여 AI의 생성 결과를 조정할 수 있습니다.
        {templateInfo?.template_name && (
          <span className="ml-2 text-emerald-600">
            (템플릿: {templateInfo.template_name})
          </span>
        )}
      </p>

      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              목차 생성 프롬프트
            </label>
            {defaultTocPrompt && tocPrompt !== defaultTocPrompt && (
              <button
                type="button"
                onClick={() => setTocPrompt(defaultTocPrompt)}
                className="text-xs text-emerald-600 hover:text-emerald-800"
              >
                기본값 복원
              </button>
            )}
          </div>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed"
            rows={10}
            value={tocPrompt}
            onChange={(e) => setTocPrompt(e.target.value)}
            placeholder="교육모델에 따른 기본 프롬프트가 표시됩니다"
          />
          <p className="mt-1 text-xs text-gray-400">
            이 프롬프트가 목차 생성 시 AI에게 전달됩니다 (직접 편집 가능)
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              챕터 작성 프롬프트
            </label>
            {defaultChapterPrompt && chapterPrompt !== defaultChapterPrompt && (
              <button
                type="button"
                onClick={() => setChapterPrompt(defaultChapterPrompt)}
                className="text-xs text-emerald-600 hover:text-emerald-800"
              >
                기본값 복원
              </button>
            )}
          </div>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed"
            rows={10}
            value={chapterPrompt}
            onChange={(e) => setChapterPrompt(e.target.value)}
            placeholder="교육모델에 따른 기본 프롬프트가 표시됩니다"
          />
          <p className="mt-1 text-xs text-gray-400">
            이 프롬프트가 각 챕터 생성 시 AI에게 전달됩니다 (직접 편집 가능)
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
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
// 탭 4: 빠른 시작 (AI 분석 + 직접 입력 통합)
// ============================================================
function QuickStartTab({ projectId }) {
  const navigate = useNavigate();
  const { refreshProgress } = useProjectStore();
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState('ai'); // 'ai' | 'manual'

  // AI 분석 모드 state
  const [mdContent, setMdContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileObj, setFileObj] = useState(null); // PDF/DOCX 등 바이너리 파일용
  const [fileIsBinary, setFileIsBinary] = useState(false);
  const [saveAsRef, setSaveAsRef] = useState(true);
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [models, setModels] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [done, setDone] = useState(false);

  // 빠른 시작에서 지원하는 파일 포맷
  const SUPPORTED_EXTS = '.md,.txt,.markdown,.pdf,.docx,.xlsx,.xls,.html,.htm,.hwp,.hwpx,.csv,.json';
  const TEXT_EXTS = ['.md', '.txt', '.markdown', '.text', '.csv', '.json', '.html', '.htm'];
  const BINARY_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB — multer 한도와 동일

  // 직접 입력 모드 state
  const [discussionText, setDiscussionText] = useState('');
  const [tocText, setTocText] = useState('');
  const [inputMode, setInputMode] = useState('discussion');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiFetch('/api/models').then((d) => {
      setModels(d.models);
      apiFetch('/api/models/default/conversation').then((r) => setModel(r.modelId)).catch(() => {});
    }).catch(() => {});
  }, []);

  // 직접 입력 모드에서 기존 데이터 로드
  useEffect(() => {
    if (!projectId || mode !== 'manual') return;
    apiFetch(`/api/projects/${projectId}/context`)
      .then(data => { if (data?.content) setDiscussionText(data.content); })
      .catch(() => {});
    apiFetch(`/api/projects/${projectId}/toc`)
      .then(data => { if (data?.toc_md) setTocText(data.toc_md); })
      .catch(() => {});
  }, [projectId, mode]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();

    // 크기 검증
    if (file.size > BINARY_SIZE_LIMIT) {
      setLogs((prev) => [...prev, `❌ 파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 50MB 이하로 분할해주세요.`]);
      return;
    }

    setFileName(file.name);
    setMdContent('');
    setFileObj(null);

    if (TEXT_EXTS.includes(ext)) {
      // 텍스트 계열 — 기존처럼 클라이언트에서 미리보기
      setFileIsBinary(false);
      const reader = new FileReader();
      reader.onload = (ev) => setMdContent(ev.target.result);
      reader.readAsText(file);
    } else {
      // 바이너리 (PDF/DOCX/HWP/XLSX 등) — 서버로 직접 업로드해 파싱
      setFileIsBinary(true);
      setFileObj(file);
    }
  };

  const handleProcess = async () => {
    if (!projectId) return;
    if (!fileIsBinary && !mdContent) return;
    if (fileIsBinary && !fileObj) return;

    setProcessing(true);
    setLogs([]);
    setDone(false);

    try {
      if (fileIsBinary) {
        // 새 엔드포인트 — 서버에서 파싱 후 TOC 생성
        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('model', model);
        formData.append('saveAsReference', String(saveAsRef));

        await apiStreamPost(
          `/api/projects/${projectId}/toc/parse-file`,
          formData,
          {
            onProgress: (data) => setLogs((prev) => [...prev, data.message]),
            onDone: () => { setProcessing(false); setDone(true); refreshProgress(); },
            onError: (err) => { setLogs((prev) => [...prev, `❌ 오류: ${err.message}`]); setProcessing(false); },
          }
        );
      } else {
        // 기존 MD/TXT 경로
        await apiStreamPost(
          `/api/projects/${projectId}/toc/parse-md`,
          { content: mdContent, model, saveAsReference: saveAsRef },
          {
            onProgress: (data) => setLogs((prev) => [...prev, data.message]),
            onDone: () => { setProcessing(false); setDone(true); refreshProgress(); },
            onError: (err) => { setLogs((prev) => [...prev, `❌ 오류: ${err.message}`]); setProcessing(false); },
          }
        );
      }
    } catch (err) {
      setLogs((prev) => [...prev, `❌ 오류: ${err.message}`]);
      setProcessing(false);
    }
  };

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

  if (!projectId) {
    return <p className="text-gray-500">먼저 프로젝트를 선택하세요.</p>;
  }

  return (
    <div className="max-w-3xl">
      <h3 className="text-lg font-semibold mb-2">🚀 빠른 시작</h3>
      <p className="text-sm text-gray-500 mb-4">
        Step 1~3을 건너뛰고 바로 챕터 제작 단계로 이동합니다.
      </p>

      {/* 모드 선택 */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('ai')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'ai' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🤖 AI 분석 (MD 파일 업로드)
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'manual' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          ✏️ 직접 입력
        </button>
      </div>

      {mode === 'ai' && (
        <>
          {/* 파일 업로드 */}
          <div className="mb-4">
            <label className="block mb-2">
              <span
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-emerald-700"
              >
                📤 파일 선택 (MD/TXT/PDF/DOCX/HWP/XLSX 등)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_EXTS}
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            {fileName && !fileIsBinary && (
              <p className="text-sm text-green-600 mt-1">📄 {fileName} ({mdContent.length.toLocaleString()}자)</p>
            )}
            {fileName && fileIsBinary && fileObj && (
              <p className="text-sm text-green-600 mt-1">
                📄 {fileName} ({(fileObj.size / 1024).toFixed(0)}KB) — 서버에서 파싱됩니다
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              * PDF/DOCX 등 바이너리 파일은 서버에서 텍스트를 추출해 목차를 자동 생성합니다. 최대 50MB.
            </p>
          </div>

          {mdContent && !fileIsBinary && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">미리보기</label>
              <textarea
                value={mdContent}
                onChange={(e) => setMdContent(e.target.value)}
                className="w-full h-48 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed"
              />
            </div>
          )}

          {/* 옵션 */}
          <div className="mb-4 flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={saveAsRef} onChange={(e) => setSaveAsRef(e.target.checked)} className="rounded" />
              참고자료로도 저장
            </label>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">모델:</label>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white">
                {models.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
              </select>
            </div>
          </div>

          <button
            onClick={handleProcess}
            disabled={processing || (!fileIsBinary && !mdContent) || (fileIsBinary && !fileObj)}
            className="w-full py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {processing ? '분석 중...' : '🚀 목차 분석 & 빠른 시작'}
          </button>

          {logs.length > 0 && (
            <div className="mt-4 bg-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto">
              {logs.map((log, i) => (<div key={i} className="text-xs text-gray-300 py-0.5 font-mono">{log}</div>))}
            </div>
          )}

          {done && (
            <div className="mt-4 space-y-2">
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-700 font-medium">✅ 빠른 시작 완료!</p>
                <p className="text-xs text-green-600 mt-1">Step 1~3이 자동 완료되었습니다.</p>
              </div>
              <button onClick={() => navigate('/chapters')} className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                ✍️ Step 4: 챕터 제작으로 →
              </button>
            </div>
          )}
        </>
      )}

      {mode === 'manual' && (
        <>
          {/* 직접 입력 서브모드 */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setInputMode('discussion')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                inputMode === 'discussion' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              💬 논의사항 입력
            </button>
            <button
              onClick={() => setInputMode('toc')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                inputMode === 'toc' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📋 목차 입력
            </button>
          </div>

          {inputMode === 'discussion' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">방향성 논의 내용 (master-context.md)</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed"
                rows={12}
                value={discussionText}
                onChange={(e) => setDiscussionText(e.target.value)}
                placeholder={`# 교육 목표\n이 교육자료의 목표는...\n\n# 대상 독자\n- 프로그래밍 경험이 없는 입문자\n\n# 학습 시간\n약 20차시 (1차시 = 50분)`}
              />
              <p className="mt-1 text-xs text-gray-400">Markdown 형식으로 작성. AI 목차 생성 및 챕터 작성 시 참조됩니다.</p>
              <button
                onClick={handleSaveDiscussion}
                disabled={saving}
                className="mt-3 px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {saving ? '저장 중...' : '💾 논의사항 저장'}
              </button>
            </div>
          )}

          {inputMode === 'toc' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">목차 직접 입력 (Markdown 형식)</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed"
                rows={12}
                value={tocText}
                onChange={(e) => setTocText(e.target.value)}
                placeholder={`# Part 1. 시작하기\n## Chapter 1. 개발 환경 설정\n- 예상 시간: 30분\n\n## Chapter 2. 첫 번째 프로그램\n- 예상 시간: 50분`}
              />
              <p className="mt-1 text-xs text-gray-400"># Part, ## Chapter 형식으로 작성하면 자동으로 JSON 구조로 변환됩니다.</p>
              <button
                onClick={handleSaveToc}
                disabled={saving}
                className="mt-3 px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
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
        </>
      )}
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
