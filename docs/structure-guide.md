# trip-planner 구조 가이드 (C++ 개발자용)

HTML 단일 파일(`old_index.html`, 1716줄)에서 Next.js + Firebase + React + TypeScript 멀티파일 구조로 전환했어요. C++ 멘탈 모델로 매핑해서 정리한 문서입니다.

## 폴더가 왜 이렇게 나뉘어 있는가

```
src/
  app/         ← 라우팅 + 페이지 (URL → 화면 매핑)
  components/  ← 재사용 UI 조각 (.cpp/.h 같은 모듈)
  contexts/    ← 전역 상태 (싱글톤 비슷)
  lib/         ← 순수 유틸/SDK 초기화 (헬퍼 함수)
```

C++로 치면 `src/`는 소스 루트, `app/`은 `main.cpp`들이 모인 폴더(각 페이지가 진입점), `components/`는 라이브러리, `lib/`는 utils/io 같은 거예요. **`#include` 대신 `import` 한 줄로 모듈을 끌어쓰는 것만 다릅니다.** `@/`는 `tsconfig`에 정의된 경로 별칭이고 `src/`를 가리켜요 (`@/components/...` = `src/components/...`).

## Next.js App Router의 규칙 (이게 핵심)

`app/` 폴더 안에서는 **폴더 구조 = URL**, **파일 이름 = 역할**입니다. 컨벤션이지 코드가 아니에요.

| 파일 | 의미 |
|---|---|
| `app/page.tsx` | URL `/` 의 화면 |
| `app/trip/page.tsx` | URL `/trip` 의 화면 |
| `app/trip/[tripId]/page.tsx` | URL `/trip/abc123` 같은 동적 파라미터 화면 |
| `app/layout.tsx` | 모든 하위 페이지를 감싸는 껍데기 (헤더/Provider) |

지금 라우트 두 개 (`/trip?id=xxx` 와 `/trip/[tripId]`)가 공존하는 게 이상한 이유가 이거예요. 둘 다 "여행 상세" 같은 화면을 그리는데, 정적 export(`output: "export"`) 환경에선 `[tripId]` 동적 라우트가 빌드 시 미리 알 수 없어서 안 풀려요. **쿼리 기반(`/trip?id=…`) 하나로 통일하고 `[tripId]` 폴더는 지우는 게 맞습니다.**

## React 컴포넌트 = 렌더 함수

```tsx
export function ItineraryTab({ tripId, trip }) {
  const [places, setPlaces] = useState([]);   // 멤버 변수
  useEffect(() => { ... }, [tripId]);          // 생성자/소멸자 비슷
  return <div>...</div>;                       // 렌더 결과
}
```

- 컴포넌트는 **props**(함수 인자)를 받아 JSX(렌더 트리)를 반환하는 함수.
- `useState`는 멤버 변수 + setter, **값이 바뀌면 함수가 다시 호출됨**(=다시 렌더됨). C++ 함수가 매번 호출되면서도 내부 상태를 기억하는 거라 처음엔 어색해요.
- `useEffect(fn, [deps])`는 "deps가 바뀌었을 때 fn 실행 + cleanup 반환"이에요. Firestore `onSnapshot` 구독 → 컴포넌트 사라질 때 unsubscribe, 이게 RAII 흉내라고 보면 됩니다.
- `"use client"` 지시어는 "이 파일은 브라우저에서 실행돼"라는 표시. Next.js는 기본이 서버 렌더링이라 명시 필요. Firebase SDK 쓰는 파일엔 다 붙어있을 거예요.

## Context = 의존성 주입 / 싱글톤

`AuthContext`가 그 예시. 트리 어디서든 `useAuth()` 호출하면 로그인된 user를 꺼낼 수 있어요. C++의 전역 싱글톤 + 자동 갱신 알림(observer) 합친 거라 보면 됩니다.

## 지금 구조의 약점 (리팩토링 포인트)

C++ 헤더 분리 감각으로 보면 `ItineraryTab.tsx`가 너무 비대해요. 한 함수 안에:

- 데이터 패칭 (Firestore 구독)
- 폼 상태/검증
- 모달 UI
- 카드 렌더링
- 스와이프 액션 처리

가 다 들어있어요. **분해 표준 패턴**은 이렇게 됩니다:

```
src/
  lib/
    types.ts              ← Trip, Place, Vote, Expense, Message 인터페이스
    repositories/
      placesRepo.ts       ← addPlace/updatePlace/deletePlace 함수 모음
  hooks/
    usePlaces.ts          ← Firestore 구독을 훅으로 캡슐화
    useTrip.ts
  components/
    itinerary/
      ItineraryTab.tsx    ← 조립만
      PlaceCard.tsx
      PlaceFormDialog.tsx
```

C++로 치면 "비대한 `main` 함수에서 도메인 객체(types), 데이터 접근층(repositories), 비즈니스 로직(hooks), 뷰(components)를 분리"하는 거랑 똑같은 일이에요. 투표/예산/스레드 탭 만들 때 이 골격이 그대로 재사용됩니다.

## 추천 진행 순서

1. **라우팅 정리**: `/trip/[tripId]` 폴더 삭제, `/trip?id=…` 일원화 (가장 적은 비용, 가장 큰 명료도)
2. **타입 정의 분리**: `src/lib/types.ts` 만들고 `any` 제거 (헤더 정리에 해당)
3. **ItineraryTab 분해**: 위 패턴대로 4~5개 파일로 쪼개기
4. **그 패턴으로 Votes/Budget/Threads 탭 신규 작성**

1번이 가장 안전하고 효과 커서 거기서부터 시작하는 걸 추천해요.

## 참고: 현재 파일 인벤토리

```
src/
  app/
    layout.tsx                     ← 루트 레이아웃 + AuthProvider 주입
    page.tsx                       ← 홈 (로그인/여행 목록/생성/참가)
    trip/
      page.tsx                     ← /trip?id=… (현재 사용 중)
      [tripId]/page.tsx            ← /trip/abc123 (구버전, 삭제 후보)
    globals.css
  components/
    ItineraryTab.tsx               ← 일정 탭 (분해 대상, 277줄)
    MembersDialog.tsx              ← 멤버 목록 + 프로필 수정
    ui/                            ← shadcn UI primitives
      SwipeableItem.tsx            ← 스와이프 액션 (자체 구현)
  contexts/
    AuthContext.tsx                ← 로그인 상태 전역 공급
  lib/
    firebase.ts                    ← Firebase 초기화 + 에뮬레이터 연결
    utils.ts
```
