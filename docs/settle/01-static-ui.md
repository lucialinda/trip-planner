# Phase 1 — 정적 UI 이전 (레퍼런스 → settle/page.tsx)

> 선행: `00-overview.md` 읽기

## 목표

레퍼런스(`reference/settlement-page.html`)의 레이아웃을 `src/app/settle/page.tsx`로 옮기되 **앱 기존 네이비 테마**로 통일. 이 단계는 더미 데이터로만 표시한다.

## 변경 파일

- `src/app/settle/page.tsx` (전면 재작성)

## 구현 항목

1. **헤더**
   - `sticky top-0` + `bg-white/80 backdrop-blur-md`
   - 좌측 ← 뒤로가기, 가운데 "정산", 우측 `more_vert` (4단계까지 noop)
   - 컨테이너: `w-full max-w-3xl mx-auto`

2. **Hero 카드 (총 지출)**
   - `glass-elevated` + `rounded-xl`
   - `text-on-surface-variant` "총 지출" 라벨
   - `text-primary text-4xl font-extrabold` 금액
   - 배지: "예산 내 지출 중" (`bg-primary/10 border-primary/20 text-primary`)

3. **Bento 그리드 2열**
   - 가장 많이 쓴 곳: `restaurant` 아이콘 (text-primary로 통일)
   - 1인당 정산 금액 (TODO 주석으로 임시값 표시)

4. **정산 내역 헤더 + 정렬 토글**
   - "최신순 ▾" 버튼 (4단계 후 동작)

5. **Expense 아이템 카드**
   - `glass-panel` + 좌측 카테고리 아이콘 박스 + 중앙 제목/시간 + 우측 금액/상태
   - 더미 데이터 4개 (식비/교통/숙박/쇼핑)
   - 색상은 카테고리 톤 매핑 사용 (overview의 카테고리 표 참고)

6. **FAB**
   - 위치: `fixed bottom-24 right-1/2 translate-x-[180px] sm:translate-x-[360px]` 같은 식 말고, **홈처럼** `fixed bottom-6` + `max-w-3xl` 컨테이너 안에서 `ml-auto` 정렬
   - 클래스: `h-14 w-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 active:scale-90`
   - 아이콘: `material-symbols-outlined` `add`, `fontVariationSettings: "'FILL' 1"`, `text-[28px]`

7. **BottomNav**
   - 기존 `<BottomNav />` 그대로 사용 (Expenses 탭 활성)

## 색상 치환 규칙 (레퍼런스 → 본 앱)

| 레퍼런스 클래스 | 치환 |
|---|---|
| `text-primary` (sky) | `text-primary` (네이비, 그대로) |
| `bg-primary` | `bg-primary` |
| `bg-sky-50` | `bg-primary/10` |
| `border-sky-100` | `border-primary/15` |
| `text-tertiary` (purple) | `text-tertiary` (앱 테마 violet) |
| `text-secondary` (slate) | `text-on-surface-variant` |
| `bg-purple-50` | `bg-tertiary/10` |
| 그 외 sky-* | primary 계열 알파 변형 |

## 더미 데이터 형식 (Phase 2에서 교체)

```ts
type DummyExpense = {
  id: string;
  category: "food" | "cafe" | "transit" | "lodging" | "activity" | "shopping" | "etc";
  description: string;
  krwAmount: number;
  paidAt: string; // "2026.05.04 • 12:30"
  status: "tentative" | "confirmed";
};
```

## 수용 기준 (Definition of Done)

- [ ] `/settle` 진입 시 레퍼런스 레이아웃 그대로 보임
- [ ] 모든 sky 컬러가 네이비(primary) 계열로 치환됨
- [ ] FAB이 홈 FAB과 시각적으로 동일 (크기/색/그림자/아이콘 굵기)
- [ ] 모바일/데스크톱 둘 다 `max-w-3xl` 안에서 정렬됨
- [ ] BottomNav에서 Expenses 탭이 활성 상태
- [ ] 콘솔 경고/에러 없음
