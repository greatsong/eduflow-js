import { Component } from 'react';

/**
 * 전역 에러 바운더리 컴포넌트
 * 하위 컴포넌트 트리에서 발생한 렌더링 에러를 포착하여
 * 앱 전체가 깨지지 않도록 폴백 UI를 표시한다.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // 다음 렌더링에 폴백 UI를 표시하도록 상태 업데이트
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // 에러 정보 로깅
    console.error('[ErrorBoundary] 렌더링 에러 발생:', error);
    console.error('[ErrorBoundary] 컴포넌트 스택:', errorInfo?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="text-center max-w-md">
            {/* 에러 아이콘 */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-8 w-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            {/* 안내 메시지 */}
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              문제가 발생했습니다
            </h2>
            <p className="text-gray-500 mb-6">
              페이지를 새로고침해주세요.
            </p>

            {/* 새로고침 버튼 */}
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
