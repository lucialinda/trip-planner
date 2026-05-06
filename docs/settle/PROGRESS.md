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

- [ ] **Phase 3** — 추가 다이얼로그 (`03-add-expense.md`)
  - [ ] `src/lib/currencies.ts`
  - [ ] `src/lib/exchangeRate.ts` (5분 캐시)
  - [ ] `AddExpenseDialog.tsx` — 카테고리 그리드, 통화/금액, 결제자/일시, **정산 인원 체크박스(결제자 자동·해제 불가)**
  - [ ] FAB → dialog 연결
  - [ ] 환율 실패 시 수동 입력 fallback
  - [ ] Firestore write에 `participants` 필드 포함

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

- **2026-05-05 보강 (Phase 2/3/7 합의)**:
  - **트립 컨텍스트 파라미터 정정**: BottomNav가 trip id를 `?id=...`로 부착하므로 `/settle?id=...`를 정식 채택 (기존 문서의 `?tripId=...`는 오타). Phase 2 진입부에서 `useSearchParams().get("id")` 사용.
  - **expenses 스키마에 `participants` 필드 추가**: `{ [uid]: true }` 맵. 미존재 시 마이그레이션 fallback으로 멤버 전원 `participants`로 간주 (1/n 분담 = `krwAmount / memberCount`).
  - **AddExpenseDialog는 5섹션**: 카테고리 / 설명 / 금액(통화·환율) / 결제자·결제 일시 / **정산 인원**. 결제자는 정산 인원에 자동 체크되고 체크 해제 불가.
  - **정산 요청 흐름**: 헤더 우측 점세개 메뉴 → "정산 요청" 진입 (또는 별도 ✓ 아이콘 버튼). 진입 시 리스트 항목에 체크박스 노출, 미정산 항목 기본 노출. 하단 sticky 액션바에 "선택된 N건 — 정산 메시지 만들기" 버튼.
  - **메시지 공유**: `navigator.share({ title, text })` 사용. 실패/미지원 시 `navigator.clipboard.writeText()` + 토스트 "정산 메시지가 복사되었어요"로 fallback. 카톡 SDK 별도 연동 안 함 (시스템 공유시트가 카톡을 옵션으로 띄움).
  - **정산완료 자동 표시**: 다이얼로그 하단 "보낸 항목 정산완료로 표시" 체크박스(기본 ON). 공유 성공/취소와 무관하게 사용자가 `공유` 또는 `복사` 버튼을 눌렀을 때 선택 항목들 `status`를 `confirmed`로 `writeBatch` 일괄 업데이트. `confirmedKrwAmount`는 `krwAmount`로 복제, `confirmedRate`는 `rate`로 복제 (편집은 추후 가능).
