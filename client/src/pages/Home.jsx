import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto text-center py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        에듀플로
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        AI와 함께 만드는 나만의 교육자료
      </p>
      <p className="text-gray-500 mb-12 leading-relaxed">
        아이디어만 있으면 충분합니다.<br />
        Claude AI가 방향성 논의부터 챕터 작성, 배포까지 함께합니다.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-12">
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

      <Link
        to="/projects"
        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        시작하기 →
      </Link>
    </div>
  );
}
