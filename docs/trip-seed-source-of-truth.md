# 2026 포르투갈 & 니스 시드 데이터 Source of Truth

이 문서는 `nara/update` 브랜치의 시드 데이터에서 일정과 정산 내역만 추출해 정리한 운영용 원본이다.
실제 호스팅 데이터에 항목을 추가할 때는 이 문서를 먼저 갱신한 뒤, 아래 Firestore 형식에 맞춰 데이터를 추가한다.

- 기준 브랜치: `nara/update`
- 기준 커밋: `d4de1a8e77669f6f732cd261bca9492c8eaa814d`
- 원본 스크립트: `scripts/seed-itinerary.mjs`
- 보조 스크립트: `scripts/seed-profiles.mjs`
- 검증용 더미 스크립트: `scripts/seed-expenses.mjs`, `scripts/seed-members.mjs`

## 사용 원칙

- 이 문서를 일정과 정산 내역의 source of truth로 사용한다.
- 앱/Firestore에 데이터를 추가하기 전에 이 문서의 표를 먼저 수정한다.
- `seed-expenses.mjs`, `seed-members.mjs`의 프랑스/스페인 더미 데이터는 실제 여행 원본 데이터로 사용하지 않는다.
- 실제 사용자 가입 후 UID가 바뀌면 `members`, `memberUids`, `paidByUid`, `participants`를 함께 갱신한다.
- 금액이 카드 확정 전이면 `status: "tentative"`로 두고, 확정 후 `status: "confirmed"`, `confirmedRate`, `confirmedKrwAmount`를 추가한다.
- 일정 추가 시 한 `places` 문서에는 한 일정만 넣고, 지출 추가 시 한 `expenses` 문서에는 한 결제 내역만 넣는다.

## Firestore 데이터 형식

### Trip

경로: `trips/{tripId}`

```ts
{
  name: "✈️ 2026 포르투갈 & 니스",
  startDate: "2026-06-03",
  endDate: "2026-06-13",
  code: "G6KPN7",
  members: {
    [uid]: displayName
  },
  memberUids: string[],
  createdByUid: string,
  heroPhotoURL: null,
  budgetPerPerson: 2500000
}
```

### Place

경로: `trips/{tripId}/places/{placeId}`

```ts
{
  date: "YYYY-MM-DD",
  startTime: "HH:MM",
  endTime: "HH:MM",
  name: string,
  note?: string,
  placeUrl?: string,
  addedBy: "나라",
  addedByUid: "xdiqN6R92NbFXjf2zB8y0xdTB0Ky",
  order: number,
  createdAt: serverTimestamp(),
  likes: {},
  dislikes: {}
}
```

### Expense

경로: `trips/{tripId}/expenses/{expenseId}`

