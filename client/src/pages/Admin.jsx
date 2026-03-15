import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api/client';

const TABS = [
  { id: 'users', label: '사용자 관리', icon: '👥' },
  { id: 'projects', label: '프로젝트 현황', icon: '📚' },
  { id: 'settings', label: '운영 모드 설정', icon: '⚙️' },
  { id: 'stats', label: '통계', icon: '📊' },
];

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users');
  const [isAdmin, setIsAdmin] = useState(null); // null = loading

  useEffect(() => {
    apiFetch('/api/admin/check')
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, []);

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">권한 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-lg font-bold text-red-700 mb-2">접근 권한 없음</h2>
          <p className="text-sm text-red-500">관리자만 접근할 수 있는 페이지입니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <span className="bg-gradient-to-r from-slate-600 to-indigo-600 bg-clip-text text-transparent">
            관리자 대시보드
          </span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">EduFlow 서비스 운영 관리</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/80'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'projects' && <ProjectsTab />}
      {activeTab === 'settings' && <SettingsTab />}
      {activeTab === 'stats' && <StatsTab />}
    </div>
  );
}

// ============================================================
// 탭 1: 사용자 관리
// ============================================================
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userProjects, setUserProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/users');
      setUsers(data);
    } catch (err) {
      console.error('사용자 목록 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      await apiFetch(`/api/admin/users/${user.googleId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchUsers();
    } catch (err) {
      alert('상태 변경 실패: ' + err.message);
    }
  };

  const viewProjects = async (user) => {
    setSelectedUser(user);
    setLoadingProjects(true);
    try {
      const data = await apiFetch(`/api/admin/users/${user.googleId}/projects`);
      setUserProjects(data);
    } catch {
      setUserProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* 사용자 상세 모달 */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {selectedUser.picture && (
                  <img src={selectedUser.picture} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                )}
                <div>
                  <h3 className="font-semibold text-gray-800">{selectedUser.name}</h3>
                  <p className="text-xs text-gray-400">{selectedUser.email}</p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600 text-xl">
                &times;
              </button>
            </div>

            <h4 className="text-sm font-medium text-gray-600 mb-3">프로젝트 목록 ({userProjects.length}개)</h4>

            {loadingProjects ? (
              <LoadingSpinner />
            ) : userProjects.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">프로젝트가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {userProjects.map((p) => (
                  <div key={p.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{p.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {p.claude_model} | 챕터 {p.chapterCount}개 | {formatDate(p.created_at)}
                        </p>
                      </div>
                      <StatusBadge deployed={p.deployed} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 사용자 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">전체 사용자 ({users.length}명)</h2>
        </div>

        {users.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">등록된 사용자가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">사용자</th>
                  <th className="px-5 py-3 text-left">이메일</th>
                  <th className="px-5 py-3 text-left">소속</th>
                  <th className="px-5 py-3 text-center">프로젝트</th>
                  <th className="px-5 py-3 text-center">GitHub</th>
                  <th className="px-5 py-3 text-center">가입일</th>
                  <th className="px-5 py-3 text-center">상태</th>
                  <th className="px-5 py-3 text-center">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((user) => (
                  <tr key={user.googleId} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        {user.picture ? (
                          <img src={user.picture} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs text-indigo-600 font-bold">
                            {(user.name || '?')[0]}
                          </div>
                        )}
                        <span className="font-medium text-gray-700">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{user.email}</td>
                    <td className="px-5 py-3 text-gray-500">{user.affiliation || '-'}</td>
                    <td className="px-5 py-3 text-center text-gray-600">{user.projectCount || 0}</td>
                    <td className="px-5 py-3 text-center">
                      {user.hasGitHub ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{user.githubUsername}</span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center text-gray-400 text-xs">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => toggleStatus(user)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                          user.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-red-100 text-red-600 hover:bg-red-200'
                        }`}
                      >
                        {user.status === 'active' ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => viewProjects(user)}
                        className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline"
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 탭 2: 프로젝트 현황
// ============================================================
function ProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // 삭제 대상 프로젝트
  const [deleteOpts, setDeleteOpts] = useState({ repo: true, portfolio: true });
  const [deleting, setDeleting] = useState(false);

  const loadProjects = () => {
    setLoading(true);
    apiFetch('/api/admin/projects')
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadProjects(); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const params = new URLSearchParams();
      if (deleteOpts.repo) params.set('deleteRepo', 'true');
      if (deleteOpts.portfolio) params.set('deletePortfolio', 'true');

      const result = await apiFetch(
        `/api/admin/projects/${deleteTarget.id}?${params.toString()}`,
        { method: 'DELETE' }
      );
      console.log('삭제 결과:', result);
      setDeleteTarget(null);
      loadProjects(); // 목록 새로고침
    } catch (err) {
      alert('삭제 실패: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  // 고유 사용자 목록
  const uniqueOwners = [...new Set(projects.filter(p => p.owner?.email).map(p => p.owner.email))];

  const filtered = filter
    ? projects.filter(p => p.owner?.email === filter)
    : projects;

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="">전체 사용자</option>
          {uniqueOwners.map((email) => (
            <option key={email} value={email}>{email}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{filtered.length}개 프로젝트</span>
      </div>

      {/* 프로젝트 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">프로젝트가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">프로젝트</th>
                  <th className="px-5 py-3 text-left">사용자</th>
                  <th className="px-5 py-3 text-left">모델</th>
                  <th className="px-5 py-3 text-center">챕터</th>
                  <th className="px-5 py-3 text-center">배포</th>
                  <th className="px-5 py-3 text-center">생성일</th>
                  <th className="px-5 py-3 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-700">{p.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.id}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-gray-600">{p.owner?.name || '-'}</p>
                      <p className="text-xs text-gray-400">{p.owner?.email || ''}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{p.claude_model || '-'}</td>
                    <td className="px-5 py-3 text-center text-gray-600">{p.chapterCount}</td>
                    <td className="px-5 py-3 text-center">
                      <StatusBadge deployed={p.deployed} />
                    </td>
                    <td className="px-5 py-3 text-center text-gray-400 text-xs">{formatDate(p.created_at)}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => { setDeleteTarget(p); setDeleteOpts({ repo: p.deployed, portfolio: p.deployed }); }}
                        className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                      >
                        🗑 삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-red-700 mb-1">🗑 프로젝트 삭제</h3>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-semibold">{deleteTarget.title}</span>을(를) 삭제합니다.
            </p>

            <div className="space-y-3 mb-5">
              <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked disabled className="mt-0.5 w-4 h-4 rounded" />
                <div>
                  <p className="text-sm font-medium text-gray-700">에듀플로 프로젝트 삭제</p>
                  <p className="text-xs text-gray-400">프로젝트 폴더와 모든 파일을 삭제합니다</p>
                </div>
              </label>

              {deleteTarget.deployed && (
                <>
                  <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteOpts.portfolio}
                      onChange={(e) => setDeleteOpts({ ...deleteOpts, portfolio: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded text-red-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-700">포트폴리오에서 제거</p>
                      <p className="text-xs text-gray-400">eduflow-portfolio에서 항목을 삭제합니다</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteOpts.repo}
                      onChange={(e) => setDeleteOpts({ ...deleteOpts, repo: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded text-red-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-700">GitHub 리포지토리 삭제</p>
                      <p className="text-xs text-gray-400">배포된 GitHub 리포를 삭제합니다 (사용자 토큰 필요)</p>
                    </div>
                  </label>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? '삭제 중...' : '삭제 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 탭 3: 운영 모드 설정
// ============================================================
const PROVIDERS = [
  { id: 'anthropic', name: 'Claude', company: 'Anthropic', icon: '🟠', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'GPT', company: 'OpenAI', icon: '🟢', placeholder: 'sk-...' },
  { id: 'google', name: 'Gemini', company: 'Google', icon: '🔵', placeholder: 'AIza...' },
  { id: 'upstage', name: 'Solar', company: 'Upstage', icon: '🟣', placeholder: 'up-...' },
];

function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // API 키 입력 상태 (빈문자열 = 변경 없음, 값 = 새 키, null = 삭제)
  const [keyInputs, setKeyInputs] = useState({
    anthropic: '', openai: '', google: '', upstage: '',
  });
  const [sharedState, setSharedState] = useState({
    anthropic: false, openai: false, google: false, upstage: false,
  });
  const [showKey, setShowKey] = useState({
    anthropic: false, openai: false, google: false, upstage: false,
  });
  const [keySaving, setKeySaving] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/settings')
      .then((data) => {
        setSettings(data);
        // adminApiKeys에서 shared 상태 초기화
        const ak = data.adminApiKeys || {};
        setSharedState({
          anthropic: ak.anthropic?.shared || false,
          openai: ak.openai?.shared || false,
          google: ak.google?.shared || false,
          upstage: ak.upstage?.shared || false,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const updated = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      setMessage('설정이 저장되었습니다.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('저장 실패: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKeys = async () => {
    setKeySaving(true);
    setKeyMessage('');
    try {
      const keys = {};
      for (const p of ['anthropic', 'openai', 'google', 'upstage']) {
        keys[p] = {
          key: keyInputs[p] || '', // 빈 문자열 = 기존 유지
          shared: sharedState[p],
        };
      }
      const result = await apiFetch('/api/admin/api-keys', {
        method: 'PUT',
        body: JSON.stringify({ keys }),
      });
      // 응답으로 UI 갱신
      setSettings(prev => ({ ...prev, adminApiKeys: result.adminApiKeys }));
      setKeyInputs({ anthropic: '', openai: '', google: '', upstage: '' });
      setKeyMessage('API 키가 저장되었습니다.');
      setTimeout(() => setKeyMessage(''), 3000);
    } catch (err) {
      setKeyMessage('저장 실패: ' + err.message);
    } finally {
      setKeySaving(false);
    }
  };

  const handleDeleteKey = async (provider) => {
    if (!confirm(`${provider} API 키를 삭제하시겠습니까?`)) return;
    setKeySaving(true);
    try {
      const keys = { [provider]: { key: null, shared: false } };
      const result = await apiFetch('/api/admin/api-keys', {
        method: 'PUT',
        body: JSON.stringify({ keys }),
      });
      setSettings(prev => ({ ...prev, adminApiKeys: result.adminApiKeys }));
      setKeyInputs(prev => ({ ...prev, [provider]: '' }));
      setSharedState(prev => ({ ...prev, [provider]: false }));
      setKeyMessage(`${provider} 키가 삭제되었습니다.`);
      setTimeout(() => setKeyMessage(''), 3000);
    } catch (err) {
      setKeyMessage('삭제 실패: ' + err.message);
    } finally {
      setKeySaving(false);
    }
  };

  if (loading || !settings) return <LoadingSpinner />;

  const adminKeys = settings.adminApiKeys || {};

  return (
    <div className="max-w-2xl space-y-6">
      {/* AI API 키 관리 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔑</span>
          <h3 className="text-sm font-semibold text-gray-700">AI API 키 관리</h3>
        </div>
        <p className="text-xs text-gray-400 mb-5">관리자가 입력한 API 키. 공개 시 모든 사용자가 사용 가능합니다.</p>

        <div className="space-y-4">
          {PROVIDERS.map((p) => {
            const stored = adminKeys[p.id] || {};
            const hasKey = stored.hasKey;
            const envKey = settings.serverApiKeys?.[p.id];

            return (
              <div key={p.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <span>{p.icon}</span>
                  <span className="text-sm font-semibold text-gray-700">{p.name}</span>
                  <span className="text-xs text-gray-400">({p.company})</span>
                  {envKey && (
                    <span className="ml-auto text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">환경변수 설정됨</span>
                  )}
                </div>

                {/* 키 입력 */}
                <div className="flex gap-2 mb-2">
                  <div className="flex-1 relative">
                    <input
                      type={showKey[p.id] ? 'text' : 'password'}
                      value={keyInputs[p.id]}
                      onChange={(e) => setKeyInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder={hasKey ? stored.masked : p.placeholder}
                      className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                    />
                    <button
                      onClick={() => setShowKey(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                      type="button"
                    >
                      {showKey[p.id] ? '🙈' : '👁️'}
                    </button>
                  </div>

                  {/* 공개/비공개 토글 */}
                  <button
                    onClick={() => setSharedState(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all whitespace-nowrap ${
                      sharedState[p.id]
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                    type="button"
                  >
                    {sharedState[p.id] ? '🌐 공개' : '🔒 비공개'}
                  </button>

                  {/* 삭제 버튼 */}
                  {hasKey && (
                    <button
                      onClick={() => handleDeleteKey(p.id)}
                      className="px-2 py-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      type="button"
                      title="키 삭제"
                    >
                      🗑️
                    </button>
                  )}
                </div>

                {/* 상태 표시 */}
                <div className="flex items-center gap-2 text-xs">
                  {hasKey ? (
                    <span className="text-emerald-600">✅ 키 등록됨 ({stored.masked})</span>
                  ) : (
                    <span className="text-gray-400">❌ 미등록</span>
                  )}
                  {hasKey && (
                    <span className={sharedState[p.id] ? 'text-emerald-500' : 'text-amber-500'}>
                      · {sharedState[p.id] ? '모든 사용자 공유' : '관리자만 사용'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 안내 */}
        <div className="mt-4 p-3 bg-indigo-50/60 rounded-xl text-xs text-indigo-600 space-y-1">
          <p>💡 <strong>공개</strong>: 모든 사용자가 이 키로 해당 AI 모델을 사용할 수 있습니다.</p>
          <p>🔒 <strong>비공개</strong>: 관리자 본인만 이 키로 해당 AI 모델을 사용할 수 있습니다.</p>
          <p>📌 빈 칸으로 저장하면 기존 키가 유지됩니다. 삭제하려면 🗑️ 버튼을 누르세요.</p>
        </div>

        {/* 키 저장 버튼 */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSaveKeys}
            disabled={keySaving}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-md"
          >
            {keySaving ? '저장 중...' : '🔑 API 키 저장'}
          </button>
          {keyMessage && (
            <span className={`text-sm ${keyMessage.includes('실패') ? 'text-red-500' : 'text-green-600'}`}>
              {keyMessage}
            </span>
          )}
        </div>
      </div>

      {/* 가입 모드 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">가입 모드</h3>
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="registrationMode"
              value="open"
              checked={settings.registrationMode === 'open'}
              onChange={() => setSettings(prev => ({ ...prev, registrationMode: 'open' }))}
              className="mt-0.5 accent-indigo-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-700">자유 가입</p>
              <p className="text-xs text-gray-400 mt-0.5">구글 로그인만 하면 즉시 이용 가능</p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="registrationMode"
              value="approval"
              checked={settings.registrationMode === 'approval'}
              onChange={() => setSettings(prev => ({ ...prev, registrationMode: 'approval' }))}
              className="mt-0.5 accent-indigo-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-700">승인 필요</p>
              <p className="text-xs text-gray-400 mt-0.5">관리자가 승인해야 이용 가능</p>
            </div>
          </label>
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-md"
        >
          {saving ? '저장 중...' : '⚙️ 운영 설정 저장'}
        </button>
        {message && (
          <span className={`text-sm ${message.includes('실패') ? 'text-red-500' : 'text-green-600'}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 탭 4: 통계
// ============================================================
function StatsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState('daily'); // 'daily' | 'weekly'

  useEffect(() => {
    apiFetch('/api/admin/stats')
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) return <LoadingSpinner />;

  const chartData = chartMode === 'daily' ? stats.dailyProjects : stats.weeklyProjects;
  const maxCount = Math.max(...chartData.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="총 사용자" value={stats.totalUsers} sub={`활성 ${stats.activeUsers}명`} color="indigo" />
        <StatCard label="총 프로젝트" value={stats.totalProjects} color="purple" />
        <StatCard label="총 챕터" value={stats.totalChapters} color="blue" />
        <StatCard label="배포 완료" value={stats.totalDeployed} color="emerald" />
      </div>

      {/* 프로젝트 생성 그래프 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">프로젝트 생성 추이</h3>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setChartMode('daily')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                chartMode === 'daily' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              일별
            </button>
            <button
              onClick={() => setChartMode('weekly')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                chartMode === 'weekly' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              주별
            </button>
          </div>
        </div>

        {/* CSS 바 차트 */}
        <div className="flex items-end gap-1.5 h-40">
          {chartData.map((item, i) => {
            const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
            const dateLabel = chartMode === 'daily'
              ? (item.date || '').slice(5) // MM-DD
              : `W${i + 1}`;

            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.count}
                </span>
                <div
                  className="w-full bg-gradient-to-t from-indigo-500 to-purple-400 rounded-t-md transition-all duration-300 min-h-[2px]"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${item.date || item.weekStart}: ${item.count}개`}
                />
                <span className="text-[10px] text-gray-400 truncate w-full text-center">{dateLabel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 공통 컴포넌트
// ============================================================

function StatCard({ label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'from-indigo-50 to-indigo-100/50 border-indigo-200/60 text-indigo-700',
    purple: 'from-purple-50 to-purple-100/50 border-purple-200/60 text-purple-700',
    blue: 'from-blue-50 to-blue-100/50 border-blue-200/60 text-blue-700',
    emerald: 'from-emerald-50 to-emerald-100/50 border-emerald-200/60 text-emerald-700',
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color].split(' ').pop()}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ deployed }) {
  return deployed ? (
    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">배포완료</span>
  ) : (
    <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">미배포</span>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '-';
  }
}
