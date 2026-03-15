// EduFlow - Mermaid 다이어그램 테마 동기화
// MkDocs Material 테마 색상에 맞춰 Mermaid 다이어그램 색상을 동기화합니다.
document.addEventListener('DOMContentLoaded', function() {
  if (typeof mermaid === 'undefined') return;

  var root = getComputedStyle(document.documentElement);
  var isDark = document.documentElement.getAttribute('data-md-color-scheme') === 'slate';

  function getCSSVar(name) {
    return root.getPropertyValue(name).trim() || null;
  }

  var primaryColor = getCSSVar('--ef-primary') || '#4f46e5';
  var primaryDark = getCSSVar('--ef-primary-dark') || '#4338ca';
  var primaryText = getCSSVar('--ef-primary-text') || '#312e81';
  var primaryLight = getCSSVar('--ef-primary-light') || '#eef2ff';
  var primaryBorder = getCSSVar('--ef-primary-border') || '#c7d2fe';
  var accent = getCSSVar('--ef-accent') || '#7c3aed';

  mermaid.initialize({
    startOnLoad: true,
    theme: isDark ? 'dark' : 'default',
    themeVariables: {
      primaryColor: primaryLight,
      primaryBorderColor: primaryBorder,
      primaryTextColor: primaryText,
      lineColor: primaryBorder,
      secondaryColor: '#f0fdf4',
      secondaryBorderColor: '#86efac',
      secondaryTextColor: '#166534',
      tertiaryColor: '#fff7ed',
      tertiaryBorderColor: '#fdba74',
      tertiaryTextColor: '#9a3412',
      noteBkgColor: primaryLight,
      noteTextColor: primaryText,
      noteBorderColor: primaryBorder,
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '14px',
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
    },
    sequence: {
      useMaxWidth: true,
      actorFontFamily: '"Noto Sans KR", sans-serif',
      noteFontFamily: '"Noto Sans KR", sans-serif',
      messageFontFamily: '"Noto Sans KR", sans-serif',
    },
  });

  // 다크모드 전환 시 Mermaid 재렌더링
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.attributeName === 'data-md-color-scheme') {
        location.reload();
      }
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-md-color-scheme'],
  });
});
