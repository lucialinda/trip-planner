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
- **결제자 + 정산 인원**(2026-05-05 추가): 지출마다 결제자 1명 지정 + 정산 참여자 가변(체크박스). 결제자는 자동 체크되고 해제 불가. 미지정 시 기본 멤버 전원
- **정산 요청 메시지 공유**(2026-05-05 추가): 헤더 "정산 요청" 버튼으로 선택 모드 진입 → 항목 멀티선택 → `navigator.share()`로 시스템 공유시트 호출(모바일에서 카톡/메시지 등 노출). 미지원 환경(데스크톱)에서는 클립보드 복사 + 토스트
- **"보낸 항목 정산완료로 표시" 옵션**(2026-05-05 추가): 정산 요청 다이얼로그 하단 체크박스. 활성 시 공유 직후 선택 항목들의 `status`를 `confirmed`로 일괄 업데이트(`writeBatch`). 기본 ON

## Phase 진행 상태

- [x] **Phase 1** — 정적 UI 이전 (`01-static-ui.md`)
  - [x] settle/page.tsx 레퍼런스 레이아웃 이전
  - [x] sky → primary(navy) 컬러 치환
  - [x] FAB 홈 화면과 동일하게
  - [x] BottomNav Expenses 활성

- [x] **Phase 2** — Firestore 읽기 (`02-firestore-read.md`)
  - [x] `src/lib/expenses.ts` 타입/메타/effectiveKrw + `fromDoc` / `getParticipantUids` / `formatPaidAt` / `formatKrw`
  - [x] `/settle?id=...` 진입 + onSnapshot (trip 문서 + expenses 컬렉션 동시 구독)
  - [x] 카테고리 합계 / topCategory 표시 (총합 0이면 "기록 없음")
  - [~] ~~구버전 amount 마이그레이션 fallback~~ — **스킵**: 에뮬레이터 데이터 전부 삭제 후 신스키마로 재시작하기로 결정 (2026-05-06)
  - [x] 빈/로딩/에러 분기 (전체 빈 / 필터 빈 / 스켈레톤 / 에러 + 다시 시도)

- [x] **Phase 3** — 추가 다이얼로그 (`03-add-expense.md`)
  - [x] `src/lib/currencies.ts` — `CurrencyMeta` + `ALL_CURRENCIES` + `getCurrencyMeta` / `formatCurrencyAmount` 헬퍼
  - [x] `src/lib/exchangeRate.ts` (5분 캐시) — `fetchKrwRate` + `getCachedKrwRate`, inflight dedup 포함
  - [x] `AddExpenseDialog.tsx` — 카테고리 그리드, 통화/금액, 결제자/일시, **정산 인원 체크박스(결제자 자동·해제 불가)**
  - [x] FAB → dialog 연결 (`settle/page.tsx`에서 `addOpen` state + 조건부 마운트)
  - [x] 환율 실패 시 수동 입력 fallback (토스트 + 원화 직접 입력)
  - [x] Firestore write에 `participants` 필드 포함 (결제자 무조건 true)

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
  - [ ] 카드 멀티선택 모드 + 하단 액션바 ("정산 메시지 만들기")
  - [ ] `GroupSettleDialog.tsx` — 참여자 체크 + 결과 송금 매트릭스 + **메시지 미리보기/편집**
  - [ ] **`navigator.share()` 공유 + 클립보드 fallback**
  - [ ] **"보낸 항목 정산완료로 표시" 체크박스 + writeBatch 일괄 업데이트**
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

- **Phase 2 (2026-05-06)**:
  - 신스키마만 지원: 에뮬레이터 데이터 전부 삭제하기로 합의해서 `fromDoc`에서 구버전 `amount`/`createdAt`-only 문서 fallback 제거.
  - `CATEGORY_META`는 `src/lib/expenses.ts`로 이전, 페이지의 `iconBoxClass`(완성된 Tailwind 클래스 문자열)를 정답으로 채택. 문서의 추상 `tone` 필드는 미사용.
  - `formatKrw` / `formatPaidAt`도 `expenses.ts`에 같이 둠 (Phase 3+ 다이얼로그에서 재사용).
  - trip 문서와 expenses 컬렉션을 **각각 별도 useEffect**로 구독. 트립 멤버 수는 `Object.keys(trip.members).length`에서 산출.
  - 비로그인/`id` 누락 시 `/`로 라우팅, trip 문서 부재 시 토스트 + 홈.
  - 빈 상태 4종: 초기 스켈레톤 / 전체 expenses=0 (FAB 안내) / 필터로 0 / onSnapshot 에러 (다시 시도 = 페이지 reload). onSnapshot은 자체 재시도라 명시 retry는 reload로 우회.
  - `react-hooks/set-state-in-effect` 룰 때문에 effect 본문에서 `setLoading(true)` 같은 reset setState 호출은 금지. 초기값에 의존하고, 콜백에서만 setState 한다.

- **Phase 3-C (2026-05-07)**:
  - `src/app/settle/page.tsx`에 `addOpen` state 추가, FAB onClick → `setAddOpen(true)` (단, `trip`/`tripId` 미준비 시 토스트 + 무시).
  - 다이얼로그는 `{trip && tripId && <AddExpenseDialog ... />}`로 조건부 마운트. 마운트되어도 `open=false` 동안은 reset effect의 `if (!open) return` 가드 덕에 비용 거의 없음.
  - **JSX 함정**: `members={trip.members ?? {}}` 처럼 inner `{}`(빈 객체 리터럴)를 JSX expression 안에 직접 쓰면 TypeScript JSX 파서가 expression 닫는 걸로 오해해서 "JSX fragment has no corresponding closing tag" 에러 폭발. 해결책으로 모듈 레벨 상수 `const EMPTY_MEMBERS: Record<string, string> = {};`를 두고 `members={trip.members ?? EMPTY_MEMBERS}`로 사용.
  - **3-B에서 발생한 lint 위반 정리**: KRW 분기에서 useEffect 본문 setState가 `react-hooks/set-state-in-effect`에 잡혀서, KRW 동기화는 `handleLocalAmountChange` / `handleCurrencyChange` 핸들러로 옮김. 환율 fetch effect는 비-KRW만 처리하고 `setRateLoading(true)`도 setTimeout 내부로 이동시켜 effect 본문을 깨끗하게 유지.
  - 검증: `tsc --noEmit` + `eslint` 둘 다 무에러.

- **Phase 3-B (2026-05-07)**:
  - `AddExpenseDialog`는 5섹션 단일 컴포넌트로 작성. 다이얼로그 열림 reset effect는 `react-hooks/set-state-in-effect` 룰을 만족하도록 `if (!open) return` 가드 + `eslint-disable` 주석으로 처리(`CreateTripDialog`와 동일 패턴).
  - **결제자 자동 잠금**: 결제자 select onChange에서 `setParticipants(prev => ({ ...prev, [uid]: true }))` 호출 — effect 안 거치고 핸들러로 처리해서 race 방지. 정산 인원 체크박스 `disabled={uid === paidByUid}`.
  - **환율 흐름**: 통화 변경 시 `krwManuallyEdited=false`로 리셋하고 `rate`를 `null`(또는 KRW면 1)로 초기화. `localAmount` 변경 시 400ms debounce로 `fetchKrwRate` → 성공하면 `Math.round(amount * rate)`로 KRW 자동입력. 사용자가 KRW 칸을 직접 수정하면 `krwManuallyEdited=true`가 켜져서 자동 동기화 차단. 