/**
 * EduFlow Navigation — 사이드바 토글 + 이전/다음 챕터 네비게이션
 */
(function () {
  'use strict';

  function initNav() {
    createSidebarToggle();
    createChapterNav();
  }

  // ─────────────────────────────────────────
  // 1. 사이드바 접기 토글
  // ─────────────────────────────────────────
  function createSidebarToggle() {
    // 이미 생성된 토글 제거 (instant nav 대응)
    document.querySelectorAll('.ef-sidebar-toggle').forEach(function (el) { el.remove(); });

    var sidebar = document.querySelector('.md-sidebar--primary');
    if (!sidebar) return;

    var btn = document.createElement('button');
    btn.className = 'ef-sidebar-toggle';
    btn.setAttribute('aria-label', '사이드바 접기/펼치기');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';

    var collapsed = localStorage.getItem('ef-sidebar-collapsed') === 'true';
    if (collapsed) {
      document.body.classList.add('ef-sidebar-collapsed');
      btn.classList.add('is-collapsed');
    }

    btn.addEventListener('click', function () {
      var isCollapsed = document.body.classList.toggle('ef-sidebar-collapsed');
      btn.classList.toggle('is-collapsed', isCollapsed);
      localStorage.setItem('ef-sidebar-collapsed', isCollapsed);
    });

    // body에 직접 삽입 (fixed 포지션)
    document.body.appendChild(btn);
  }

  // ─────────────────────────────────────────
  // 2. 이전/다음 챕터 네비게이션
  // ─────────────────────────────────────────
  function createChapterNav() {
    // 이미 생성된 네비게이션 제거
    document.querySelectorAll('.ef-chapter-nav').forEach(function (el) { el.remove(); });

    // MkDocs Material의 footer nav에서 이전/다음 링크 추출
    var prevLink = document.querySelector('.md-footer__link--prev');
    var nextLink = document.querySelector('.md-footer__link--next');

    if (!prevLink && !nextLink) return;

    var nav = document.createElement('nav');
    nav.className = 'ef-chapter-nav';

    // 이전 버튼
    if (prevLink) {
      var prevTitle = prevLink.querySelector('.md-footer__title')?.textContent?.trim() || '';
      var prevDir = prevLink.querySelector('.md-footer__direction')?.textContent?.trim() || '이전';
      var prevBtn = document.createElement('a');
      prevBtn.href = prevLink.href;
      prevBtn.className = 'ef-chapter-nav__btn ef-chapter-nav__prev';
      prevBtn.innerHTML =
        '<span class="ef-chapter-nav__arrow">←</span>' +
        '<span class="ef-chapter-nav__info">' +
          '<span class="ef-chapter-nav__dir">' + prevDir + '</span>' +
          '<span class="ef-chapter-nav__title">' + prevTitle + '</span>' +
        '</span>';
      nav.appendChild(prevBtn);
    } else {
      // 빈 공간 유지 (정렬)
      var spacer = document.createElement('div');
      nav.appendChild(spacer);
    }

    // 다음 버튼
    if (nextLink) {
      var nextTitle = nextLink.querySelector('.md-footer__title')?.textContent?.trim() || '';
      var nextDir = nextLink.querySelector('.md-footer__direction')?.textContent?.trim() || '다음';
      var nextBtn = document.createElement('a');
      nextBtn.href = nextLink.href;
      nextBtn.className = 'ef-chapter-nav__btn ef-chapter-nav__next';
      nextBtn.innerHTML =
        '<span class="ef-chapter-nav__info">' +
          '<span class="ef-chapter-nav__dir">' + nextDir + '</span>' +
          '<span class="ef-chapter-nav__title">' + nextTitle + '</span>' +
        '</span>' +
        '<span class="ef-chapter-nav__arrow">→</span>';
      nav.appendChild(nextBtn);
    }

    // 콘텐츠 하단에 삽입
    var article = document.querySelector('.md-content__inner');
    if (article) {
      article.appendChild(nav);
    }

    // MkDocs 기본 footer nav 숨기기 (커스텀으로 대체)
    var footerInner = document.querySelector('.md-footer__inner');
    if (footerInner) {
      footerInner.style.display = 'none';
    }
  }

  // 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }

  // MkDocs instant navigation 대응
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function () { initNav(); });
  }
})();
