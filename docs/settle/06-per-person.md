# Phase 6 — 1인당 정산 폼 (계산 로직 TODO)

> 선행: Phase 5 완료

## 목표

레퍼런스의 "1인당 정산 금액" 카드를 실제 폼/모달로 만들되, **정산 방식 계산 로직은 보류**(TODO). 임시 표시는 `총합 / 멤버수`.

## 변경 파일

- 신규: `src/components/SplitMethodDialog.tsx`
- `src/app/settle/page.tsx` (카드 우측 톱니 버튼 → 다이얼로그)

## UI

Bento 카드 우상단에 작은 톱니 버튼 추가. 클릭 시 다이얼로그:

1. **정산 방식** 라디오
   - (a) 1/n — 전원 동일 분배
   - (b) 결제자 제외 1/n — 결제자는 본인 몫 빼고 분배
   - (c) 비율 입력 — 멤버별 가중치 입력 (UI만, 합 100% 검증 X)
2. **포함 항목** 체크박스 (기본 전체)
   - tentative 포함 / confirmed만
3. 결과 미리보기 영역 — `// TODO 계산 로직 미구현` 회색 박스

하단: 닫기 버튼만. 저장 동작 없음 (Phase 6에서는 UI만).

## 카드 본문 표시

```
₩ {Math.round(total / memberCount).toLocaleString()}
ⓘ 임시 계산값
```

`ⓘ`에 hover/tap 시 툴팁/시트로 안내:
> "정확한 1인당 정산 금액은 추후 업데이트 예정입니다. 현재는 총 지출 ÷ 인원수로 표시됩니다."

## 데이터 모델 메모 (실제 구현 시)

```ts
type SplitMethod =
  | { type: "even" }
  | { type: "even_excluding_payer" }
  | { type: "ratio"; weights: Record<string, number> };
```

향후 `trips/{tripId}.settleSettings.splitMethod`에 저장.

## 수용 기준

- [ ] Bento 카드 우상단 톱니 버튼 노출
- [ ] 다이얼로그에 라디오 3종 + 포함 항목 + 미리보기 영역
- [ ] 카드 본문은 임시 계산값(총합/인원) 표시 + ⓘ 안내
- [ ] 저장 동작 없음을 사용자에게 명확히 (TODO 라벨)

## TODO (다음 작업 큐)

- [ ] 정산 방식별 계산 함수 (`computeSplit(expenses, members, method)`)
- [ ] 누가 누구에게 얼마 보내야 하는지 정산 그래프
- [ ] 정산 이력(누가 송금 완료) 트래킹
