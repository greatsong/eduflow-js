import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { apiFetch, getApiKey } from '../api/client';

const RELEASE_NOTES = [
  {
    version: 'v0.5.1',
    date: '2026-04-20',
    highlights: 'AI 이미지 생성 제거 · 품질·비용 정리',
    sections: [
      {
        title: 'AI 이미지 자동 생성 기능 제거',
        icon: '🗑️',
        items: [
          '어색한 결과물과 누적 API 비용 문제로 전면 제거',
          '기존 업로드 이미지 렌더링·라이트박스는 그대로 유지',
          'Mermaid 다이어그램과 회로도는 계속 사용 가능',
        ],
      },
      {
        title: '2축 템플릿 시스템',
        icon: '🎯',
        items: [
          '교과 영역(WHAT) 7종 × 교육 모델(HOW) 6종 조합',
          '기능 옵션 자유 선택 (코드, 수식, Mermaid 등)',
          '교과별 최적화 프롬프트 자동 적용',
        ],
      },
      {
        title: '평가 단계 옵션 (0~4)',
        icon: '📊',
        items: [
          '0: 평가 없음 → 4: 인터랙티브 채점+피드백+재도전',
          '퀴즈 엔진(quiz-engine.js) 자동 포함',
          '프로젝트별 평가 수준 설정',
        ],
      },
      {
        title: '대화 기록 서버 저장',
        icon: '💬',
        items: [
          '챕터별 대화가 서버에 자동 저장',
          '탭/브라우저 전환 후에도 유지',
        ],
      },
      {
        title: '분량 제어 · 안정성',
        icon: '🔧',
        items: [
          'TOC 과다 생성 방지',
          '챕터 잘림 방지 안전 버퍼',
          '권(Volume) → Part+Chapter 구조 통일',
          '프로젝트 설정 저장 안정성 개선',
        ],
      },
    ],
  },
];

