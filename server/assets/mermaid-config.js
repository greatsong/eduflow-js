// EduFlow - Mermaid 다이어그램 세련된 테마
// MkDocs Material 테마와 조화로운 모던 다이어그램 스타일
document.addEventListener('DOMContentLoaded', function() {
  if (typeof mermaid === 'undefined') return;

  var isDark = document.documentElement.getAttribute('data-md-color-scheme') === 'slate';

  mermaid.initialize({
    startOnLoad: true,
    theme: 'base',
    themeVariables: isDark ? {
      primaryColor: '#1e293b',
      primaryBorderColor: '#60a5fa',
      primaryTextColor: '#e2e8f0',
      lineColor: '#475569',
      secondaryColor: '#1e3a5f',
      secondaryBorderColor: '#38bdf8',
      secondaryTextColor: '#bae6fd',
      tertiaryColor: '#1c1917',
      tertiaryBorderColor: '#a78bfa',
      tertiaryTextColor: '#ddd6fe',
      noteBkgColor: '#1e293b',
      noteTextColor: '#e2e8f0',
      noteBorderColor: '#475569',
      fontFamily: '"Noto Sans KR", system-ui, sans-serif',
      fontSize: '14px',
      nodeBorder: '2px',
      mainBkg: '#1e293b',
      clusterBkg: '#0f172a',
    } : {
      primaryColor: '#eff6ff',
      primaryBorderColor: '#3b82f6',
      primaryTextColor: '#1e3a5f',
      lineColor: '#94a3b8',
      secondaryColor: '#f0fdf4',
      secondaryBorderColor: '#22c55e',
      secondaryTextColor: '#166534',
      tertiaryColor: '#faf5ff',
      tertiaryBorderColor: '#a78bfa',
      tertiaryTextColor: '#5b21b6',
      noteBkgColor: '#f8fafc',
      noteTextColor: '#334155',
      noteBorderColor: '#cbd5e1',
      fontFamily: '"Noto Sans KR", system-ui, sans-serif',
      fontSize: '14px',
      nodeBorder: '2px',
      mainBkg: '#eff6ff',
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
      padding: 15,
    },
    mindmap: {
      useMaxWidth: true,
      padding: 20,
    },
    sequence: {
      useMaxWidth: true,
      actorFontFamily: '"Noto Sans KR", sans-serif',
      noteFontFamily: '"Noto Sans KR", sans-serif',
      messageFontFamily: '"Noto Sans KR", sans-serif',
    },
  });

  // 다크모드 전환 시 Mermaid 재렌더링
  var observer = new MutationObserver(function() {
    location.reload();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-md-color-scheme'],
  });
});
