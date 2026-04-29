# trip-planner

친구 4명이 해외여행 일정을 함께 짜는 실시간 협업 웹앱.

## 기술 스택

- **Frontend**: Vanilla JS, HTML, CSS (빌드 툴 없음)
- **Backend**: Firebase Firestore (실시간 동기화), Firebase Auth (Google 로그인)
- **Hosting**: Firebase Hosting (`public: "."`, 루트 기준 서빙)
- **진입점**: `index.html` 단일 파일 (CSS/JS 인라인 또는 src/ 링크)
- **Firebase SDK**: v9 compat (`firebase/app`, `firebase/auth`, `firebase/firestore`) CDN

## Firebase 프로젝트

- Project ID: `trip-planner-2026-ec5ec`
- Auth domain: `trip-planner-2026-ec5ec.firebaseapp.com`

## Firestore 데이터 모델

```
trips/{tripId}
  name, startDate, endDate, members: {uid: displayName}, createdAt

trips/{tripId}/places/{placeId}
  name, date (YYYY-MM-DD), time, note, addedBy, createdAt
  likes: {uid: true}, dislikes: {uid: true}

trips/{tripId}/votes/{voteId}
  title, options: [{text, votes: {uid: true}}], status, createdBy, createdAt

trips/{tripId}/expenses/{expId}
  description, amount, paidBy, paidByUid, createdAt

trips/{tripId}/messages/{msgId}
  text, uid, displayName, createdAt
```

## 주요 기능 (탭 4개)

1. **일정** – 날짜별 장소 추가, 인라인 좋아요/싫어요 투표
2. **투표** – 진행중 투표 생성/참여/마감
3. **예산** – 지출 추가, 1/n 정산 계산
4. **채팅** – 실시간 메시지

## 개발 흐름

- 로컬 미리보기: `npx serve .` 또는 `firebase serve`
- 배포: `firebase deploy --only hosting`
- Firestore 규칙 배포: `firebase deploy --only firestore:rules`

## 작업 방식

- 로직/기능/UI 구조가 바뀌는 작업은 **코드 수정 전에 Plan subagent로 계획을 작성하고 사용자 컨펌 후 진행**
- 단순 텍스트/문구 변경은 바로 진행해도 됨

## 주의사항

- Firebase config 키는 `index.html`에 하드코딩 (클라이언트 공개키이므로 무방, Firestore Rules로 접근 제어)
- `firebase.json`의 `public: "."` — 루트 디렉토리 전체 서빙
- 빌드 단계 없음: `npm`, `webpack`, `vite` 사용 안 함
