# Phase 4 — 설정 다이얼로그 (점 세개 메뉴)

> 선행: Phase 3 완료 (다이얼로그가 카테고리/통화 enabled 목록을 참조하도록 되어 있어야 함)

## 목표

상단 우측 `more_vert` 클릭 → 트립 단위 정산 설정 다이얼로그. 활성 카테고리/통화/기본통화를 설정해 추가 다이얼로그에 반영.

## 변경 파일

- 신규: `src/components/SettleSettingsDialog.tsx`
- `src/app/settle/page.tsx` (헤더 버튼 → dropdown menu → "정산 설정")
- `src/lib/expenses.ts` (settings 기본값/타입 추가)

## 타입

```ts
export interface SettleSettings {
  enabledCategories: ExpenseCategory[];
  enabledCurrencies: string[];
  defaultCurrency: string;
}

export const DEFAULT_SETTLE_SETTINGS: SettleSettings = {
  enabledCategories: ["food","cafe","transit","lodging","activity","shopping","etc"],
  enabledCurrencies: ["KRW","JPY"],
  defaultCurrency: "JPY",
};
```

## 저장 위치

`trips/{tripId}.settleSettings` 필드.

```ts
await updateDoc(doc(db, "trips", tripId), {
  settleSettings: { enabledCategories, enabledCurrencies, defaultCurrency },
});
```

읽기는 trip 문서 구독에 묶어서 가져오고 fallback 적용:

```ts
const settings = trip?.settleSettings ?? DEFAULT_SETTLE_SETTINGS;
```

## 다이얼로그 구성

상단 우측 dropdown:
- "정산 설정" (이번 단계)
- "내보내기" (추후)
- "도움말" (추후)

다이얼로그 섹션:

1. **표시할 카테고리**
   - 7개 카테고리 체크박스 + 아이콘/라벨
   - 최소 1개는 켜져 있어야 저장 가능

2. **표시할 통화**
   - 9개 통화 체크박스 + 국기/심볼/라벨
   - KRW는 항상 ON 고정 (체크박스 disabled)
   - 기본 통화는 enabled 목록 안에서만 선택 가능

3. **기본 통화**
   - 라디오 그룹, 위 enabled 통화만 노출
   - enabled에서 빠지면 자동으로 KRW로 폴백

하단: 취소 / 저장. 저장 시 토스트 "정산 설정을 저장했어요".

## 적용 흐름

- 설정 저장 → trip 문서 업데이트 → onSnapshot으로 자동 반영
- Phase 3의 AddExpenseDialog는 props로 settings를 받는 형태로 리팩터
- 카테고리 그리드 / 통화 드롭다운 / 기본 통화 모두 settings 기반

## 수용 기준

- [ ] 점 세개 → 메뉴에 "정산 설정" 노출
- [ ] 다이얼로그에서 카테고리/통화 토글 가능
- [ ] KRW 체크박스는 항상 ON & disabled
- [ ] 기본 통화 라디오는 enabled 통화 변경에 따라 동기화
- [ ] 저장 후 추가 다이얼로그에서 즉시 반영됨 (새로고침 불필요)
- [ ] 설정이 없는 트립도 기본값으로 잘 동작
