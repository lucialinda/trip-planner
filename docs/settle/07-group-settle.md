# Phase 7 (초안) — 멀티선택 그룹 1/n 정산

> **상태**: 초안. 다음 세션에서 사용자가 다듬은 뒤 확정 예정.
> 선행: `00-overview.md`, `06-per-person.md`

## 목적

여러 expense를 골라서(멀티선택) **임의의 멤버 부분집합**을 참여자로 잡고, 누가 누구에게 얼마를 보내야 하는지 자동 계산.

> 예: 멤버 a/b/c/d. a가 "식비1(a 결제) + 쇼핑2(b 결제)"를 a/b/c 셋이서 1/n 정산하고 싶을 때.

## 사용자 흐름

1. 정산 페이지 헤더 우측 **"정산 요청"** 버튼(점세개 메뉴 또는 별도 ✓ 아이콘)으로 **선택 모드 진입**
   - 진입 시 리스트 항목 좌측에 체크박스 노출
   - 미정산(`status === "tentative"`) 항목만 기본 노출 (필터 칩과 별개로 동작)
   - 카드 길게누르기로도 선택 모드 진입 가능 (선택 사항)
2. 항목 체크 → 화면 하단 sticky 액션바에 **"선택된 N건 — 정산 메시지 만들기"** 버튼 등장
3. 버튼 탭 → **GroupSettleDialog** 오픈
   - 상단: 선택된 항목 요약 (제목 / 결제자 / 금액 / 참여자 수)
   - 가운데: 자동 계산된 송금 매트릭스 + 멤버별 net (`paid` / `share` / `net` 색상 분리)
   - 그 아래: **자동 생성된 정산 메시지 미리보기** (`textarea`, 사용자 편집 가능)
   - 하단 옵션:
     - 정산 방식 라디오 (`1/n` 기본 / `결제자 제외 1/n` / `비율 입력`) — 1차는 1/n만
     - **"보낸 항목 정산완료로 표시"** 체크박스 (기본 ON)
4. 액션 버튼: **"공유"** (`navigator.share()`) / **"복사"** (clipboard) / **"닫기"**
   - "공유" 또는 "복사" 성공 시: "정산완료로 표시" 옵션이 ON이면 선택 항목들 `status` → `confirmed` 일괄 업데이트(`writeBatch`)

> 참여자 결정: 1차 구현은 **선택된 expenses 각각의 `participants` 합집합**을 그대로 사용 (Phase 3에서 항목별로 미리 지정한 인원이 정확하다고 본다). 다이얼로그 안에서 다시 체크박스로 조정하는 UI는 추후 단계로 미룸 — 필요해지면 ItemList 옆에 멤버 토글을 추가.

## 계산 로직 (정정본)

> ⚠️ **주의**: 송금액은 expense별 분담액이 아니라 **멤버별 net**을 기준으로 매칭한다.
> 분담액을 그대로 송금액으로 쓰면 결제자가 자기 자신에게 갚는 부분을 빼지 않게 되어 net이 맞지 않는다.

### 1단계 — 멤버별 net 계산

각 참여자 `uid`에 대해:

```
paid  = Σ expense.krwAmount  (where expense.paidByUid === uid)
share = Σ (expense.krwAmount / participants.length)   // 모든 선택 expense 균등 분담
net   = paid - share
```

- `net > 0` → 받을 돈 (채권자, creditor)
- `net < 0` → 낼 돈 (채무자, debtor)
- `net === 0` → 정산 끝, 무시

### 2단계 — 최소 송금 매칭 (그리디)

```
creditors = net > 0 멤버 목록 (net 큰 순 정렬)
debtors   = net < 0 멤버 목록 (|net| 큰 순 정렬)
transfers = []

while debtors가 비어있지 않을 때:
  d = debtors[0], c = creditors[0]
  amount = min(|d.net|, c.net)
  transfers.push({ from: d.uid, to: c.uid, amount })
  d.net += amount       // d는 음수였으니 0에 가까워짐
  c.net -= amount
  if d.net === 0: debtors.shift()
  if c.net === 0: creditors.shift()
```

### 반올림 정책

- 분담액 계산 시 1원 단위로 floor → 나머지(`remainder = total - floor합`)는 가장 큰 채권자(또는 임의 결제자)에게 가산
- net과 transfer 모두 정수 KRW로 유지

## 검증 예시

- 식비1: 결제자 a, 60,000 KRW
- 쇼핑2: 결제자 b, 40,000 KRW
- 참여자: a, b, c (3명), d 제외

### 1단계 결과

| 멤버 | paid | share | net |
|---|---|---|---|
| a | 60,000 | 33,333 | **+26,667** |
| b | 40,000 | 33,333 | **+6,667** |
| c | 0 | 33,333 | **−33,333** |

(33,333 × 3 = 99,999. 1원 잉여는 a로 → a share 33,334로 두면 net 합계 정확히 0)

### 2단계 결과

| from | to | amount |
|---|---|---|
| c | a | 26,667 |
| c | b | 6,667 |

(c 송금 합 33,333 = c의 |net| ✓)

### 자주 하는 실수

❌ `c → a: 20,000 / c → b: 13,333` (각 expense의 분담액 20,000 / 13,333을 그대로 송금)
- 이렇게 하면 a는 자기가 낸 60,000에서 자기 부담 20,000을 자기한테 갚는 모양이 되어 +6,667 남고, b도 마찬가지로 +13,333 남음. **net 0이 안 됨**.

## 메시지 포맷 + 공유

### 자동 생성 텍스트 (기본 템플릿)

