# Phase 2 — Firestore 연동 (읽기 + 카테고리 합계)

> 선행: Phase 1 완료

## 목표

더미 데이터를 실제 `trips/{tripId}/expenses` 구독으로 교체. 카테고리별 합계 계산해서 "가장 많이 쓴 곳" 표시. 1인당 정산은 임시 계산값.

## 진입 방식

`/settle?tripId=xxx` 쿼리 파라미터 사용 (앱의 다른 페이지처럼 `useSearchParams`).

> 트립을 명시하지 않은 `/settle` 진입은 Phase 외 검토. 우선은 첫 번째 활성 트립 자동 선택 (또는 안내 화면).

## 변경 파일

- `src/app/settle/page.tsx`
- 신규: `src/lib/expenses.ts` (스키마 타입 + 헬퍼)

## 타입 정의 (`src/lib/expenses.ts`)

```ts
export type ExpenseCategory =
  | "food" | "cafe" | "transit" | "lodging"
  | "activity" | "shopping" | "etc";

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
  confirmedRate?: number;
  confirmedKrwAmount?: number;
  status: ExpenseStatus;
  paidAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const CATEGORY_META: Record<ExpenseCategory, {
  label: string; icon: string; tone: string;
}> = {
  food:     { label: "식비",       icon: "restaurant",          tone: "sky" },
  cafe:     { label: "카페·간식",  icon: "local_cafe",          tone: "amber" },
  transit:  { label: "교통",       icon: "directions_transit",  tone: "slate" },
  lodging:  { label: "숙박",       icon: "hotel",               tone: "violet" },
  activity: { label: "관광·입장료", icon: "confirmation_number", tone: "rose" },
  shopping: { label: "쇼핑",       icon: "shopping_bag",        tone: "emerald" },
  etc:      { label: "기타",       icon: "category",            tone: "gray" },
};

/** confirmed면 confirmedKrwAmount, 아니면 krwAmount */
export function effectiveKrw(e: Expense): number {
  return e.status === "confirmed" && typeof e.confirmedKrwAmount === "number"
    ? e.confirmedKrwAmount
    : e.krwAmount;
}
```

## 마이그레이션 (구버전 데이터 호환)

기존 `expenses` 문서가 `{ amount, description, paidBy, paidByUid, createdAt }` 형태일 수 있음. 읽기 시 fallback:

```ts
function fromDoc(d: QueryDocumentSnapshot): Expense {
  const v = d.data();
  return {
    id: d.id,
    category: v.category ?? "etc",
    description: v.description ?? "",
    paidByUid: v.paidByUid ?? "",
    paidBy: v.paidBy ?? "",
    localCurrency: v.localCurrency ?? "KRW",
    localAmount: v.localAmount ?? v.amount ?? 0,
    rate: v.rate ?? 1,
    krwAmount: v.krwAmount ?? v.amount ?? 0,
    confirmedRate: v.confirmedRate,
    confirmedKrwAmount: v.confirmedKrwAmount,
    status: v.status ?? "confirmed",
    paidAt: (v.paidAt?.toDate?.() ?? v.createdAt?.toDate?.() ?? new Date()),
    createdAt: v.createdAt?.toDate?.() ?? new Date(),
    updatedAt: v.updatedAt?.toDate?.() ?? v.createdAt?.toDate?.() ?? new Date(),
  };
}
```

## 구현 항목

1. `useEffect` + `onSnapshot`으로 `expenses` 구독, `paidAt desc` 정렬
2. `useMemo`로:
   - `total = sum(effectiveKrw)`
   - `byCategory: Record<ExpenseCategory, number>`
   - `topCategory`: 합계 최대 카테고리
   - `perPerson = total / memberCount` (TODO 주석)
3. 더미 expense 카드 → 실데이터 매핑
4. 빈 상태(`expenses.length === 0`) UI: "아직 정산 내역이 없어요" + 화살표로 FAB 안내
5. 트립 컨텍스트 로딩 / 에러 / 비로그인 분기 처리

## "가장 많이 쓴 곳" 표시

```
{CATEGORY_META[topCategory].label} ({Math.round(byCategory[topCategory] / total * 100)}%)
```

총합 0이면 "기록 없음".

## 수용 기준

- [ ] `/settle?tripId=...` 진입 시 실제 expenses가 보임
- [ ] 구버전 `amount`만 있는 문서도 깨지지 않고 표시
- [ ] 카테고리 합계가 정확하고, 가장 많이 쓴 곳 라벨이 동적으로 갱신됨
- [ ] 빈 상태/로딩/에러 분기 모두 노출 가능
- [ ] 새 문서 생성/삭제(콘솔에서) 시 실시간 반영
