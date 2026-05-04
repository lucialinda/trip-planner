# 정산 페이지 작업 진행 체크리스트

> 다음 세션에서 이어갈 때 **이 파일부터** 보면 어디까지 됐는지 한눈에 보임.
> 각 Phase 시작 전에 해당 MD 다시 읽고, 완료 시 체크박스 채울 것.

## 결정 사항 요약

- 카테고리: food, cafe, transit, lodging, activity, shopping, etc (총 7개)
- 통화: KRW, JPY, USD, EUR, GBP, THB, VND, TWD, SGD (기본 ON: KRW + JPY)
- 환율 API: `https://open.er-api.com/v6/latest/{LOCAL}` (무료, 키 불필요)
- status: `tentative` / `confirmed` — 확정 후에도 편집 가능
- 설정창: 점 세개 메뉴 → 카테고리/통화 토글 + 기본 통화
- 1인당 정산: Phase 6에서 폼만, 계산은 TODO

## Phase 진행 상태

- [x] **Phase 1** — 정적 UI 이전 (`01-static-ui.md`)
  - [x] settle/page.tsx 레퍼런스 레이아웃 이전
  - [x] sky → primary(navy) 컬러 치환
  - [x] FAB 홈 화면과 동일하게
  - [x] BottomNav Expenses 활성

- [ ] **Phase 2** — Firestore 읽기 (`02-firestore-read.md`)
  - [ ] `src/lib/expenses.ts` 타입/메타/effectiveKrw
  - [ ] `/settle?tripId=...` 진입 + onSnapshot
  - [ ] 카테고리 합계 / topCategory 표시
  - [ ] 구버전 amount 마이그레이션 fallback
  - [ ] 빈/로딩/에러 분기

- [ ] **Phase 3** — 추가 다이얼로그 (`03-add-expense.md`)
  - [ ] `src/lib/currencies.ts`
  - [ ] `src/lib/exchangeRate.ts` (5분 캐시)
  - [ ] `AddExpenseDialog.tsx` — 카테고리 그리드, 통화/금액, 결제자/일시
  - [ ] FAB → dialog 연결
  - [ ] 환율 실패 시 수동 입력 fallback

- [ ] **Phase 4** — 설정 다이얼로그 (`04-settings.md`)
  - [ ] DEFAULT_SETTLE_SETTINGS
  - [ ] `SettleSettingsDialog.tsx`
  - [ ] 점 세개 메뉴
  - [ ] AddExpenseDialog가 settings 반영
  - [ ] KRW 항상 ON 강제

- [ ] **Phase 5** — 확정/편집 (`05-confirm-and-edit.md`)
  - [ ] `EditExpenseDialog.tsx`
  - [ ] status 토글 + 확정 환율/원화 입력
  - [ ] 카드 탭 → 편집
  - [ ] 삭제
  - [ ] Hero 배지 동적 (선택)

- [ ] **Phase 6** — 1인당 정산 폼 (`06-per-person.md`)
  - [ ] `SplitMethodDialog.tsx` (UI only)
  - [ ] Bento 카드 톱니 버튼
  - [ ] 임시 계산값 + ⓘ 안내

- [ ] **Phase 7 (초안)** — 멀티선택 그룹 1/n 정산 (`07-group-settle.md`)
  - [ ] `src/lib/settle.ts` — `computeGroupSplit()` 구현 + 단위 테스트
  - [ ] 카드 멀티선택 모드 + 하단 액션바
  - [ ] `GroupSettleDialog.tsx` — 참여자 체크 + 결과 송금 매트릭스
  - [ ] (선택) `trips/{tripId}/settlements/{id}` 컬렉션 — 정산 이력
  - [ ] Phase 6과의 관계 결정 (흡수 / 유지)

## 보강 메모 (작업 중 발견 사항)

> 각 Phase에서 새로 알게 된 것 / 변경 사항을 여기에 누적. 마지막에 `00-overview.md`로 흡수.

- **Phase 1**:
  - 헤더 좌측 ← 버튼은 `router.back()` 사용 (BottomNav 탭이지만 trip 상세에서 진입하는 케이스 고려).
  - `glass-elevated` / `glass-panel`은 globals.css에 이미 네이비 알파 톤으로 정의되어 있어 별도 유틸 추가 없이 그대로 사용.
  - FAB은 홈과 동일하게 `fixed left-1/2 -translate-x-1/2 max-w-3xl` 컨테이너 안에서 `ml-auto`로 우측 정렬. 다만 BottomNav가 `bottom-0`에 sticky하게 깔리므로 정산 FAB은 가림 방지 위해 `bottom-24` 사용 (홈은 `bottom-6` — 홈에 BottomNav 없음).
  - 카테고리 톤 매핑: food=primary, lodging=tertiary, cafe=amber, activity=rose, shopping=emerald, transit/etc=slate(=on-surface-variant). Phase 2에서 `expenses.ts` 메타로 빼낼 예정.
  - 1인당 카드에 Phase 6 자리잡기 위한 `tune` 톱니 버튼만 미리 배치 (noop). 임시 계산값은 `총액 / 4`.