```ts
{
  category: "food" | "cafe" | "transit" | "lodging" | "activity" | "shopping" | "etc",
  description: string,
  localCurrency: "KRW" | "EUR" | "USD",
  localAmount: number,
  rate: number,
  krwAmount: number,
  paidByUid: string,
  paidBy: string,
  status: "tentative" | "confirmed",
  paidAt: Timestamp,
  participants: {
    [uid]: true
  },
  memo?: string,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

확정된 지출은 아래 필드를 추가할 수 있다.

```ts
{
  confirmedRate: number,
  confirmedKrwAmount: number
}
```

## 멤버

| 이름 | UID | 비고 |
| --- | --- | --- |
| 나라 | `xdiqN6R92NbFXjf2zB8y0xdTB0Ky` | 현재 로그인된 DEV 계정, `createdByUid` |
| 유진 | `uid_yujin_2026_trip` | 임시 UID, 실제 가입 후 교체 필요 |
| 소정 | `uid_sojeong_2026_trip` | 임시 UID, 실제 가입 후 교체 필요 |
| 성희 | `uid_seonghui_2026_trip` | 임시 UID, 실제 가입 후 교체 필요 |

전체 참여자 맵:

```ts
{
  "xdiqN6R92NbFXjf2zB8y0xdTB0Ky": true,
  "uid_yujin_2026_trip": true,
  "uid_sojeong_2026_trip": true,
  "uid_seonghui_2026_trip": true
}
```

## 일정

| 순서 | 날짜 | 시작 | 종료 | 일정 | 장소/링크 | 메모 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | 2026-06-03 | 08:10 | 08:10 | ✈️ 인천 출발 LO98 (LOT 폴란드항공) |  | 예약번호 G6KPN7 |
| 2 | 2026-06-03 | 14:05 | 17:40 | 🔄 바르샤바 환승 |  | LO98 도착 14:05 → LO4797 출발 17:40 |
| 3 | 2026-06-03 | 21:05 | 22:30 | 🛬 리스본 도착 & 숙소 이동 |  | 공항→숙소 택시 미리 예약<br>🏨 Calçada do Desterro 13 · 체크인 15:00 |
| 4 | 2026-06-04 | 09:00 | 11:00 | 🚋 28번 트램 (알파마 지구) |  | 리스본 명물 트램! 소매치기 주의 |
| 5 | 2026-06-04 | 11:00 | 13:00 | 🗼 벨렝탑 & 제로니무스 수도원 |  | 유네스코 세계문화유산 |
| 6 | 2026-06-04 | 13:00 | 15:00 | 🍽️ 타임아웃 마켓 (점심) | https://www.timeoutmarket.com/lisboa/ | 파스텔 드 나타 필수! |
| 7 | 2026-06-04 | 19:30 | 21:00 | 🎵 파두 공연 ✅예약완료 |  | 리스보아 인 파두<br>예약번호: CRY204783 · 4명 · ₩118,000 (유진 결제) |
| 8 | 2026-06-05 | 09:00 | 17:00 | 🏰 신트라·호카곶 투어 ✅예약완료 |  | 로맨틱 파라다이스 한국어 투어<br>예약번호: EXP-20260512-00009450 · ₩636,000 (유진 결제) |
| 9 | 2026-06-06 | 11:00 | 11:30 | 🏨 리스본 체크아웃 |  | ⚠️ 11:00 체크아웃 |
| 10 | 2026-06-06 | 12:00 | 15:00 | 🚆 리스본→포르투 기차 |  | ⚠️ 기차 예약 필요! |
| 11 | 2026-06-06 | 15:00 | 15:30 | 🏨 포르투 체크인 |  | Rua do Campinho 18 · 키패드 입장 (나라 결제) |
| 12 | 2026-06-07 | 09:00 | 10:00 | 📚 렐루 서점 ✅예약완료 | https://www.livrariarlello.com/ | 예약번호: 99229108 · 4명 x €12 (성희 결제)<br>⚠️ 09:00 입장 |
| 13 | 2026-06-07 | 10:00 | 11:00 | ⛪ 카르무 성당 |  | 아줄레주 타일 외벽 |
| 14 | 2026-06-07 | 11:00 | 12:00 | 🗼 클레리구스 성당 & 탑 |  |  |
| 15 | 2026-06-07 | 12:30 | 13:30 | 🍟 포르투 맥도날드 |  | 세계에서 가장 아름다운 맥도날드! |
| 16 | 2026-06-07 | 14:00 | 16:00 | 🏛️ 상벤투역 & 포르투 대성당 |  |  |
| 17 | 2026-06-07 | 16:00 | 18:00 | 🌉 동루이스 1세 다리 & 히베이루 강변 |  |  |
| 18 | 2026-06-07 | 18:00 | 20:00 | 🍷 빌라 노바 데 가이아 포트와인 셀러 |  | 도우루강 건너편. 시음 포함 |
| 19 | 2026-06-08 | 08:00 | 10:00 | 🥬 볼량 시장 |  | ⚠️ 오전 일찍! |
| 20 | 2026-06-08 | 10:00 | 18:00 | 🚶 포르투 자유 일정 |  |  |
| 21 | 2026-06-08 | 21:00 | 21:00 | 😴 일찍 취침 & 짐 싸기 |  | ⚠️ 내일 04:00 출발! |
| 22 | 2026-06-09 | 04:00 | 04:00 | 🚕 포르투 공항 택시 출발 |  | ⚠️ 04:00 정각 |
| 23 | 2026-06-09 | 06:45 | 09:55 | ✈️ 포르투→니스 EJU6805 |  |  |
| 24 | 2026-06-09 | 10:30 | 11:30 | 🚗 니스 공항 렌터카 픽업 ✅예약완료 |  | 니스 프랑스 리비에라 공항(NCE)<br>푸조 3008급 · 오토 · 5인승<br>⚠️ 국제운전면허증 필수!<br>추가 드라이버: 배성희, 양소정<br>반납: 6/11 니스 기차역 10:00<br>현장결제 €336.78 (유진 결제) |
| 25 | 2026-06-09 | 11:30 | 14:00 | 🚗 프로방스 드라이브 (1시간 30분) |  |  |
| 26 | 2026-06-09 | 14:00 | 20:00 | 🍷 와이너리 투어 & 수영장 |  | 🏨 717 route de mappe, 83510 Saint Antonin du Var<br>숙소비 $419.41 (나라 결제) |
| 27 | 2026-06-10 | 09:00 | 09:30 | 🏨 농가 체크아웃 |  |  |
| 28 | 2026-06-10 | 10:30 | 12:00 | 💧 생트크루와 호수 |  |  |
| 29 | 2026-06-10 | 12:00 | 13:00 | 🍽️ 무스티에 생트마리 (점심) |  |  |
| 30 | 2026-06-10 | 13:00 | 15:00 | 🏔️ 베르동 협곡 드라이브 |  | 유럽의 그랜드캐니언! |
| 31 | 2026-06-10 | 15:00 | 16:00 | 🌿 발롱솔 라벤더 밭 (옵션) |  | 개화 미확실 — 6월 초중순 |
| 32 | 2026-06-10 | 18:30 | 19:00 | 🏨 니스 가리발리 체크인 |  | 11 Boulevard Carnot<br>체크인 16:00~ · 나라 결제 약 160만원 |
| 33 | 2026-06-11 | 08:00 | 10:00 | 💐 꽃시장 Cours Saleya |  | ⚠️ 오전에만 열림! |
| 34 | 2026-06-11 | 10:00 | 10:00 | 🚗 렌터카 반납 |  | 니스 기차역 오베르 거리 34번지 10:00 |
| 35 | 2026-06-11 | 10:30 | 18:00 | 🏖️ 니스 해변 자유시간 |  |  |
| 36 | 2026-06-12 | 10:00 | 12:00 | 🏘️ 에즈 마을 |  | ⚠️ 언덕 많음 · 편한 신발! |
| 37 | 2026-06-12 | 12:00 | 15:00 | 🎰 모나코 |  | 카지노 광장, 왕궁 |
| 38 | 2026-06-12 | 15:30 | 18:00 | 🏖️ 칸(Cannes) 해변 |  | 기차 30분 |
| 39 | 2026-06-12 | 22:00 | 22:00 | 😴 일찍 취침 & 짐 싸기 |  | ⚠️ 내일 10:00 즉시 체크아웃! |
| 40 | 2026-06-13 | 10:00 | 10:10 | 🚕 체크아웃 즉시 택시 |  | ⚠️ 10:05 택시 예약 필수! |
| 41 | 2026-06-13 | 10:40 | 13:00 | ✈️ 니스→바르샤바 LO342 |  |  |
| 42 | 2026-06-13 | 15:20 | 15:20 | ✈️ 바르샤바→인천 LO99 |  | 익일 09:25 인천 도착 🏠 |

## 정산 내역

시드 기준 환율:

- EUR 1 = 1,735원
- USD 1 = 1,350원으로 주석에 적혀 있으나, 리스본 숙소 항목은 실제 `rate: 1479`로 입력되어 있다.
- 달러 항목과 일부 숙소비는 카드값 확정 전 추정치다.

| 순서 | 결제자 | 카테고리 | 내역 | 통화 | 원금 | 환율 | 원화 금액 | 상태 | 메모 |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | 유진 | activity | 🎵 파두 공연 (CRY204783) · 4명 | KRW | 118,000 | 1 | 118,000 | tentative | 예약번호 CRY204783 |
| 2 | 유진 | activity | 🏰 신트라·호카곶 한국어 투어 · 4명 | KRW | 636,000 | 1 | 636,000 | tentative | 예약번호 EXP-20260512-00009450 |
| 3 | 유진 | transit | 🚗 니스 렌터카 (6/9~11) · 현장결제 | EUR | 336.78 | 1,735 | 584,115 | tentative | 현장결제 예정 |
| 4 | 성희 | activity | 📚 렐루 서점 입장권 · 4명 | EUR | 48 | 1,735 | 83,280 | tentative | 예약번호 99229108 · 6/7 09:00 |
| 5 | 나라 | lodging | 포르투 숙소 (Rua do Campinho 18) | KRW | 1,500,000 | 1 | 1,500,000 | tentative | 추정 금액 · 카드값 확정 후 수정 필요 |
| 6 | 나라 | lodging | 🍷 프로방스 와이너리 숙소 (Saint Antonin du Var) | KRW | 600,000 | 1 | 600,000 | tentative | 추정 금액 ($419.41) · 카드값 확정 후 수정 필요 |
| 7 | 나라 | lodging | 🏨 니스 가리발리 숙소 (11 Boulevard Carnot) | KRW | 1,600,000 | 1 | 1,600,000 | tentative | 추정 금액 · 카드값 확정 후 수정 필요 |
| 8 | 소정 | lodging | 🏨 리스본 숙소 (Calçada do Desterro 13) | USD | 710 | 1,479 | 1,050,090 | tentative | ⚠️ 달러 결제 · 카드값 확정 후 수정 필요 |

모든 정산 내역의 `participants`는 현재 멤버 4명 전원이다.

## 정산 요약

| 결제자 | 결제 합계 | 1/n 기준 차액 |
| --- | ---: | ---: |
| 나라 | 3,700,000원 | +2,157,129원 |
| 유진 | 1,338,115원 | -204,756원 |
| 소정 | 1,050,090원 | -492,781원 |
| 성희 | 83,280원 | -1,459,591원 |
| 합계 | 6,171,485원 |  |

- 1인당 기준액: 1,542,871원
- 반올림 때문에 최종 송금액 합계에 1원 차이가 날 수 있다.
- 단순 1/n 기준 예상 송금:
  - 유진 → 나라: 204,756원
  - 소정 → 나라: 492,781원
  - 성희 → 나라: 1,459,591원

## AI에게 데이터 추가를 요청할 때 줄 지시문

아래 지시문을 복사해 새 일정/정산 내역과 함께 전달한다.

```md
이 문서를 source of truth로 사용해서 Firestore 데이터 추가 코드를 작성해줘.

