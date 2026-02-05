import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto py-12">
      {/* 히어로 */}
      <div className="text-center mb-10">
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

      {/* 개발자 편지 */}
      <div className="relative max-w-2xl mx-auto mb-10 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl px-7 py-6 shadow-sm">
        <span className="absolute -top-3 left-6 bg-amber-50 px-2 text-xl">💌</span>
        <p className="text-gray-800 mb-2">
          <strong>안녕하세요! 선생님!</strong> 해적왕이 될 선생님, <strong>석리송</strong>입니다!
        </p>
        <p className="text-gray-600 text-sm mb-2 leading-relaxed">
          저는 교육 영역에서 기존에 풀리지 않거나, 풀리기 어려웠던 문제 중
          <strong className="text-gray-800"> AI로 풀 수 있는 가치있는 문제</strong>를 찾고 해결하고 있습니다!
        </p>
        <p className="text-gray-600 text-sm mb-2 leading-relaxed">
          이번 프로젝트에서는 선생님들께서 수업 아이디어를 구상할 때 도움이 되고,
          또 완성된 아이디어가 마음에 들 경우 웹으로 바로 배포할 수 있는
          <strong className="text-gray-800"> 「수업 자료 개발 및 배포 자동화 시스템, 에듀플로(EduFlow)」</strong>를 만들어보았습니다!
        </p>
        <p className="text-gray-600 text-sm mb-3 leading-relaxed">
          사용해보시고 피드백 주시면 적극 반영하겠습니다!
        </p>
        <p className="text-gray-800 text-sm mb-1">
          그럼, 에듀플로와 함께, <strong>멋진 수업 만들어보세요!!</strong>
        </p>
        <p className="text-right text-gray-400 text-sm italic border-t border-dashed border-amber-200 pt-2 mt-2">
          — 개발자 석리송
        </p>
      </div>

      {/* 기능 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {[
          { icon: '💬', title: '방향성 논의', desc: 'AI와 대화하며 교재 방향 설정' },
          { icon: '📋', title: '자동 목차 생성', desc: '레퍼런스 기반 구조 설계' },
          { icon: '✍️', title: '챕터 자동 작성', desc: '병렬 생성으로 빠르게 완성' },
        ].map((item) => (
          <div key={item.title} className="p-6 bg-white rounded-xl border border-gray-200">
            <div className="text-3xl mb-3">{item.icon}</div>
            <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* 시작하기 */}
      <div className="text-center">
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          시작하기 →
        </Link>
      </div>
    </div>
  );
}
