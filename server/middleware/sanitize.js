import { basename } from 'path';

/**
 * ID/파일명에서 Path Traversal 공격을 방어한다.
 * 영숫자, 하이픈, 언더스코어, 점, 한글만 허용.
 */
export function sanitizeId(id) {
  if (!id || typeof id !== 'string') return '';
  // 경로 구분자 제거 후 basename만 사용
  const clean = basename(id);
  // .. 포함 시 거부
  if (clean.includes('..')) return '';
  return clean;
}

/**
 * 파일명을 안전하게 정제한다.
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const clean = basename(filename);
  if (clean.includes('..')) return '';
  return clean;
}
