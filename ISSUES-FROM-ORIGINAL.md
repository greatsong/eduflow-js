# 원본 Python 시스템에서 발견된 이슈 및 개선사항

> JS 전환 과정에서 발견한 원본 `data-ai-book/` 시스템의 버그, 비효율, 개선 가능 사항을 기록한다.
> 원본 시스템은 수정하지 않으며, JS 버전에서 수정 적용한다.

---

## 1. chapter_generator.py - 챕터 생성 모듈

### BUG-001: `_load_model_pricing()` 매 호출마다 파일 읽기
- **위치**: `chapter_generator.py:78-91`
- **문제**: `_estimate_cost()`가 호출될 때마다 `model_config.json`을 디스크에서 다시 읽음. 배치 생성 시 챕터 수만큼 반복 I/O 발생.
- **JS 수정**: 생성자에서 한 번만 로드하고 캐싱

### BUG-002: `import re` 가 `_generate_master_toc()` 내부에서 반복 import
- **위치**: `toc_generator.py:232, 243`
- **문제**: `for` 루프 안에서 `import re`가 반복 실행됨 (Python이 캐싱하므로 성능 이슈는 미미하나 코드 품질 문제)
- **JS 수정**: 해당 없음 (JS에서는 최상단 import)

### BUG-003: `regenerate_chapter()` 에서 `asyncio.run()` 호출
- **위치**: `chapter_generator.py:889`
- **문제**: Streamlit 이벤트 루프 안에서 `asyncio.run()` 호출 시 "cannot be called from a running event loop" 에러 가능. Streamlit 페이지에서는 `nest_asyncio` 패치로 우회하고 있으나 근본적 해결 아님.
- **JS 수정**: Node.js는 기본 async/await이므로 문제 없음

### IMPROVEMENT-001: 참고자료 관련성 정렬이 단순 키워드 매칭
- **위치**: `chapter_generator.py:280-307`
- **문제**: 단순 문자열 포함 검사로 관련성 점수 계산. 대소문자 구분 없이 하긴 하지만, 형태소 분석이나 TF-IDF 같은 고급 기법 없음. 현재 수준에서는 충분하지만 향후 개선 여지.
- **JS 수정**: 동일 로직 유지 (현재 수준 충분)

### IMPROVEMENT-002: 로그 파일이 세션마다 새로 생성
- **위치**: `chapter_generator.py:109`
- **문제**: `generation_YYYYMMDD_HHMMSS.log`로 매번 새 파일 생성. 오래된 로그 정리 메커니즘 없음.
- **JS 수정**: 동일 패턴 유지하되, 향후 로그 로테이션 고려

---

## 2. toc_generator.py - 목차 생성 모듈

### BUG-004: JSON 코드블록 추출 로직 취약
- **위치**: `toc_generator.py:143-150`
- **문제**: ` ```json ` 블록 추출 시, 본문 중간에 다른 코드블록이 있으면 잘못된 위치에서 자름. `rfind` 대신 `find`로 첫 번째 종료 마커를 찾아서, 중첩 코드블록이 있으면 실패.
- **JS 수정**: 동일 로직이나, 실제 사용에서 Claude가 순수 JSON만 출력하므로 문제 발생 빈도 낮음

### IMPROVEMENT-003: `max_tokens` 초과 시 복구 전략 없음
- **위치**: `toc_generator.py:126-136`
- **문제**: 응답이 `max_tokens`로 잘리면 에러만 발생. 잘린 JSON을 자동 복구하거나 재시도하는 로직 없음.
- **JS 수정**: 동일 (에러 메시지로 사용자에게 안내). 향후 자동 재시도 추가 가능.

---

## 3. conversation_manager.py - 대화 관리 모듈

### BUG-005: 요약 프롬프트에서 날짜가 UTC 기준
- **위치**: `conversation_manager.py` (요약 생성 부분)
- **문제**: `datetime.now()` 사용 시 서버 시간대에 따라 다른 날짜 표시. KST 의도인데 UTC로 출력될 수 있음.
- **JS 수정**: `new Date().toISOString()`은 UTC이므로 동일 이슈. 한국 시간 필요 시 별도 처리 필요.

---

## 4. Streamlit 페이지 공통

### BUG-006: `step3_messages` 세션 상태가 프로젝트 간 공유
- **위치**: `3_피드백_컨펌.py:21`
- **문제**: `st.session_state.step3_messages`가 프로젝트별이 아닌 전역. 프로젝트 A에서 대화 후 프로젝트 B로 전환하면 A의 대화가 남아있음.
- **JS 수정**: Zustand chatStore에서 프로젝트 변경 시 `clearMessages()` 호출 + 서버에서 프로젝트별 대화 로드

### BUG-007: 배치 생성 중 Streamlit rerun으로 상태 소실
- **위치**: `4_챕터_제작.py` (배치 모드)
- **문제**: Streamlit의 rerun 특성상, 긴 배치 작업 중 UI 상호작용이 어려움. 진행률 표시가 불안정.
- **JS 수정**: SSE 스트리밍으로 백그라운드 작업 + 프론트엔드 실시간 업데이트. 근본적 해결.

---

## 5. 리팩토링 제안 (JS 전환 시 적용)

### REFACTOR-001: PROJECTS_DIR 중복 정의
- **현황**: 모든 라우트 파일(projects.js, discussions.js, toc.js, chapters.js)에서 `PROJECTS_DIR`과 `projectPath()` 함수를 동일하게 정의
- **제안**: 공통 유틸 또는 미들웨어로 추출
- **적용 시기**: Phase 8 (통합 정리) 때 일괄 리팩토링

### REFACTOR-002: SSE 헤더 설정 코드 중복
- **현황**: SSE 엔드포인트마다 동일한 3줄 헤더 설정 반복
- **제안**: `sseHeaders(res)` 유틸 함수로 추출
- **적용 시기**: Phase 8

### REFACTOR-003: chatStore가 Step 간 공유됨
- **현황**: Discussion.jsx(Step 1)과 Feedback.jsx(Step 3)가 동일한 chatStore 사용. 빠르게 전환하면 메시지 섞임 가능.
- **제안**: Step별 메시지를 분리하거나, 페이지 전환 시 명시적 초기화
- **적용 시기**: Phase 8

---

*최종 업데이트: 2026-02-05*
