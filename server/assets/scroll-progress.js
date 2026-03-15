// EduFlow - 스크롤 프로그레스 인디케이터
// 페이지 읽기 진행률을 상단 바로 표시합니다.
document.addEventListener('DOMContentLoaded', function() {
  var bar = document.createElement('div');
  bar.className = 'ef-scroll-progress';
  bar.style.width = '0%';
  document.body.appendChild(bar);

  var ticking = false;

  function updateProgress() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight > 0) {
      var percent = Math.min((scrollTop / docHeight) * 100, 100);
      bar.style.width = percent + '%';
    }
    ticking = false;
  }

  window.addEventListener('scroll', function() {
    if (!ticking) {
      requestAnimationFrame(updateProgress);
      ticking = true;
    }
  });

  updateProgress();
});
