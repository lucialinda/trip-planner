import type { QueryDocumentSnapshot } from "firebase/firestore";

// ---------- 타입 ----------

export type ExpenseCategory =
  | "food"
  | "cafe"
  | "transit"
  | "lodging"
  | "activity"
  | "shopping"
  | "etc";

export type ExpenseStatus = "tentative" | "requested" | "confirmed";

/**
 * 외화 결제 환율 상태.
 * - "estimated" : 카드 전표매입 전, 가환율 기준 예상 원화 금액
 * - "finalized" : 전표매입 후 최종 청구 원화 금액 확정
 * KRW 결제에는 이 필드가 없거나 undefined.
 */
export type ExchangeRateStatus = "estimated" | "finalized";

/** 환율 출처 */
export type FxSource = "manual" | "api" | "card_statement";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  paidByUid: string;
  paidBy: string;

  // ── 결제 통화 / 금액 ──────────────────────────────
  /** 결제 통화 코드 ("KRW", "USD", "JPY" 등). localCurrency 와 동일 의미, 신규 필드명. */
  paymentCurrency: string;
  /** @deprecated paymentCurrency 로 대체. 하위 호환용 */
  localCurrency: string;

  /** 외화 결제 금액 (KRW 결제 시에는 0 또는 krwAmount와 동일) */
  foreignAmount: number;
  /** @deprecated foreignAmount 로 대체. 하위 호환용 */
  localAmount: number;

  // ── 환율 ─────────────────────────────────────────
  /** 적용 환율 (KRW 결제면 1). 가환율 또는 확정 환율 중 최신 값. */
  exchangeRate: number;
  /** @deprecated exchangeRate 로 대체. 하위 호환용 */
  rate: number;

  /** 환율 상태 (외화 결제 시에만 의미 있음) */
  exchangeRateStatus?: ExchangeRateStatus;

  /** 환율 출처 */
  fxSource?: FxSource;

  // ── 원화 금액 ─────────────────────────────────────
  /**
   * KRW 결제: 실제 결제 원화 금액.
   * 외화 결제 + estimated: 가환율 기준 예상 원화 금액 (= estimatedKrwAmount).
   * 외화 결제 + finalized: 최종 청구 원화 금액 (= finalizedKrwAmount).
   * ※ effectiveKrw() 를 통해 꺼내는 것을 권장.
   */
  krwAmount: number;

  /** 외화 결제 — 가환율 기준 예상 원화 금액 */
  estimatedKrwAmount?: number;

  /** 외화 결제 — 전표매입 후 최종 청구 원화 금액 */
  finalizedKrwAmount?: number;

  /** 카드 전표매입 확정 여부 */
  cardSettlementConfirmed?: boolean;
  /** 카드 전표매입 확정 시각 */
  cardSettlementConfirmedAt?: Date;

  // ── 레거시 (하위 호환) ────────────────────────────
  /** @deprecated exchangeRateStatus="finalized" + finalizedKrwAmount 로 대체 */
  confirmedRate?: number;
  /** @deprecated finalizedKrwAmount 로 대체 */
  confirmedKrwAmount?: number;

  // ── 정산 상태 ─────────────────────────────────────
  status: ExpenseStatus;
  settlementRequestId?: string;
  settlementRequestedAt?: Date;
  settledAt?: Date;

  // ── 시각 정보 ─────────────────────────────────────
  paidAt: Date;

  /** 정산 참여자 uid 맵 (결제자 포함). 비어 있으면 호출 측에서 멤버 전원으로 해석 */
  participants: Record<string, true>;

  createdByUid?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------- 카테고리 메타 ----------

export interface CategoryMeta {
  label: string;
  icon: string;
  /** 좌측 12x12 아이콘 박스 Tailwind 클래스 */
  iconBoxClass: string;
}

export const CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
  food: {
    label: "식비",
    icon: "restaurant",
    iconBoxClass: "bg-primary/10 border-primary/15 text-primary",
  },
  cafe: {
    label: "카페·간식",
    icon: "local_cafe",
    iconBoxClass: "bg-amber-50 border-amber-100 text-amber-600",
  },
  transit: {
    label: "교통",
    icon: "directions_transit",
    iconBoxClass: "bg-slate-50 border-slate-100 text-on-surface-variant",
  },
  lodging: {
    label: "숙박",
    icon: "hotel",
    iconBoxClass: "bg-tertiary/10 border-tertiary/20 text-tertiary",
  },
  activity: {
    label: "관광·입장료",
    icon: "confirmation_number",
    iconBoxClass: "bg-rose-50 border-rose-100 text-rose-500",
  },
  shopping: {
    label: "쇼핑",
    icon: "shopping_bag",
    iconBoxClass: "bg-emerald-50 border-emerald-100 text-emerald-600",
  },
  etc: {
    label: "기타",
    icon: "category",
    iconBoxClass: "bg-slate-50 border-slate-100 text-on-surface-variant",
  },
};