```
[{trip.name}] 정산 요청

▸ {expense.description}
  결제 {payer} · ₩{krwAmount} · {participants.length}명 → 1인당 ₩{share}
... (선택된 항목 반복)

─ 송금 요약 ─
{from} → {to}: ₩{amount}
... (transfers 반복, 0원 항목은 제외)

총 ₩{total} 정산 (참여 {participantCount}명)
```

- 모든 금액은 천 단위 콤마, 통화 기호는 ₩ 고정
- 사용자가 미리보기 textarea에서 자유 편집 가능 (편집된 텍스트가 공유/복사에 사용됨)

### 공유 (`navigator.share`)

```ts
const text = preview;            // textarea 현재 값
const title = `${trip.name} 정산`;
try {
  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({ title, text });
  } else {
    await navigator.clipboard.writeText(text);
    toast.success("정산 메시지가 복사되었어요. 원하는 앱에 붙여넣기 해주세요.");
  }
  await afterShare();   // 정산완료 자동 표시 처리
} catch (e: unknown) {
  // AbortError(사용자가 공유 시트 취소)는 무시
  if (e instanceof Error && e.name === "AbortError") return;
  toast.error("공유에 실패했어요. 메시지가 클립보드에 복사되어 있을 수 있어요.");
}
```

- `navigator.share()`는 모바일에서 카톡/메시지/이메일 등 시스템 공유시트를 띄움. 카톡 SDK 별도 연동 불필요.
- 데스크톱(특히 Chrome 일부 버전)에서는 `navigator.share`가 없거나 텍스트만 받지 않을 수 있어 클립보드 fallback 필수.
- iOS Safari는 텍스트 share 잘 동작. Android Chrome도 마찬가지.

### "보낸 항목 정산완료로 표시" 옵션

- 다이얼로그 하단 체크박스, **기본 ON**.
- ON 상태에서 사용자가 "공유" 또는 "복사"를 성공적으로 트리거하면 `afterShare()`에서 선택 항목 `status` 일괄 업데이트:

```ts
async function afterShare() {
  if (!markAsConfirmed) return;
  const batch = writeBatch(db);
  for (const exp of selected) {
    if (exp.status === "confirmed") continue;   // 이미 확정된 건 건너뜀
    batch.update(doc(db, "trips", tripId, "expenses", exp.id), {
      status: "confirmed",
      // 가환율 그대로 확정값으로 복제 (편집은 Phase 5 EditDialog에서)
      confirmedRate: exp.rate,
      confirmedKrwAmount: exp.krwAmount,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  toast.success(`${selected.length}건이 정산완료로 표시됐어요`);
}
```

- 사용자가 옵션을 OFF로 끄면 메시지만 보내고 status는 그대로 둠 (실제 송금 미확인 시).
- 공유 시트 취소(`AbortError`) 시에는 `afterShare()`가 호출되지 않도록 흐름 조정.

## 데이터 모델

### 옵션 A — 임시 계산만 (권장 1차)

- 정산 이력 컬렉션 저장 X. UI에서 선택 → 다이얼로그에서 즉석 계산 → 메시지 공유.
- "보낸 항목 정산완료로 표시" 옵션이 ON이면 expenses의 `status`만 갱신 (이력 별도 저장 안 함).
- 장점: 스키마 변경 최소, 구현 간단.
- 단점: 정산 이력 추적 불가. 누가 언제 어떤 묶음을 정산했는지 모름.

### 옵션 B — 정산 이력 컬렉션 (추후)

```
trips/{tripId}/settlements/{settleId}
  expenseIds: string[]
  participantUids: string[]
  method: "even" | "exclude-payer" | "ratio"
  result: {
    perMember: { uid, paid, share, net }[]
    transfers: { fromUid, toUid, amount }[]
  }
  message: string             // 공유한 텍스트(편집본) 그대로 저장
  status: "requested" | "completed"
  createdBy: uid
  createdAt: Timestamp
}
```

- 카드에 "정산됨 (settleId)" 배지 표시 가능, 중복 정산 방지.
- 1차에는 옵션 A로 가고, 필요해지면 B를 추가하는 흐름 권장.

## 라이브러리 시그니처

`src/lib/settle.ts` (신규)

```ts
export type SplitInput = {
  expenses: { id: string; paidByUid: string; krwAmount: number }[];
  participantUids: string[];
  method?: "even"; // 1차에는 even만
  rounding?: "floor-to-creditor"; // 기본
};

export type SplitResult = {
  perMember: {
    uid: string;
    paid: number;
    share: number;
    net: number; // paid - share
  }[];
  transfers: {
    fromUid: string;
    toUid: string;
    amount: number;
  }[];
};

export function computeGroupSplit(input: SplitInput): SplitResult;
```

## 단위 테스트 시나리오 (작성 시 참고)

1. **위 검증 예시** — c→a 26,667, c→b 6,667
2. **결제자가 한 명** — 다른 모두가 동일 분담액 송금
3. **net 0인 멤버** — transfers에서 제외되어야 함
4. **반올림 잉여** — share 합 < total일 때 잉여가 정확히 한 멤버에 흡수되는지
5. **2인 정산** — 가장 단순한 케이스 (한 줄짜리 transfer)
6. **모두 결제자가 다름** — 다대다 매칭 정확도

## Phase 6과의 관계

- Phase 6은 "트립 전체 1/n 폼(UI only)". 이 Phase 7과 결이 다름.
- Phase 7 도입 시 Phase 6은 다음 중 택일:
  - (a) 폐기 후 Phase 7로 흡수 (Bento 카드 1인당 = 모든 expense + 모든 멤버 그룹의 자동 정산 결과)
  - (b) 유지: Bento는 빠른 요약, Phase 7은 부분 정산
- 다음 세션에서 사용자 결정 필요.
