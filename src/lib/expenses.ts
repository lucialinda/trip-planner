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

export type ExpenseStatus = "tentative" | "confirmed";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  paidByUid: string;
  paidBy: string;
  localCurrency: string;
  localAmount: number;
  rate: number;
  krwAmount: number;
  /** confirmed로 바꿀 때 잠그는 실제 환율 (선택) */
  confirmedRate?: number;
  /** confirmed로 바꿀 때 잠그는 실제 원화 금액 (선택) */
  confirmedKrwAmount?: number;
  status: ExpenseStatus;
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

/** confirmed면 confirmedKrwAmount, 아니면 krwAmount */
export function effectiveKrw(e: Expense): number {
  return e.status === "confirmed" && typeof e.confirmedKrwAmount === "number"
    ? e.confirmedKrwAmount
    : e.krwAmount;
}

/** 정산 참여자 uid 목록을 안전하게 꺼낸다. 비어 있으면 trip 멤버 전원으로 fallback. */
export function getParticipantUids(e: Expense, tripMemberUids: string[]): string[] {
  const explicit = Object.keys(e.participants);
  return explicit.length > 0 ? explicit : tripMemberUids;
}

/** Firestore 문서 → Expense 매핑. 신스키마 가정 (구버전 fallback 없음). */
export function fromDoc(d: QueryDocumentSnapshot): Expense {
  const v = d.data() as Record<string, unknown>;
  const ts = (k: string): Date | undefined => {
    const raw = v[k] as { toDate?: () => Date } | undefined;
    return raw?.toDate?.();
  };
  return {
    id: d.id,
    category: (v.category as ExpenseCategory) ?? "etc",
    description: (v.description as string) ?? "",
    paidByUid: (v.paidByUid as string) ?? "",
    paidBy: (v.paidBy as string) ?? "",
    localCurrency: (v.localCurrency as string) ?? "KRW",
    localAmount: (v.localAmount as number) ?? 0,
    rate: (v.rate as number) ?? 1,
    krwAmount: (v.krwAmount as number) ?? 0,
    confirmedRate: v.confirmedRate as number | undefined,
    confirmedKrwAmount: v.confirmedKrwAmount as number | undefined,
    status: (v.status as ExpenseStatus) ?? "tentative",
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
