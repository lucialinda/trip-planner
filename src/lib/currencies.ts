// 정산 다이얼로그에서 사용하는 통화 메타.
// 환율 변환 자체는 src/lib/exchangeRate.ts 에서 별도로 처리한다.

export interface CurrencyMeta {
  /** ISO 4217 통화 코드 (예: "JPY") */
  code: string;
  /** 입력창 prefix용 기호 */
  symbol: string;
  /** 드롭다운 표시용 국기 이모지 */
  flag: string;
  /** 사람이 읽는 라벨 (한국어) */
  label: string;
  /** 표기 시 소수 자리수 — JPY/KRW/VND/TWD는 0, 그 외 2 */
  decimals: number;
}

/**
 * 지원 통화 마스터.
 * - KRW는 항상 ON 강제 (Phase 4 SettleSettingsDialog 정책).
 * - 기본 ON: KRW + JPY (PROGRESS.md "결정 사항" 항목).
 */
export const ALL_CURRENCIES: CurrencyMeta[] = [
  { code: "KRW", symbol: "₩",   flag: "🇰🇷", label: "한국 원",      decimals: 0 },
  { code: "JPY", symbol: "¥",   flag: "🇯🇵", label: "일본 엔",      decimals: 0 },
  { code: "USD", symbol: "$",   flag: "🇺🇸", label: "미국 달러",    decimals: 2 },
  { code: "EUR", symbol: "€",   flag: "🇪🇺", label: "유로",         decimals: 2 },
  { code: "GBP", symbol: "£",   flag: "🇬🇧", label: "영국 파운드",  decimals: 2 },
  { code: "THB", symbol: "฿",   flag: "🇹🇭", label: "태국 바트",    decimals: 2 },
  { code: "VND", symbol: "₫",   flag: "🇻🇳", label: "베트남 동",    decimals: 0 },
  { code: "TWD", symbol: "NT$", flag: "🇹🇼", label: "대만 달러",    decimals: 0 },
  { code: "SGD", symbol: "S$",  flag: "🇸🇬", label: "싱가폴 달러",  decimals: 2 },
];

/** 코드로 빠르게 조회. 없으면 KRW로 fallback. */
export function getCurrencyMeta(code: string): CurrencyMeta {
  return (
    ALL_CURRENCIES.find((c) => c.code === code) ??
    ALL_CURRENCIES[0] // KRW
  );
}

/**
 * 통화 규칙(decimals)에 맞춰 금액을 표시 문자열로 만든다.
 * 입력값은 NaN/음수 모두 안전하게 처리. 음수는 절대값 표시 + "-" prefix.
 */
export function formatCurrencyAmount(amount: number, code: string): string {
  const meta = getCurrencyMeta(code);
  if (!Number.isFinite(amount)) return `${meta.symbol}0`;
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("ko-KR", {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  return `${sign}${meta.symbol}${formatted}`;
}
