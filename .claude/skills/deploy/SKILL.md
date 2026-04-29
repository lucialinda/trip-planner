---
name: deploy
description: Firebase Hosting에 배포한다. /deploy 입력 시, "배포해줘", "올려줘", "deploy" 등의 말에도 트리거된다.
---

`firebase deploy --only hosting` 을 실행한다.

## 순서

1. `firebase deploy --only hosting` 실행
2. 성공하면 배포된 URL 출력
3. 실패하면 에러 내용 그대로 보여줌

## 주의

- 다른 건 건드리지 않음 (Firestore rules, functions 등 제외)
- 배포 전 별도 빌드 단계 없음 (빌드 툴 없는 프로젝트)
