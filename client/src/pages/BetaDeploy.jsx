import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api/client';

const TABS = ['1️⃣ 저장소 생성', '2️⃣ 테스터 초대', '3️⃣ 초대 메시지', '4️⃣ 관리'];

function StatusBar({ ghStatus, config }) {
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${ghStatus.ghInstalled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {ghStatus.ghInstalled ? '✅ GitHub CLI' : '❌ GitHub CLI 미설치'}
      </span>
      <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${ghStatus.authenticated ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
        {ghStatus.authenticated ? `✅ ${ghStatus.username || '로그인됨'}` : '⚠️ 로그인 필요'}
      </span>
      <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${config.repo_created ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
        {config.repo_created ? `📦 ${config.repo_name}` : '📦 저장소 미생성'}
      </span>
      <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-blue-100 text-blue-700">
        👥 테스터 {(config.testers || []).length}명
      </span>
    </div>
  );
}

function RepoTab({ ghStatus, config, onRefresh }) {
  const [repoName, setRepoName] = useState(config.repo_name || 'eduflow');
  const [visibility, setVisibility] = useState('private');
  const [creating, setCreating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [message, setMessage] = useState(null);

  if (!ghStatus.ghInstalled) {
    return (
      <div className="bg-red-50 rounded-xl p-6">
        <h3 className="text-lg font-bold text-red-800 mb-3">GitHub CLI 설치가 필요합니다</h3>
        <p className="text-sm text-red-700 mb-2"><strong>macOS:</strong></p>
        <code className="block bg-red-100 p-2 rounded text-sm mb-3">brew install gh</code>
        <p className="text-sm text-red-700">설치 후 페이지를 새로고침하세요.</p>
      </div>
    );
  }

  if (!ghStatus.authenticated) {
    return (
      <div className="bg-yellow-50 rounded-xl p-6">
        <h3 className="text-lg font-bold text-yellow-800 mb-3">GitHub 로그인이 필요합니다</h3>
        <code className="block bg-yellow-100 p-2 rounded text-sm mb-3">gh auth login</code>
        <p className="text-sm text-yellow-700">터미널에서 위 명령어를 실행하세요.</p>
        <button
          onClick={onRefresh}
          className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700"
        >
          🔄 상태 확인
        </button>
      </div>
    );
  }

  const handleCreate = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const result = await apiFetch('/api/beta/repo', {
        method: 'POST',
        body: JSON.stringify({ repoName, visibility }),
      });
      setMessage({ type: 'success', text: result.repoUrl ? `저장소 생성 완료! ${result.repoUrl}` : '저장소 생성 완료!' });
      onRefresh();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setCreating(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    setMessage(null);
    try {
      const result = await apiFetch('/api/beta/push', {
        method: 'POST',
        body: JSON.stringify({ commitMessage: '변경사항 푸시' }),
      });
      setMessage({ type: 'success', text: result.message });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div>
      {config.repo_created ? (
        <div>
          <div className="bg-green-50 rounded-xl p-4 mb-4">
            <p className="text-green-700 font-medium">✅ 저장소가 생성되었습니다: <strong>{config.repo_name}</strong></p>
            {ghStatus.username && (
              <p className="text-sm text-green-600 mt-1">
                🔗 https://github.com/{ghStatus.username}/{config.repo_name}
              </p>
            )}
          </div>
          <button
            onClick={handlePush}
            disabled={pushing}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {pushing ? '푸시 중...' : '🔄 변경사항 푸시'}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">저장소 이름</label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">공개 설정</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="private">Private (비공개)</option>
                <option value="public">Public (공개)</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !repoName}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? '생성 중...' : '🚀 저장소 생성 및 푸시'}
          </button>
        </div>
      )}

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

function TesterTab({ config, ghStatus, onRefresh }) {
  const [newTester, setNewTester] = useState('');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [message, setMessage] = useState(null);

  if (!config.repo_created) {
    return (
      <div className="bg-yellow-50 rounded-xl p-6">
        <p className="text-yellow-700">⚠️ 먼저 저장소를 생성하세요 (1️⃣ 탭)</p>
      </div>
    );
  }

  const handleInvite = async () => {
    if (!newTester.trim()) return;
    setInviting(true);
    setMessage(null);
    try {
      const result = await apiFetch('/api/beta/testers', {
        method: 'POST',
        body: JSON.stringify({ username: newTester.trim() }),
      });
      setMessage({ type: 'success', text: result.message });
      setNewTester('');
      onRefresh();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (username) => {
    setRemoving(username);
    try {
      await apiFetch(`/api/beta/testers/${username}`, { method: 'DELETE' });
      onRefresh();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setRemoving(null);
    }
  };

  const testers = config.testers || [];

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">GitHub 사용자명을 입력하여 저장소 접근 권한을 부여합니다.</p>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={newTester}
          onChange={(e) => setNewTester(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
          placeholder="GitHub 사용자명"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={handleInvite}
          disabled={inviting || !newTester.trim()}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {inviting ? '초대 중...' : '➕ 초대하기'}
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <h4 className="font-semibold text-gray-800 mb-3">👥 초대된 테스터</h4>
      {testers.length === 0 ? (
        <p className="text-sm text-gray-400">아직 초대된 테스터가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {testers.map((t) => (
            <div key={t.username} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
              <div>
                <span className="font-medium text-sm text-gray-800">@{t.username}</span>
                <span className="text-xs text-gray-400 ml-3">
                  초대: {t.invited_at ? t.invited_at.slice(0, 10) : '-'}
                </span>
              </div>
              <button
                onClick={() => handleRemove(t.username)}
                disabled={removing === t.username}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {removing === t.username ? '...' : '❌ 제거'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageTab({ config, ghStatus, onRefresh }) {
  const username = ghStatus.username || 'YOUR_USERNAME';
  const repoName = config.repo_name || 'eduflow';

  const defaultMessage = `안녕하세요! 👋

AI로 교육자료 만드는 도구 **"에듀플로"**를 개발 중인데요,
사용해보시고 피드백 주시면 큰 도움이 될 것 같아 연락드렸습니다.

---

## 📦 설치 방법

### 1. GitHub 초대 수락
이메일로 온 초대를 수락해주세요.

### 2. 저장소 다운로드
\`\`\`bash
git clone https://github.com/${username}/${repoName}.git
cd ${repoName}
\`\`\`

### 3. 패키지 설치
\`\`\`bash
npm install
\`\`\`

### 4. API 키 설정
\`\`\`bash
cp .env.example .env
# .env 파일에 ANTHROPIC_API_KEY 설정
\`\`\`

### 5. 실행
\`\`\`bash
npm run dev
\`\`\`

---

감사합니다! 🙏`;

  const [inviteMessage, setInviteMessage] = useState(config.invite_message || defaultMessage);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/beta/config', {
        method: 'PUT',
        body: JSON.stringify({ invite_message: inviteMessage }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefresh();
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteMessage);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div>
      <textarea
        value={inviteMessage}
        onChange={(e) => setInviteMessage(e.target.value)}
        rows={18}
        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono resize-y"
      />
      <div className="flex gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '💾 메시지 저장'}
        </button>
        <button
          onClick={handleCopy}
          className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          📋 클립보드 복사
        </button>
        {saved && <span className="text-sm text-green-600 self-center">✅ 완료!</span>}
      </div>
    </div>
  );
}

function ManageTab({ config, onRefresh }) {
  const [commitMsg, setCommitMsg] = useState('Update: 기능 개선');
  const [pushing, setPushing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState(null);

  const handlePush = async () => {
    setPushing(true);
    setMessage(null);
    try {
      const result = await apiFetch('/api/beta/push', {
        method: 'POST',
        body: JSON.stringify({ commitMessage: commitMsg }),
      });
      setMessage({ type: 'success', text: result.message });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setPushing(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('정말 설정을 초기화하시겠습니까?')) return;
    setResetting(true);
    try {
      await apiFetch('/api/beta/config', { method: 'DELETE' });
      onRefresh();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h4 className="font-semibold text-gray-800 mb-2">🔄 업데이트 푸시</h4>
        <p className="text-xs text-gray-400 mb-3">코드 변경사항을 GitHub에 반영합니다.</p>
        <input
          type="text"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
        />
        <button
          onClick={handlePush}
          disabled={pushing || !config.repo_created}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {pushing ? '푸시 중...' : '📤 커밋 & 푸시'}
        </button>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 mb-2">🗑️ 초기화</h4>
        <p className="text-xs text-gray-400 mb-3">베타 배포 설정을 초기화합니다.</p>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="w-full py-2.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
        >
          {resetting ? '초기화 중...' : '🗑️ 설정 초기화'}
        </button>
      </div>

      {message && (
        <div className={`md:col-span-2 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* 현재 설정 */}
      <div className="md:col-span-2">
        <h4 className="font-semibold text-gray-800 mb-2">📋 현재 설정</h4>
        <pre className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 overflow-x-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default function BetaDeploy() {
  const [activeTab, setActiveTab] = useState(0);
  const [ghStatus, setGhStatus] = useState({ ghInstalled: false, authenticated: false, username: null });
  const [config, setConfig] = useState({ repo_name: 'eduflow', repo_created: false, testers: [], invite_message: '' });
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [status, cfg] = await Promise.all([
        apiFetch('/api/beta/github-status'),
        apiFetch('/api/beta/config'),
      ]);
      setGhStatus(status);
      setConfig(cfg);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">상태 확인 중...</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">🎁 베타 배포 관리</h2>
      <p className="text-sm text-gray-500 mb-4">GitHub Private 저장소로 베타 테스터에게 공유하세요.</p>

      <StatusBar ghStatus={ghStatus} config={config} />

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === i
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {activeTab === 0 && <RepoTab ghStatus={ghStatus} config={config} onRefresh={loadAll} />}
        {activeTab === 1 && <TesterTab config={config} ghStatus={ghStatus} onRefresh={loadAll} />}
        {activeTab === 2 && <MessageTab config={config} ghStatus={ghStatus} onRefresh={loadAll} />}
        {activeTab === 3 && <ManageTab config={config} onRefresh={loadAll} />}
      </div>
    </div>
  );
}