export default function Home() {
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* 히어로 섹션 */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 text-white px-8 py-16 md:px-16 mb-12">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-teal-400/20 blur-2xl" />
        <div className="absolute top-10 right-[30%] w-32 h-32 rounded-full bg-emerald-300/10 blur-xl" />

        <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 text-center md:text-left">
            <button
              onClick={() => setShowReleaseNotes(true)}
              className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur rounded-full text-xs font-medium mb-5 border border-white/20 hover:bg-white/25 transition-colors cursor-pointer"
            >
              <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
              v0.4 — 2축 템플릿 · 멀티 AI · 오픈소스
            </button>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4 tracking-tight">
              에듀플로
              <span className="block text-emerald-200 text-2xl md:text-3xl font-semibold mt-1">
                EduFlow
              </span>
            </h1>
            <p className="text-lg text-emerald-100/90 mb-2 leading-relaxed max-w-lg">
              선생님과 AI가 함께 만드는 오픈소스 교육자료 생성 플랫폼
            </p>
            <p className="text-sm text-emerald-200/70 italic mb-8">
              "좋은 수업 아이디어를 체계적인 교육자료로"
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <Link
                to="/projects"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-emerald-700 rounded-xl font-bold text-base hover:bg-emerald-50 transition-all shadow-lg shadow-emerald-900/20 hover:shadow-xl hover:-translate-y-0.5"
              >
                시작하기 →
              </Link>
              <Link
                to="/compare"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white/10 backdrop-blur text-white rounded-xl font-medium text-sm border border-white/20 hover:bg-white/20 transition-all"
              >
                AI 모델 비교
              </Link>
            </div>
          </div>

          <div className="relative shrink-0 hidden md:block">
            <div className="relative">
              <div className="absolute inset-0 bg-white/10 rounded-3xl blur-xl scale-110" />
              <div className="relative bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20">
                <Logo size={120} />
              </div>
            </div>
            <div className="absolute -bottom-4 -left-8 bg-white rounded-xl shadow-xl px-3 py-2 text-xs font-medium text-gray-700 animate-[float_3s_ease-in-out_infinite]">
              💬 AI 대화형 생성
            </div>
            <div className="absolute -top-3 -right-6 bg-white rounded-xl shadow-xl px-3 py-2 text-xs font-medium text-gray-700 animate-[float_3s_ease-in-out_infinite_0.5s]">
              🚀 원클릭 배포
            </div>
          </div>
        </div>
      </section>

      {/* 핵심 가치 — 헌법에서 추출한 3가지 핵심 */}
      <section className="mb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl mb-4">👩‍🏫</div>
            <h3 className="font-bold text-gray-900 mb-2">교사가 창작자</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              AI는 제안하고, 선생님이 결정합니다. 모든 단계에서 수정, 거부, 재생성할 수 있습니다.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition-all">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-xl mb-4">🔄</div>
            <h3 className="font-bold text-gray-900 mb-2">끊기지 않는 흐름</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              아이디어부터 학생 손에 닿는 교재까지. 구상 → 구조화 → 생성 → 배포, 중간에 끊기지 않습니다.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition-all">
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center text-xl mb-4">💬</div>
            <h3 className="font-bold text-gray-900 mb-2">대화형 협력</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              일방적 생성이 아니라, AI와의 대화를 통해 선생님의 교육 철학을 교재에 녹여냅니다.
            </p>
          </div>
        </div>
      </section>

      {/* 6단계 워크플로우 */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">6단계 워크플로우</h2>
          <p className="text-sm text-gray-500">아이디어부터 배포까지, 물 흐르듯 이어집니다</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { step: 1, icon: '💬', title: '방향성 논의', desc: 'AI와 대화하며 교재 구상', color: 'from-emerald-500 to-emerald-600' },
            { step: 2, icon: '📋', title: '목차 작성', desc: '체계적 구조 자동 생성', color: 'from-green-500 to-green-600' },
            { step: 3, icon: '✅', title: '피드백', desc: '목차 검토 및 확정', color: 'from-teal-500 to-teal-600' },
            { step: 4, icon: '✍️', title: '챕터 제작', desc: '배치/개별 자동 작성', color: 'from-cyan-500 to-cyan-600' },
            { step: 5, icon: '🚀', title: '배포', desc: '웹사이트 · DOCX · GitHub Pages', color: 'from-sky-500 to-sky-600' },
            { step: 6, icon: '📊', title: '포트폴리오', desc: '완성된 교재 모아보기', color: 'from-violet-500 to-violet-600' },
          ].map((item) => (
            <div key={item.step} className="group relative overflow-hidden bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                  {item.step}
                </div>
                <span className="text-xl">{item.icon}</span>
              </div>
              <h3 className="font-bold text-gray-900 text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${item.color} scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left`} />
            </div>
          ))}
        </div>
      </section>

      {/* 핵심 기능 — 벤토 그리드 */}
      <section className="mb-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">주요 기능</h2>
          <p className="text-sm text-gray-500">어떤 교과든, 어떤 형식이든</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 대형 카드: 멀티 AI */}
          <div className="md:col-span-2 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />
            <div className="relative z-10">
              <span className="text-2xl mb-3 block">🤖</span>
              <h3 className="text-lg font-bold mb-2">멀티 AI 프로바이더</h3>
              <p className="text-gray-300 text-sm leading-relaxed mb-4">
                Claude, GPT, Gemini, Solar — 4개 AI를 자유롭게 선택하고 비교하세요.
                특정 AI에 종속되지 않는 열린 구조입니다.
              </p>
              <MultiAIBanner />
            </div>
          </div>

          {/* 소형 카드들 */}
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl p-5 border border-emerald-100">
              <span className="text-2xl mb-2 block">📐</span>
              <h3 className="font-bold text-gray-900 text-sm mb-1">2축 템플릿 시스템</h3>
              <p className="text-xs text-gray-600 leading-relaxed">교과 전문성(WHAT) × 교육 모델(HOW) + 기능 옵션을 자유롭게 조합</p>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl p-5 border border-teal-100">
              <span className="text-2xl mb-2 block">🌐</span>
              <h3 className="font-bold text-gray-900 text-sm mb-1">원클릭 웹 배포</h3>
              <p className="text-xs text-gray-600 leading-relaxed">Astro Starlight + GitHub Pages로 교재 사이트를 즉시 배포. 교사 컴퓨터에만 머무르지 않습니다.</p>
            </div>
          </div>
        </div>

        {/* 추가 기능 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md transition-all">
            <span className="text-xl block mb-2">📎</span>
            <h4 className="font-bold text-gray-900 text-xs mb-1">참고자료 업로드</h4>
            <p className="text-[10px] text-gray-400">PDF · DOCX · HWP · 복붙</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md transition-all">
            <span className="text-xl block mb-2">📊</span>
            <h4 className="font-bold text-gray-900 text-xs mb-1">시각화</h4>
            <p className="text-[10px] text-gray-400">Mermaid · KaTeX · SVG</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md transition-all">
            <span className="text-xl block mb-2">👥</span>
            <h4 className="font-bold text-gray-900 text-xs mb-1">사용자 관리</h4>
            <p className="text-[10px] text-gray-400">가입 승인 · 역할 · 통계</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md transition-all">
            <span className="text-xl block mb-2">📖</span>
            <h4 className="font-bold text-gray-900 text-xs mb-1">포트폴리오</h4>
            <p className="text-[10px] text-gray-400">완성된 교재 모아보기</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center mb-12">
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-2xl font-bold text-lg hover:from-emerald-700 hover:to-green-700 transition-all shadow-lg shadow-emerald-200 hover:shadow-xl hover:shadow-emerald-300 hover:-translate-y-0.5"
        >
          교육자료 만들기 시작 →
        </Link>
      </section>

      {/* 오픈소스 안내 */}
      <section className="text-center mb-16 space-y-3">
        <div className="inline-flex flex-col sm:flex-row items-center gap-3">
          <a
            href="/install-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 hover:bg-emerald-100 transition-colors font-medium"
          >
            <span>📖</span>
            <span>에듀플로 설치 및 사용 가이드</span>
          </a>
          <a
            href="https://github.com/greatsong/eduflow-js"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-emerald-600 transition-colors"
          >
            <span>⭐</span>
            <span className="underline underline-offset-2">GitHub 바로가기</span>
          </a>
        </div>
        <p className="text-xs text-gray-400">오픈소스로 공개되어 있습니다 · MIT License</p>
      </section>

      {/* 개발자 편지 */}
      <DeveloperLetter />

      {/* 릴리즈 노트 모달 */}
      {showReleaseNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowReleaseNotes(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">🎉 새로운 소식</h2>
                  <p className="text-emerald-100 text-xs mt-0.5">{RELEASE_NOTES[0].version} · {RELEASE_NOTES[0].date}</p>
                </div>
                <button onClick={() => setShowReleaseNotes(false)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-sm transition-colors">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[60vh] px-6 py-4 space-y-4">
              {RELEASE_NOTES[0].sections.map((section, idx) => (
                <div key={idx}>
                  <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-2">
                    <span className="text-base">{section.icon}</span>
                    {section.title}
                  </h3>
                  <ul className="space-y-1 ml-7">
                    {section.items.map((item, i) => (
                      <li key={i} className="text-xs text-gray-600 leading-relaxed flex items-start gap-1.5">
                        <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-center">
              <button onClick={() => setShowReleaseNotes(false)} className="px-6 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">확인</button>
            </div>
          </div>
        </div>
      )}
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

  const providerStatus = PROVIDER_INFO.map((p) => {
    const shared = !!sharedP[p.id];
    const adminOnly = !shared && !!serverP[p.id];
    const user = !serverP[p.id] && !!getApiKey(p.id);
    return { ...p, shared, adminOnly, user, available: shared || adminOnly || user };
  });

  return (
    <div className="flex flex-wrap gap-2">
      {providerStatus.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            p.available
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-white/5 border-white/10 text-white/40'
          }`}
        >
          <span>{p.icon}</span>
          <span>{p.name}</span>
          {p.shared ? (
            <span className="text-emerald-300" title="공개">🌐</span>
          ) : p.adminOnly ? (
            <span className="text-amber-300" title="비공개">🔒</span>
          ) : p.user ? (
            <span className="text-blue-300" title="내 키">👤</span>
          ) : (
            <span className="text-white/20">—</span>
          )}
        </div>
      ))}
    </div>
  );
}

function DeveloperLetter() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer group"
      >
        <div className={`relative bg-gradient-to-br from-amber-100 to-orange-100 border-2 border-amber-300 shadow-lg transition-all duration-300 ${
          isOpen ? 'rounded-t-xl border-b-0' : 'rounded-xl hover:shadow-xl hover:scale-[1.01]'
        }`}>
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
            에듀플로는 선생님의 수업 아이디어를 AI와 대화하며 구체화하고,
            완성된 교재를 웹으로 바로 배포할 수 있는
            <strong className="text-gray-800"> 오픈소스 교육자료 생성 플랫폼</strong>입니다.
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
