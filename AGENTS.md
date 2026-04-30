# trip-planner

친구 4명이 해외여행 일정을 함께 짜는 실시간 협업 웹앱.

## 기술 스택

- **Frontend**: Next.js (App Router), React, Tailwind CSS, Shadcn UI
- **Backend**: Firebase Firestore (실시간 동기화), Firebase Auth (Google 로그인)
- **Hosting**: Firebase Hosting (`public: "out"`, Static Export 방식)
- **Firebase SDK**: Firebase 모듈러 SDK (v9/v10)

## Firebase 프로젝트

- Project ID: `trip-planner-2026-ec5ec`
- Auth domain: `trip-planner-2026-ec5ec.firebaseapp.com`

## Firestore 데이터 모델

```
trips/{tripId}
  name, startDate, endDate, code, members: {uid: displayName}, memberUids, createdAt

trips/{tripId}/places/{placeId}
  name, date (YYYY-MM-DD), time, note, addedBy, createdAt
  likes: {uid: true}, dislikes: {uid: true}

trips/{tripId}/votes/{voteId}
  title, options: [{text, votes: {uid: true}}], status, createdBy, createdAt

trips/{tripId}/expenses/{expId}
  description, amount, paidBy, paidByUid, createdAt

trips/{tripId}/messages/{msgId}
  text, uid, displayName, createdAt

tripCodes/{code}
  tripId, createdAt
```

## 주요 기능 (탭 4개)

1. **일정** – 날짜별 장소 추가, 인라인 좋아요/싫어요 투표
2. **투표** – 진행중 투표 생성/참여/마감
3. **예산** – 지출 추가, 1/n 정산 계산
4. **채팅** – 실시간 메시지 (스레드)

## 개발 흐름

- **로컬 서버**: `npm run dev` (에뮬레이터와 동시 실행 필요 시 터미널 분리)
- **Firebase 에뮬레이터**: `npx firebase emulators:start`
- **배포 방식 (Static Export)**:
  1. `npm run build`
  2. `firebase deploy --only hosting`

## 작업 방식

- 모든 답변과 문서는 항상 한글로 작성할 것 (사용자 요청 사항)
- 로직/기능/UI 구조가 바뀌는 작업은 **코드 수정 전에 Plan subagent로 계획을 작성하고 사용자 컨펌 후 진행**
- 컴포넌트 추가 시 Shadcn UI 적극 활용 (`npx shadcn@latest add ...`)
- 클라이언트 중심 앱이므로 서버 컴포넌트보다는 `use client` 적극 활용 (Firebase 연동 부분)

## 주의사항

- Firebase config 키는 클라이언트 환경변수로 노출되어도 무방 (Firestore Rules로 제어)
- 정적 내보내기(`output: "export"`)를 사용하므로 Next.js Image 최적화 대신 `unoptimized: true` 사용.
