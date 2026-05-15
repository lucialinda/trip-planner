# Firebase 개발 가이드

Trip Planner는 클라이언트 중심 Next.js 앱이지만, Firebase 기능은 클라이언트 코드만으로 완성되지 않는다. Firestore에 저장되는 데이터 구조, `firestore.rules`, 에뮬레이터 검증, 배포 범위를 함께 맞춰야 실제 환경에서 동작한다.

## 핵심 원칙

- Firebase 데이터 기능 변경은 클라이언트 코드, 데이터 모델, `firestore.rules`, 에뮬레이터 검증을 하나의 작업 범위로 본다.
- 새 필드, 새 컬렉션, 수정/삭제 동작을 추가하면 Rules 계약도 같이 변경한다.
- 권한이 필요한 동작은 UI에서 버튼을 숨기는 것만으로 끝내지 않고 Rules에서 막는다.
- `firestore.rules`는 Git 추적 대상이므로 기능 PR에 함께 포함한다.
- Rules가 바뀐 기능은 Hosting 배포만으로 반영되지 않는다. 배포 시 `firestore:rules`도 포함해야 한다.

## AI 코딩에서 자주 생기는 누락

AI로 기능을 만들면 컴포넌트, 상태, `addDoc`, `updateDoc`, `deleteDoc` 호출만 추가되고 `firestore.rules` 수정이 빠질 수 있다. 빌드와 화면 렌더링은 통과해도 실제 저장, 수정, 삭제 시점에는 `permission-denied`가 발생할 수 있다.

특히 다음 기능은 Rules 누락이 자주 생긴다.

- 새 필드 저장
- 문서 수정
- 문서 삭제
- 작성자 전용 수정/삭제
- 좋아요, 투표, 반응처럼 본인 UID만 바꿔야 하는 데이터
- 공지 고정, 정산 확정처럼 권한 정책이 필요한 상태 변경

## PR 전 체크리스트

- 새 컬렉션이나 새 필드가 추가됐는가?
- `AGENTS.md`의 Firestore 데이터 모델 설명도 함께 갱신해야 하는가?
- `firestore.rules`의 허용 필드 목록이 새 데이터 구조와 맞는가?
- create, update, delete 권한이 제품 정책과 일치하는가?
- 작성자 전용 동작이면 문서에 작성자 UID가 저장되는가?
- UI에서 쓰는 권한 기준과 Rules에서 검사하는 권한 기준이 같은가?
- 좋아요, 싫어요, 투표, 반응은 사용자가 본인 UID 항목만 변경할 수 있게 제한됐는가?
- 삭제 기능은 hard delete인지 soft delete인지 결정됐는가?
- Rules가 delete를 막는다면 삭제 버튼이 노출되지 않는가?
- Firebase 에뮬레이터에서 실제 저장, 수정, 삭제를 눌러봤는가?
- Rules 변경이 있으면 배포 범위에 `firestore:rules`가 포함되는가?

## AI 작업 요청 템플릿

Firebase 데이터가 포함된 기능을 AI에게 맡길 때는 다음 문구를 포함한다.

```text
관련 클라이언트 코드뿐 아니라 Firestore 데이터 모델, firestore.rules, 에뮬레이터 검증까지 같은 작업 범위로 확인해줘.
새 필드/수정/삭제/작성자 권한/본인 UID만 변경해야 하는 데이터가 있으면 Rules 계약도 같이 맞춰줘.
```

삭제나 관리자 기능처럼 정책 결정이 필요한 작업은 먼저 정책을 확정한다.

```text
구현 전에 Firestore Rules에 반영해야 할 권한 정책과 데이터 모델 변경점을 먼저 정리해줘.
```

## 권한 설계 기준

### 여행 접근

- 여행 데이터는 기본적으로 여행 멤버만 읽고 쓸 수 있어야 한다.
- 초대 코드 조회처럼 멤버가 되기 전 필요한 접근은 `tripCodes/{code}`처럼 제한된 경로로 분리한다.

### 작성자 전용 동작

- 작성자만 수정/삭제해야 하는 문서는 `createdByUid`, `addedByUid`, `paidByUid`처럼 명확한 UID 필드를 둔다.
- UI의 버튼 표시 조건과 Rules의 작성자 검사 조건을 같은 필드 기준으로 맞춘다.

### 본인 UID만 바꾸는 동작

- 좋아요, 싫어요, 투표, 이모지 반응은 사용자가 다른 사람의 UID 값을 바꾸지 못하게 제한한다.
- 클라이언트에서 막아도 Rules에서 다시 제한한다.

### 삭제 정책

- 데이터 보존이 필요한 기능은 hard delete보다 `deletedAt` 또는 `deleted` 기반 soft delete를 우선 검토한다.
- hard delete를 허용하려면 삭제 주체와 복구 불가 범위를 명확히 정한다.

## 검증과 배포

로컬 검증은 에뮬레이터에서 실제 사용자 흐름으로 확인한다.

```bash
npm run emulator
```

다른 터미널에서 개발 서버를 실행한다.

```bash
npm run dev
```

Rules만 바뀐 경우에도 배포는 Hosting이 아니라 Firestore Rules 대상이다.

```bash
firebase deploy --only firestore:rules
```

클라이언트 코드와 Rules가 함께 바뀐 경우에는 둘 다 배포한다.

```bash
npm run build
firebase deploy --only hosting,firestore:rules
```
