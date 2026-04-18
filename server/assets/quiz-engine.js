/**
 * EduFlow Quiz Engine — 인터랙티브 평가 (assessment_level 4)
 *
 * <div class="ef-quiz" data-quiz-id="q1">
 *   <p class="ef-quiz-question">질문 텍스트</p>
 *   <div class="ef-quiz-options">
 *     <label class="ef-quiz-option" data-correct="true">
 *       <input type="radio" name="q1"> <span>정답 선택지</span>
 *     </label>
 *     <label class="ef-quiz-option">
 *       <input type="radio" name="q1"> <span>오답 선택지</span>
 *     </label>
 *   </div>
 *   <div class="ef-quiz-feedback" data-correct="잘했습니다!" data-wrong="다시 생각해보세요."></div>
 * </div>
 */
(function () {
  'use strict';

  function initQuizEngine() {
    // 이전 요약 버튼 제거 (페이지 전환 시 중복 방지)
    document.querySelectorAll('.ef-quiz-summary-btn').forEach(function (btn) {
      btn.remove();
    });

    var quizzes = document.querySelectorAll('.ef-quiz');
    if (!quizzes.length) return;

    quizzes.forEach(function (quiz) {
      // 이미 초기화된 퀴즈는 건너뜀
      if (quiz.getAttribute('data-initialized')) return;
      quiz.setAttribute('data-initialized', 'true');

      var options = quiz.querySelectorAll('.ef-quiz-option');
      var feedbackEl = quiz.querySelector('.ef-quiz-feedback');
      var checkBtn = document.createElement('button');
      checkBtn.className = 'ef-quiz-check';
      checkBtn.textContent = '채점하기';
      checkBtn.disabled = true;

      var retryBtn = document.createElement('button');
      retryBtn.className = 'ef-quiz-retry';
      retryBtn.textContent = '다시 풀기';
      retryBtn.style.display = 'none';

      options.forEach(function (opt) {
        var radio = opt.querySelector('input[type="radio"]');
        if (radio) {
          radio.addEventListener('change', function () {
            checkBtn.disabled = false;
            options.forEach(function (o) {
              o.classList.remove('correct', 'wrong');
            });
            if (feedbackEl) {
              feedbackEl.classList.remove('show', 'is-correct', 'is-wrong');
              feedbackEl.textContent = '';
            }
            retryBtn.style.display = 'none';
          });
        }
      });

      checkBtn.addEventListener('click', function () {
        var selected = quiz.querySelector('.ef-quiz-option input:checked');
        if (!selected) return;

        var selectedOpt = selected.closest('.ef-quiz-option');
        var isCorrect = selectedOpt.getAttribute('data-correct') === 'true';

        options.forEach(function (opt) {
          if (opt.getAttribute('data-correct') === 'true') {
            opt.classList.add('correct');
          }
        });

        if (isCorrect) {
          selectedOpt.classList.add('correct');
          if (feedbackEl) {
            feedbackEl.textContent = feedbackEl.getAttribute('data-correct') || '정답입니다!';
            feedbackEl.classList.add('show', 'is-correct');
          }
        } else {
          selectedOpt.classList.add('wrong');
          if (feedbackEl) {
            feedbackEl.textContent = feedbackEl.getAttribute('data-wrong') || '다시 확인해보세요.';
            feedbackEl.classList.add('show', 'is-wrong');
          }
          retryBtn.style.display = '';
        }

        checkBtn.disabled = true;
        options.forEach(function (opt) {
          var r = opt.querySelector('input');
          if (r) r.disabled = true;
        });
      });

      retryBtn.addEventListener('click', function () {
        options.forEach(function (opt) {
          opt.classList.remove('correct', 'wrong');
          var r = opt.querySelector('input');
          if (r) { r.checked = false; r.disabled = false; }
        });
        if (feedbackEl) {
          feedbackEl.classList.remove('show', 'is-correct', 'is-wrong');
          feedbackEl.textContent = '';
        }
        checkBtn.disabled = true;
        retryBtn.style.display = 'none';
      });

      var btnWrap = document.createElement('div');
      btnWrap.className = 'ef-quiz-actions';
      btnWrap.appendChild(checkBtn);
      btnWrap.appendChild(retryBtn);

      if (feedbackEl) {
        quiz.insertBefore(btnWrap, feedbackEl);
      } else {
        quiz.appendChild(btnWrap);
      }
    });

    // 퀴즈 요약 (2개 이상일 때만)
    if (quizzes.length > 1) {
      var summaryBtn = document.createElement('button');
      summaryBtn.className = 'ef-quiz-summary-btn';
      summaryBtn.textContent = '전체 결과 확인';
      summaryBtn.addEventListener('click', function () {
        var total = quizzes.length;
        var correct = 0;
        quizzes.forEach(function (q) {
          if (q.querySelector('.ef-quiz-option.correct input:checked')) correct++;
        });
        var pct = Math.round((correct / total) * 100);
        var msg = correct + '/' + total + ' (' + pct + '%)';
        if (pct >= 80) msg += ' — 훌륭합니다!';
        else if (pct >= 60) msg += ' — 좋아요, 조금 더 복습하면 완벽해요!';
        else msg += ' — 해당 내용을 다시 살펴보세요.';
        alert(msg);
      });

      var lastQuiz = quizzes[quizzes.length - 1];
      lastQuiz.parentNode.insertBefore(summaryBtn, lastQuiz.nextSibling);
    }
  }

  // DOM 준비 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuizEngine);
  } else {
    initQuizEngine();
  }

  // MkDocs instant navigation 대응
  if (typeof document$ !== 'undefined') {
    document$.subscribe(function () { initQuizEngine(); });
  }
})();
