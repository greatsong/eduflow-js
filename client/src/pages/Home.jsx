import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { apiFetch, getApiKey } from '../api/client';

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto py-12">
      {/* 히어로 */}
      <div className="text-center mb-10">
        <div className="flex justify-center mb-4">
          <Logo size={100} />
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent mb-3">
          에듀플로
        </h1>
        <p className="text-lg text-gray-600 mb-2">
          AI와 함께, 교육 콘텐츠를 물 흐르듯 만들어보세요
        </p>
        <p className="text-sm text-gray-400 italic">
          "좋은 수업 아이디어를 체계적인 교육자료로"
        </p>
      </div>

      {/* 기능 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {[
          { icon: '💬', title: '방향성 논의', desc: 'AI와 대화하며 교재 방향 설정', color: 'from-indigo-500 to-indigo-600' },
          { icon: '📋', title: '자동 목차 생성', desc: '레퍼런스 기반 구조화', color: 'from-purple-500 to-purple-600' },
          { icon: '✍️', title: '챕터 자동 작성', desc: '병렬 생성으로 빠르게', color: 'from-amber-500 to-orange-500' },
          { icon: '🚀', title: '웹 배포', desc: 'MkDocs로 즉시 배포', color: 'from-emerald-500 to-teal-600' },
        ].map((item) => (
          <div key={item.title} className="group p-5 bg-white rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-2xl mb-4 shadow-sm group-hover:scale-110 transition-transform duration-200`}>
              {item.icon}
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* 멀티 AI 안내 */}
      <MultiAIBanner />

      {/* 시작하기 */}
      <div className="text-center mb-16">
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 hover:-translate-y-0.5"
        >
          시작하기 →
        </Link>
      </div>

      {/* 개발자 편지 - 스크롤 아래에 위치 */}
      <DeveloperLetter />
    </div>
  );
}

const PROVIDER_INFO = [
  { id: 'anthropic', name: 'Claude', icon: '🟠', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'openai', name: 'GPT', icon: '🟢', color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'google', name: 'Gemini', icon: '🔵', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'upstage', name: 'Solar', icon: '🟣', color: 'bg-purple-100 text-purple-700 border-purple-200' },
];