조건:
- trips/{tripId}/places 또는 trips/{tripId}/expenses 형식을 유지한다.
- 기존 UID, 멤버 이름, participants 맵을 문서의 멤버 표와 일치시킨다.
- 일정은 date/startTime/endTime/name/note/placeUrl 필드를 사용한다.
- 지출은 category/description/localCurrency/localAmount/rate/krwAmount/paidByUid/paidBy/status/paidAt/participants/memo를 사용한다.
- 카드값 미확정 항목은 status를 tentative로 둔다.
- 확정 항목만 confirmedRate/confirmedKrwAmount를 추가한다.
- 기존 데이터 삭제나 reset 로직은 내가 명시적으로 요청하지 않으면 넣지 않는다.
- Firestore Admin SDK로 추가하는 경우 emulator/production 대상이 명확히 드러나게 작성한다.
```

## 새 항목 작성 템플릿

### 일정

| 날짜 | 시작 | 종료 | 일정 | 장소/링크 | 메모 |
| --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | HH:MM | HH:MM |  |  |  |

### 정산

| 결제자 | 카테고리 | 내역 | 통화 | 원금 | 환율 | 원화 금액 | 상태 | 메모 |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 나라/유진/소정/성희 | lodging/activity/transit/food/cafe/shopping/etc |  | KRW/EUR/USD | 0 | 1 | 0 | tentative/confirmed |  |
