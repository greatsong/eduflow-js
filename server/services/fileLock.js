/**
 * 인메모리 async 뮤텍스 — 파일 경로별 동시 쓰기 방지
 *
 * 20~30명 동시 사용 시 users.json, progress.json, conversation.json 등
 * 읽기→수정→쓰기 과정에서 Last-Write-Wins 문제를 방지한다.
 *
 * 사용법:
 *   import { withLock } from './fileLock.js';
 *   await withLock('/data/users.json', async () => {
 *     const data = JSON.parse(await readFile(path));
 *     data.push(newItem);
 *     await writeFile(path, JSON.stringify(data));
 *   });
 */

const locks = new Map(); // filePath → Promise chain

/**
 * 파일 경로에 대한 배타적 잠금 내에서 fn을 실행.
 * 같은 filePath에 대해 동시 호출되면 순차 실행을 보장한다.
 *
 * @param {string} filePath - 잠금 키 (실제 파일 경로 또는 논리적 키)
 * @param {() => Promise<T>} fn - 잠금 내에서 실행할 비동기 함수
 * @returns {Promise<T>} fn의 반환값
 */
export async function withLock(filePath, fn) {
  // 현재 대기열의 끝을 가져온다
  const prev = locks.get(filePath) || Promise.resolve();

  // 새 작업을 체인에 연결
  const next = prev.then(
    () => fn(),
    () => fn(), // 이전 작업 실패와 무관하게 실행
  );

  // 정리: 체인 끝을 업데이트 (에러 전파 방지)
  const cleanup = next.catch(() => {});
  locks.set(filePath, cleanup);

  // 체인이 비면 Map에서 제거 (메모리 누수 방지)
  cleanup.then(() => {
    if (locks.get(filePath) === cleanup) {
      locks.delete(filePath);
    }
  });

  return next;
}