// ---------- 헬퍼 ----------

/**
 * 정산에 사용할 실제 원화 금액을 반환.
 * 우선순위:
 *   1. finalizedKrwAmount (전표매입 확정)
 *   2. estimatedKrwAmount (가환율 예상)
 *   3. krwAmount (기본값 / KRW 결제)
 */
export function effectiveKrw(e: Expense): number {
  if (typeof e.finalizedKrwAmount === "number" && e.finalizedKrwAmount > 0) {
    return e.finalizedKrwAmount;
  }
  if (typeof e.estimatedKrwAmount === "number" && e.estimatedKrwAmount > 0) {
    return e.estimatedKrwAmount;
  }
  // 레거시 confirmedKrwAmount 도 fallback으로 처리
  if (
    e.status === "confirmed" &&
    typeof e.confirmedKrwAmount === "number" &&
    e.confirmedKrwAmount > 0
  ) {
    return e.confirmedKrwAmount;
  }
  return e.krwAmount;
}

/** 외화 결제 여부 */
export function isForeignCurrency(e: Expense): boolean {
  return (e.paymentCurrency ?? e.localCurrency) !== "KRW";
}

/** 가환율 적용 상태 여부 */
export function isEstimated(e: Expense): boolean {
  return isForeignCurrency(e) && e.exchangeRateStatus === "estimated";
}

/** 확정 완료 상태 여부 */
export function isFinalized(e: Expense): boolean {
  return isForeignCurrency(e) && e.exchangeRateStatus === "finalized";
}

/** 정산 참여자 uid 목록을 안전하게 꺼낸다. 비어 있으면 trip 멤버 전원으로 fallback. */
export function getParticipantUids(e: Expense, tripMemberUids: string[]): string[] {
  const explicit = Object.keys(e.participants);
  return explicit.length > 0 ? explicit : tripMemberUids;
}

/** Firestore 문서 → Expense 매핑 */
export function fromDoc(d: QueryDocumentSnapshot): Expense {
  const v = d.data() as Record<string, unknown>;
  const ts = (k: string): Date | undefined => {
    const raw = v[k] as { toDate?: () => Date } | undefined;
    return raw?.toDate?.();
  };

  const paymentCurrency = (v.paymentCurrency as string) ?? (v.localCurrency as string) ?? "KRW";
  const foreignAmount = (v.foreignAmount as number) ?? (v.localAmount as number) ?? 0;
  const exchangeRate = (v.exchangeRate as number) ?? (v.rate as number) ?? 1;
  const krwAmount = (v.krwAmount as number) ?? 0;

  return {
    id: d.id,
    category: (v.category as ExpenseCategory) ?? "etc",
    description: (v.description as string) ?? "",
    paidByUid: (v.paidByUid as string) ?? "",
    paidBy: (v.paidBy as string) ?? "",

    paymentCurrency,
    localCurrency: paymentCurrency,

    foreignAmount,
    localAmount: foreignAmount,

    exchangeRate,
    rate: exchangeRate,

    exchangeRateStatus: v.exchangeRateStatus as ExchangeRateStatus | undefined,
    fxSource: v.fxSource as FxSource | undefined,

    krwAmount,
    estimatedKrwAmount: v.estimatedKrwAmount as number | undefined,
    finalizedKrwAmount: v.finalizedKrwAmount as number | undefined,

    cardSettlementConfirmed: v.cardSettlementConfirmed as boolean | undefined,
    cardSettlementConfirmedAt: ts("cardSettlementConfirmedAt"),

    confirmedRate: v.confirmedRate as number | undefined,
    confirmedKrwAmount: v.confirmedKrwAmount as number | undefined,

    status: (v.status as ExpenseStatus) ?? "tentative",
    settlementRequestId: v.settlementRequestId as string | undefined,
    settlementRequestedAt: ts("settlementRequestedAt"),
    settledAt: ts("settledAt"),
    paidAt: ts("paidAt") ?? ts("createdAt") ?? new Date(),
    participants:
      v.participants && typeof v.participants === "object"
        ? (v.participants as Record<string, true>)
        : {},
    createdByUid: v.createdByUid as string | undefined,
    createdBy: v.createdBy as string | undefined,
    createdAt: ts("createdAt") ?? new Date(),
    updatedAt: ts("updatedAt") ?? ts("createdAt") ?? new Date(),
  };
}

// ---------- 표시용 포맷 ----------

/** "2026.05.04 • 19:30" */
export function formatPaidAt(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${d} • ${hh}:${mm}`;
}

/** "₩92,000" */
export function formatKrw(amount: number): string {
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`;
}
