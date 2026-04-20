// 로컬 버전: 사용자 인증 없음 (웹 배포판의 EntryForm을 스텁으로 대체)
// 웹 배포판에서는 이 파일이 Google 로그인 + 사용자 등록 UI를 담당하지만,
// 로컬판은 인증이 필요 없으므로 API 참조처만 유지한다.
export const getUserInfo = () => null;
export const getAuthToken = () => null;
export const clearUserInfo = () => {};
export default function EntryForm() { return null; }
