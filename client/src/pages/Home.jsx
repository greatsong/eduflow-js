import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

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
          { icon: '💬', title: '방향성 논의', desc: 'AI와 대화하며 교재 방향 설정' },
          { icon: '📋', title: '자동 목차 생성', desc: '레퍼런스 기반 구조화' },
          { icon: '✍️', title: '챕터 자동 작성', desc: '병렬 생성으로 빠르게' },
          { icon: '🚀', title: '웹 배포', desc: 'MkDocs로 즉시 배포' },
        ].map((item) => (
          <div key={item.title} className="p-5 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="text-3xl mb-3">{item.icon}</div>
            <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* 시작하기 */}
      <div className="text-center mb-16">
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          시작하기 →
        </Link>
      </div>

      {/* 개발자 편지 - 스크롤 아래에 위치 */}
      <DeveloperLetter />
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
