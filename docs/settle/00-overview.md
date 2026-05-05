# 정산 페이지 전체 설계 (Overview)

> 레퍼런스: `reference/settlement-page.html`
> 진행 체크리스트: `docs/settle/PROGRESS.md`

## 목표

- 레퍼런스 디자인을 **앱 기존 네이비 톤**으로 통일해 정산 화면 구축
- 다중 통화(현지 통화 + 원화) 지출 입력 + 실시간 환율 기반 가환율 계산
- 카드 정산일에 확정 환율로 편집 가능한 **확정 상태(status)** 관리
- 카테고리/통화 표시 항목을 사용자가 **설정창에서 토글** 가능

## 디자인 톤 결정

| 항목 | 값 |
|---|---|
| Primary | `#0a4c6e` (앱 기존 네이비) — 레퍼런스의 `#0ea5e9`(sky) 대체 |
| 텍스트 | `text-on-surface` (`#0f1524`) |
| FAB | `홈 화면과 동일`: `h-14 w-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30`, 아이콘 `add` (FILL 1, 28px) |
| 컨테이너 폭 | `w-full max-w-3xl mx-auto` (앱 공통 규칙) |
| 카드 스타일 | 기존 `glass-card` / `glass-panel` / `glass-elevated` 재사용 |

## 정산 항목 카테고리 (확정)

> "통신·유심" 제외

| key | 라벨 | Material Icon | 톤 |
|---|---|---|---|
| `food` | 식비 | `restaurant` | sky |
| `cafe` | 카페·간식 | `local_cafe` | amber |
| `transit` | 교통 | `directions_transit` | slate |
| `lodging` | 숙박 | `hotel` | violet |
| `activity` | 관광·입장료 | `confirmation_number` | rose |
| `shopping` | 쇼핑 | `shopping_bag` | emerald |
| `etc` | 기타 | `category` | gray |

## 통화 목록 (기본값)

`KRW`, `JPY`, `USD`, `EUR`, `GBP`, `THB`, `VND`, `TWD`, `SGD`

- 표시할 항목은 **trip 별 설정**으로 토글
- 입력 다이얼로그 안 통화 드롭다운에는 활성화된 통화만 노출

## 환율 API

- 기본: `https://open.er-api.com/v6/latest/{LOCAL}` (무료, 키 불필요)
- 응답 `rates.KRW` 사용해서 KRW 환산
- 5분 메모리 캐시 (`localKey -> { rate, fetchedAt }`)
- 실패 시: 입력 가능하지만 자동 환산 안 함 + 사용자에게 토스트로 알림

## 확정 상태(status) 모델

| status | 의미 | 표시 |
|---|---|---|
| `tentative` | 가환율로 계산된 임시 상태 (입력 직후 기본값) | "정산 예정" 배지 |
| `confirmed` | 카드 정산 환율 반영 완료 | "정산 완료" 배지 |

- **확정 후에도 편집 가능** (`confirmedRate`, `confirmedKrwAmount` 모두 수정 가능)
- 편집 다이얼로그에서 토글 + 확정 환율/원화 직접 입력
- 합계는 `status === 'confirmed' ? confirmedKrwAmount : krwAmount` 사용

## 트립 단위 설정창 (점 세개 메뉴)

상단 우측 `more_vert` → 다이얼로그 오픈

- **표시할 카테고리** 체크박스 (기본 전체 ON)
- **표시할 통화** 체크박스 (기본: KRW + JPY)
- **기본 통화** 라디오 (입력 다이얼로그에서 처음 열릴 때 선택)

## Firestore 스키마

### `trips/{tripId}` 필드 추가

```ts
settleSettings?: {
  enabledCategories: string[];   // ["food", "cafe", ...]
  enabledCurrencies: string[];   // ["KRW", "JPY"]
  defaultCurrency: string;       // "JPY"
}
```

기본값 fallback: 전부 ON, 기본통화 `JPY`.

### `trips/{tripId}/expenses/{expId}` 확장

```ts
{
  category: string;            // "food" | "cafe" | ... | "etc"
  description: string;
  paidByUid: string;
  paidBy: string;              // displayName 캐싱
  localCurrency: string;       // "JPY" 등
  localAmount: number;
  rate: number;                // 입력 시점 환율 (1 LOCAL = rate KRW)
  krwAmount: number;           // 입력 시점 KRW (가)
  confirmedRate?: number;
  confirmedKrwAmount?: number;
  status: "tentative" | "confirmed";
  paidAt: Timestamp;           // 사용자가 지정한 결제 일시
  participants: { [uid: string]: true };  // 정산 참여자 (결제자 포함, AddExpenseDialog 체크박스로 지정)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

기존 `amount` 필드는 마이그레이션 시 `krwAmount`로 매핑 (없으면 KRW + status='confirmed' + rate=1).
`participants`가 없는 구버전 문서는 fallback으로 **현재 trip 멤버 전원**을 참여자로 간주 (UI에서는 표시만 하고 저장은 따로 안 함 — 다음 편집 시 명시화).

## 1인당 정산 (TODO)

> 폼만 두고 계산 로직은 보류

- UI: "1인당 정산 금액" 카드 우측 작은 톱니 버튼 → 모달
- 모달 내용: "정산 방식" 라디오 (1/n / 결제자 제외 1/n / 비율 입력) — UI만, 동작 X
- 카드 표시값: 임시로 `총합 / 멤버수` (가표시), 옆에 ⓘ "임시 계산값" 안내

## 단계 분할

세션이 끊겨도 이어갈 수 있게 7단계로 쪼갰다. 각 단계가 끝나면 `PROGRESS.md`에 체크.

| Phase | 파일 | 내용 |
|---|---|---|
| 1 | `01-static-ui.md` | 레퍼런스 → `settle/page.tsx` 정적 이전 + 네이비 테마 |
| 2 | `02-firestore-read.md` | `expenses` 구독, 카테고리 합계 표시 (스키마 마이그레이션 포함) |
| 3 | `03-add-expense.md` | 추가 다이얼로그 + 환율 fetch + 결제자/정산 인원 지정 |
| 4 | `04-settings.md` | 점 세개 → 설정 다이얼로그 + 트립 문서 저장/적용 |
| 5 | `05-confirm-and-edit.md` | 확정 상태 토글 + 편집 다이얼로그 |
| 6 | `06-per-person.md` | 1인당 정산 폼 (계산 로직은 TODO 주석) |
| 7 | `07-group-settle.md` | 멀티선택 그룹 정산 + 메시지 생성/공유 + 정산완료 일괄 표시 |

## 작업 원칙

- 각 Phase 시작 전에 해당 MD 다시 읽기
- 코드 수정은 Phase 단위로 PR/커밋 분리
- 각 Phase 완료 시 `PROGRESS.md` 체크 + 발견된 보강사항은 본 문서에 추가