function MultiAIBanner() {
  const [sharedP, setSharedP] = useState({});
  const [serverP, setServerP] = useState({});
  const [apiMode, setApiMode] = useState('user');

  useEffect(() => {
    apiFetch('/api/auth/status')
      .then((d) => {
        setSharedP(d.sharedProviders || {});
        setServerP(d.serverProviders || {});
        setApiMode(d.apiMode || 'user');
      })
      .catch(() => {});
  }, []);

  // 공개 / 비공개(관리자) / 내 키 구분
  const providerStatus = PROVIDER_INFO.map((p) => {
    const shared = !!sharedP[p.id];
    const adminOnly = !shared && !!serverP[p.id];
    const user = !serverP[p.id] && !!getApiKey(p.id);
    return { ...p, shared, adminOnly, user, available: shared || adminOnly || user };
  });
  const sharedCount = providerStatus.filter((p) => p.shared).length;
  const adminOnlyCount = providerStatus.filter((p) => p.adminOnly).length;
  const userCount = providerStatus.filter((p) => p.user).length;

  return (
    <div className="mb-10 p-5 bg-gradient-to-r from-slate-50 to-indigo-50/50 rounded-2xl border border-indigo-100/60">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🤖</span>
        <h3 className="text-base font-bold text-gray-800">멀티 AI 지원</h3>
        {sharedCount > 0 && (
          <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded-full font-medium">
            🌐 공개 {sharedCount}개
          </span>
        )}
        {adminOnlyCount > 0 && (
          <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full font-medium">
            🔒 비공개 {adminOnlyCount}개
          </span>
        )}
        {userCount > 0 && (
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">
            👤 내 키 {userCount}개
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {providerStatus.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
              p.available
                ? p.color
                : 'bg-gray-50 text-gray-400 border-gray-200'
            }`}
          >
            <span>{p.icon}</span>
            <span>{p.name}</span>
            {p.shared ? (
              <span className="ml-auto text-emerald-500" title="공개 (모든 사용자)">🌐</span>
            ) : p.adminOnly ? (
              <span className="ml-auto text-amber-500" title="비공개 (관리자만)">🔒</span>
            ) : p.user ? (
              <span className="ml-auto text-blue-500" title="내 키">👤</span>
            ) : (
              <span className="ml-auto text-gray-300">—</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        {apiMode === 'server'
          ? '🌐 = 공개 (무료), 🔒 = 비공개 (관리자), 👤 = 내 키. 사이드바 🔑 AI API 키에서 설정하세요.'
          : 'AI를 사용하려면 사이드바 하단의 🔑 AI API 키에서 API 키를 입력하세요.'}
      </p>
    </div>
  );
}

function DeveloperLetter() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="max-w-2xl mx-auto pb-10">
      {/* 봉투 클릭 영역 */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer group"
      >
        {/* 봉투 본체 */}
        <div className={`relative bg-gradient-to-br from-amber-100 to-orange-100 border-2 border-amber-300 shadow-lg transition-all duration-300 ${
          isOpen ? 'rounded-t-xl border-b-0' : 'rounded-xl hover:shadow-xl hover:scale-[1.01]'
        }`}>
          {/* 봉투 뚜껑 - SVG로 구현 */}
          <svg
            className={`absolute -top-[1px] left-0 right-0 w-full transition-all duration-500 ${
              isOpen ? 'opacity-0 -translate-y-2' : 'opacity-100'
            }`}
            viewBox="0 0 400 50"
            preserveAspectRatio="none"
            style={{ height: '40px' }}
          >
            <path
              d="M0,0 L200,45 L400,0 L400,0 L0,0 Z"
              fill="url(#envelopeFlapGradient)"
              stroke="#fcd34d"
              strokeWidth="2"
            />
            <defs>
              <linearGradient id="envelopeFlapGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#fde68a" />
                <stop offset="100%" stopColor="#fcd34d" />
              </linearGradient>
            </defs>
          </svg>

          {/* 봉투 내용 */}
          <div className={`flex items-center justify-center transition-all duration-300 ${
            isOpen ? 'py-4' : 'py-8'
          }`}>
            <span className="text-3xl mr-3">{isOpen ? '📨' : '💌'}</span>
            <span className="text-amber-800 font-medium">
              {isOpen ? '클릭하여 닫기' : '개발자의 편지 (클릭하여 열기)'}
            </span>
          </div>
        </div>
      </div>

      {/* 편지 내용 (열린 상태) */}
      <div
        className={`overflow-hidden transition-all duration-500 ease-out ${
          isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-t-0 border-amber-300 rounded-b-2xl px-7 py-6 shadow-lg">
          <p className="text-gray-800 mb-3">
            <strong>안녕하세요! 선생님!</strong> 해적왕이 될 선생님, <strong>석리송</strong>입니다!
          </p>
          <p className="text-gray-600 text-sm mb-3 leading-relaxed">
            저는 교육 영역에서 기존에 풀리지 않거나, 풀리기 어려웠던 문제 중
            <strong className="text-gray-800"> AI로 풀 수 있는 가치있는 문제</strong>를 찾고 해결하고 있습니다!
          </p>
          <p className="text-gray-600 text-sm mb-3 leading-relaxed">
            이번 프로젝트에서는 선생님들께서 수업 아이디어를 구상할 때 도움이 되고,
            또 완성된 아이디어가 마음에 들 경우 웹으로 바로 배포할 수 있는
            <strong className="text-gray-800"> 「수업 자료 개발 및 배포 자동화 시스템, 에듀플로(EduFlow)」</strong>를 만들어보았습니다!
          </p>
          <p className="text-gray-600 text-sm mb-4 leading-relaxed">
            사용해보시고 피드백 주시면 적극 반영하겠습니다!
          </p>
          <p className="text-gray-800 text-sm mb-2">
            그럼, 에듀플로와 함께, <strong>멋진 수업 만들어보세요!!</strong>
          </p>
          <p className="text-right text-gray-400 text-sm italic border-t border-dashed border-amber-300 pt-3 mt-3">
            — 개발자 석리송
          </p>
        </div>
      </div>
    </div>
  );
}
