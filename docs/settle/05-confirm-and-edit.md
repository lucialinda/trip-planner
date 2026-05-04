# Phase 5 — 확정 상태 토글 + 편집 다이얼로그

> 선행: Phase 4 완료

## 목표

각 expense를 카드 정산 환율 기준으로 "확정" 처리하고, 확정 후에도 편집 가능한 다이얼로그 제공. 합계 계산은 `effectiveKrw`로 이미 분기되어 있음.

## 변경 파일

- 신규: `src/components/EditExpenseDialog.tsx` (Add와 분리하거나 조건부 한 컴포넌트로)
- `src/app/settle/page.tsx` (expense 카드 클릭 → 편집 dialog)
- `src/lib/expenses.ts` (필요 시 헬퍼 추가)

## 인터랙션

- expense 카드 탭 → 편집 다이얼로그
- 다이얼로그는 Phase 3의 입력 다이얼로그 기반으로 확장:
  - 상단에 "정산 상태" 토글 (`tentative` ↔ `confirmed`)
  - `confirmed`일 때만 노출되는 "확정 환율 / 확정 원화" 입력 섹션
- 우상단 "삭제" 아이콘 (확인 토스트 후 `deleteDoc`)
- 저장 시 `updatedAt: serverTimestamp()` 갱신

## 확정 토글 동작

- `tentative → confirmed` 전환 시
  - 기본값: `confirmedRate = rate`, `confirmedKrwAmount = krwAmount`
  - 사용자가 곧바로 확정값 수정 가능
- `confirmed → tentative` 전환 시
  - confirmedRate / confirmedKrwAmount 필드 유지 (다시 켜면 그대로 복원)
  - 합계 계산은 `krwAmount`로 회귀

## 데이터 변경

```ts
await updateDoc(doc(db, "trips", tripId, "expenses", expId), {
  category, description,
  paidByUid, paidBy,
  localCurrency, localAmount, rate, krwAmount,
  status,
  ...(status === "confirmed" ? { confirmedRate, confirmedKrwAmount } : {}),
  paidAt: Timestamp.fromDate(paidAt),
  updatedAt: serverTimestamp(),
});
```

> Firestore에서 필드 제거가 필요하면 `deleteField()` 사용. 하지만 토글 시 값을 유지하는 게 UX상 낫다.

## 표시 라벨

| status | 카드 우하단 라벨 | 색상 |
|---|---|---|
| `tentative` | "정산 예정" | `text-on-surface-variant` |
| `confirmed` | "정산 완료" | `text-tertiary` (violet) — 레퍼런스 톤 유지 |

Hero 카드 배지도 `confirmed` 비율 기반으로 변형 가능 (선택):
- 전부 confirmed: "정산 완료"
- 일부: "정산 진행 중"
- 0건: "정산 시작 전"

## 수용 기준

- [ ] 카드 탭 → 편집 다이얼로그 열림
- [ ] 토글로 tentative ↔ confirmed 전환 가능
- [ ] 확정 시 확정 환율/원화 직접 수정 가능
- [ ] 합계 카드에 effectiveKrw가 정확히 반영
- [ ] 삭제 동작 (확인 후 실행)
- [ ] 다른 사용자(다른 클라이언트)에서도 실시간 반영
