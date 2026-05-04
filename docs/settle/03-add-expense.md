# Phase 3 — 추가 다이얼로그 + 환율 fetch

> 선행: Phase 2 완료

## 목표

FAB 클릭 → 정산 항목 입력 다이얼로그. 카테고리 그리드 선택 + 현지/원화 입력 + 실시간 환율 자동 환산.

## 변경 파일

- 신규: `src/components/AddExpenseDialog.tsx`
- 신규: `src/lib/exchangeRate.ts`
- 신규: `src/lib/currencies.ts`
- `src/app/settle/page.tsx` (FAB → dialog open 연결)

## 통화 메타 (`src/lib/currencies.ts`)

```ts
export interface CurrencyMeta {
  code: string;       // "JPY"
  symbol: string;     // "¥"
  flag: string;       // "🇯🇵"
  label: string;      // "일본 엔"
  decimals: number;   // 0 | 2
}

export const ALL_CURRENCIES: CurrencyMeta[] = [
  { code: "KRW", symbol: "₩", flag: "🇰🇷", label: "한국 원",  decimals: 0 },
  { code: "JPY", symbol: "¥", flag: "🇯🇵", label: "일본 엔",  decimals: 0 },
  { code: "USD", symbol: "$", flag: "🇺🇸", label: "미국 달러", decimals: 2 },
  { code: "EUR", symbol: "€", flag: "🇪🇺", label: "유로",     decimals: 2 },
  { code: "GBP", symbol: "£", flag: "🇬🇧", label: "영국 파운드", decimals: 2 },
  { code: "THB", symbol: "฿", flag: "🇹🇭", label: "태국 바트", decimals: 2 },
  { code: "VND", symbol: "₫", flag: "🇻🇳", label: "베트남 동", decimals: 0 },
  { code: "TWD", symbol: "NT$", flag: "🇹🇼", label: "대만 달러", decimals: 0 },
  { code: "SGD", symbol: "S$", flag: "🇸🇬", label: "싱가폴 달러", decimals: 2 },
];
```

## 환율 모듈 (`src/lib/exchangeRate.ts`)

```ts
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { rate: number; fetchedAt: number }>();

/** local 통화 1단위가 KRW로 얼마인지 */
export async function fetchKrwRate(local: string): Promise<number> {
  if (local === "KRW") return 1;
  const hit = cache.get(local);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.rate;
  const res = await fetch(`https://open.er-api.com/v6/latest/${local}`);
  if (!res.ok) throw new Error("환율 조회 실패");
  const data = await res.json();
  const rate = data?.rates?.KRW;
  if (typeof rate !== "number") throw new Error("환율 응답 형식 오류");
  cache.set(local, { rate, fetchedAt: Date.now() });
  return rate;
}
```

> 정적 export 환경이라 클라이언트에서 직접 fetch. CORS 허용되는 API.

## 다이얼로그 구조

`Dialog` (shadcn) 사용. 섹션 4개:

1. **카테고리 선택** — 4×2 그리드 (활성화된 카테고리만), 선택 시 ring + bg 강조
2. **설명** — Input "어디에 썼나요?"
3. **금액**
   - 통화 드롭다운 (활성화된 통화만, 기본값=`defaultCurrency`)
   - 현지 금액 Input (debounce 400ms로 환율 fetch → 원화 자동입력)
   - 원화 금액 Input (사용자가 직접 수정 가능, 수정 시 자동입력 해제)
   - 환율 표시: "1 JPY ≈ 9.12 KRW (가환율)"
4. **결제 정보**
   - 결제자 (멤버 드롭다운, 기본=현재 사용자)
   - 결제 일시 (datetime-local, 기본=현재)

하단 버튼: 취소 / 저장. 저장 시 status는 `tentative` 고정.

## Firestore write

```ts
await addDoc(collection(db, "trips", tripId, "expenses"), {
  category, description, paidByUid, paidBy,
  localCurrency, localAmount, rate, krwAmount,
  status: "tentative",
  paidAt: Timestamp.fromDate(paidAt),
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
```

## UX 디테일

- 환율 fetch 중: 원화 입력창에 스켈레톤/로딩 점
- 환율 실패: 토스트 + 원화 직접 입력 가능
- 통화가 KRW면 환율 표시 영역 숨기고 현지=원화 동기화
- 입력값 검증: 금액 > 0, 카테고리/설명/결제자 필수
- 다이얼로그 열릴 때 카테고리 첫 항목으로 포커스, 키보드 enter로 저장 가능

## 수용 기준

- [ ] FAB 클릭으로 다이얼로그 열림
- [ ] 카테고리 그리드는 settings의 enabledCategories만 표시 (기본 전체)
- [ ] 통화 드롭다운은 enabledCurrencies만 표시 (기본 KRW + JPY)
- [ ] JPY 1000 입력 → 원화 자동 환산 (소수점 둘째자리 반올림)
- [ ] 사용자가 원화 직접 수정해도 가능
- [ ] 저장 후 다이얼로그 닫히고 리스트에 즉시 반영
- [ ] 네트워크 차단 환경: 환율 실패 토스트 + 수동 입력 동작
