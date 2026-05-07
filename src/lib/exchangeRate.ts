// 환율 fetch + 메모리 캐시.
// 정적 export 환경이라 클라이언트에서 직접 fetch (open.er-api.com은 CORS 허용).
//
// 사용처: AddExpenseDialog (Phase 3) — 현지 통화 입력 시 KRW 자동 환산용.
// 캐시는 모듈 스코프 Map. SPA 안에서는 5분간 재호출 없음.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

interface CacheEntry {
  rate: number;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** 진행 중인 fetch 공유 — 같은 통화에 대해 동시 호출이 들어와도 네트워크는 한 번만 */
const inflight = new Map<string, Promise<number>>();

/**
 * `local` 통화 1단위가 KRW로 얼마인지 반환.
 * - "KRW"는 항상 1을 동기적으로 돌려준다 (네트워크 없음).
 * - 캐시 hit이면 즉시 반환, miss면 fetch 후 캐시 저장.
 *
 * @throws Error 네트워크/응답 형식 오류. 호출 측에서 사용자에게 토스트로 알리고
 *               수동 입력 fallback을 제공해야 한다.
 */
export async function fetchKrwRate(local: string): Promise<number> {
  const code = local.toUpperCase();
  if (code === "KRW") return 1;

  const hit = cache.get(code);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.rate;
  }

  const existing = inflight.get(code);
  if (existing) return existing;

  const p = (async () => {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${code}`);
      if (!res.ok) {
        throw new Error(`환율 조회 실패 (HTTP ${res.status})`);
      }
      const data: unknown = await res.json();
      const rate =
        typeof data === "object" &&
        data !== null &&
        "rates" in data &&
        typeof (data as { rates: unknown }).rates === "object" &&
        (data as { rates: Record<string, unknown> }).rates !== null
          ? (data as { rates: Record<string, unknown> }).rates.KRW
          : undefined;
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
        throw new Error("환율 응답 형식 오류");
      }
      cache.set(code, { rate, fetchedAt: Date.now() });
      return rate;
    } finally {
      inflight.delete(code);
    }
  })();

  inflight.set(code, p);
  return p;
}

/**
 * 캐시된 환율을 동기적으로 조회. miss면 undefined.
 * Dialog가 열릴 때 직전 입력 통화의 캐시 hit 여부를 확인할 때 사용.
 */
export function getCachedKrwRate(local: string): number | undefined {
  const code = local.toUpperCase();
  if (code === "KRW") return 1;
  const hit = cache.get(code);
  if (!hit) return undefined;
  if (Date.now() - hit.fetchedAt >= CACHE_TTL_MS) return undefined;
  return hit.rate;
}

/** 테스트/디버그용 — 캐시 비우기. 프로덕션 코드에서 호출하지 말 것. */
export function __clearExchangeRateCache(): void {
  cache.clear();
  inflight.clear();
}
