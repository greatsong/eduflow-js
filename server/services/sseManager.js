/**
 * SSE 연결 관리자 — 동시 연결 추적, 사용자별 제한, stale 자동 정리
 *
 * 멀티유저(googleId 기준 격리) + heartbeat 기반 좀비 연결 회수.
 */

const MAX_PER_USER = 5;                 // 사용자당 최대 SSE 동시 연결
const HEARTBEAT_INTERVAL = 30 * 1000;   // 30초마다 heartbeat(SSE 주석) 전송
const HARD_TIMEOUT = 60 * 60 * 1000;    // 안전망: 1시간 절대 타임아웃

// userId → Map<connId, { res, heartbeat, hardTimer }>
const connections = new Map();
let nextId = 1;

/** 좀비(이미 닫힌) 연결을 정리한다. */
function reclaimStale(userConns) {
  for (const [cid, conn] of userConns) {
    if (conn.res.writableEnded || conn.res.destroyed || conn.res.closed) {
      clearInterval(conn.heartbeat);
      clearTimeout(conn.hardTimer);
      userConns.delete(cid);
    }
  }
}

/**
 * SSE 연결 등록. 제한 초과 시 false 반환.
 * @returns {{ ok: boolean, connId: number | null }}
 */
export function registerSSE(req, res) {
  const userId = req.user?.googleId || req.ip || 'anonymous';
  let userConns = connections.get(userId);
  if (!userConns) {
    userConns = new Map();
    connections.set(userId, userConns);
  }

  // 새 연결 등록 전에 좀비 슬롯 회수
  reclaimStale(userConns);

  if (userConns.size >= MAX_PER_USER) {
    return { ok: false, connId: null };
  }

  const connId = nextId++;
  const conn = { res, heartbeat: null, hardTimer: null };

  // 프록시 버퍼링 방지 (flushHeaders는 라우트에서 호출됨)
  if (!res.headersSent) {
    res.setHeader('X-Accel-Buffering', 'no');
  }

  const cleanup = () => {
    if (!userConns.has(connId)) return;
    clearInterval(conn.heartbeat);
    clearTimeout(conn.hardTimer);
    userConns.delete(connId);
    if (userConns.size === 0) connections.delete(userId);
  };

  // heartbeat: SSE 주석 라인 전송. write 실패 = 연결 끊김 → cleanup.
  conn.heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed || res.closed) {
      cleanup();
      return;
    }
    try {
      res.write(': hb\n\n');
    } catch {
      try { res.end(); } catch { /* already closed */ }
      cleanup();
    }
  }, HEARTBEAT_INTERVAL);

  // 안전망: 1시간 절대 타임아웃 (정상 작업은 훨씬 이전에 끝남)
  conn.hardTimer = setTimeout(() => {
    try { res.end(); } catch { /* already closed */ }
    cleanup();
  }, HARD_TIMEOUT);

  // 클라이언트 이탈 감지 — req/res 양쪽 리스닝 (SSE에선 res.close가 더 신뢰도 높음)
  res.on('close', cleanup);
  res.on('error', cleanup);
  req.on('close', cleanup);
  req.on('error', cleanup);

  userConns.set(connId, conn);
  return { ok: true, connId };
}

/** 현재 활성 연결 통계 (디버깅/관리자 대시보드용) */
export function getStats() {
  let total = 0;
  const perUser = {};
  for (const [userId, set] of connections) {
    perUser[userId] = set.size;
    total += set.size;
  }
  return { total, perUser, maxPerUser: MAX_PER_USER };
}
