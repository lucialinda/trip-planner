---
name: pr
description: 작업한 feature branch 를 push 하고 GitHub PR 을 만드는 워크플로. 사용자가 "PR 만들어", "PR 올려", "리뷰 요청해줘", "푸시하고 PR", "open PR", "리뷰 보내", "이거 PR 로" 같이 어떤 식으로든 PR 생성을 요청하면 항상 사용. main 직접 푸시는 막혀 있고 모든 변경은 PR 을 통해서만 머지되므로, 이 스킬은 작업이 끝났을 때 거의 항상 호출돼야 한다. lint/tsc 실행 누락이나 잘못된 base branch, 커밋 안 된 변경분 같은 자주 나는 실수를 막는 것이 이 스킬의 목적.
---

# pr

push + GitHub PR 생성을 안전하게 진행하기 위한 스킬. `gh` CLI 사용을 가정한다.

## 워크플로

1. **현재 브랜치 확인** — `git branch --show-current`
   - **main 이면 즉시 중단** + 사용자에게 `feature` 스킬 안내 (브랜치부터 따야 함)
2. **변경사항 정리** — `git status` 확인
   - 미커밋 변경 있으면 → `commit` 스킬 위임 (먼저 커밋 끝내야 함)
   - 커밋했지만 푸시 안 한 상태면 OK
3. **품질 체크** (가능하면 자동, 실패하면 사용자 확인 후 진행 여부 결정):
   - `npm run lint` — eslint 통과
   - `npx tsc --noEmit` — 타입 에러 없음
   - 둘 중 하나라도 실패 시 → 수정 권장. 사용자가 "그래도 PR 올려" 라고 명시할 때만 진행.
4. **base 와의 변경 확인** — `git log main..HEAD --oneline` 으로 어떤 커밋들이 들어가는지 보고 PR 본문 작성 근거로 사용
5. **푸시** — 처음 푸시면 `git push -u origin <branch>`, 이후엔 `git push`
6. **PR 메타 정보 결정**:
   - **title**: 단일 커밋이면 그 커밋 메시지 그대로. 여러 커밋이면 의미 종합해서 한 줄
   - **body**: 아래 템플릿
   - **base**: `main` (기본)
7. **PR 생성** — `gh pr create --base main --title "..." --body "..."`
   - 또는 `gh pr create --fill` 후 사용자가 description 보강
8. **결과 출력** — PR URL 사용자에게 안내

## PR title 컨벤션

커밋 메시지와 동일한 `type(scope): 설명` 형식 권장. 머지 시 squash 하면 이게 그대로 main 의 커밋 메시지가 됨.

**좋은 예시:**

- `feat(settle): 지출 항목 편집 다이얼로그 추가`
- `fix(auth): Google 로그인 후 트립 목록이 안 보이는 문제 해결`
- `docs: README 한국어로 재작성 + 협업 가이드 추가`

## PR body 템플릿

```markdown
## 변경 요약

(이 PR 이 무엇을 하는지 1~3 줄)

## 주요 변경사항

- (커밋별 또는 파일별 핵심 변경)
-

## 테스트 방법

1. (리뷰어가 수동 확인할 단계)
2.

## 스크린샷 / 영상 (UI 변경 시)

(선택)

## 관련 이슈

(있으면 #N)
```

길이는 PR 크기에 맞춰서 — 한 줄짜리 docs PR 에 거대한 템플릿 다 채울 필요 없음. "변경 요약" 한 문단으로 충분한 경우가 더 많음.

## 시작 전 체크 (안전망)

다음 케이스는 **반드시 사용자 확인** 후 진행:

- 현재 브랜치가 `main` — 진행 불가. `feature` 스킬로 브랜치부터 따도록 안내.
- main 이 origin 보다 ahead (= main 에 푸시 안 한 커밋이 있음) — 의도치 않게 main 에서 작업했을 가능성. 어떻게 정리할지 묻기.
- 현재 브랜치가 origin 에 이미 있고, 다른 사람도 푸시한 흔적이 있을 때 (`git fetch && git log origin/<branch>..HEAD` 와 `git log HEAD..origin/<branch>`)
  - rebase 또는 merge 필요. 사용자에게 어떻게 할지 묻기.
- lint / tsc 실패 — 자동 진행 ❌. 사용자 확인 후 명시적 진행 또는 수정.

## gh CLI 미설치 시

`gh --version` 으로 사전 확인. 없으면:

1. 푸시까지만 진행
2. PR 생성용 GitHub URL 안내: `https://github.com/<owner>/<repo>/compare/main...<branch>?expand=1`
3. README 의 "사전 준비" 섹션에서 `gh` 설치 안내 링크

## 자주 빠지는 함정

- **PR 만들고 본문 비워두기** — 리뷰어가 변경 내용 추측해야 함. 최소한 "변경 요약" 1 줄은 채우기.
- **lint/tsc 통과 확인 누락** — 머지 직전에 빨갛게 떠서 다시 푸시해야 함. 미리 잡는 게 비용 적음.
- **`--draft` 안 쓰고 미완성 PR 올림** — 리뷰어 알림이 가서 시간 낭비. 진행 중이면 `gh pr create --draft` 권장.
- **base branch 잘못 지정** — 기본은 main 이지만 release branch 작업 시 헷갈릴 수 있음. `--base main` 명시.
- **branch 이름과 PR 의도 불일치** — `feat/auth` 인데 PR 본문은 정산 얘기 → 작업이 섞임. `feature` 스킬로 나눠서 다시 정리.

## 사용자 의사 확인

다음 경우엔 진행 직전에 한 번 확인:

- lint 또는 tsc 실패 시 — 수정할지, 그래도 올릴지
- 커밋 여러 개를 한 PR 로 묶을지 / 쪼갤지 (서로 무관한 변경이 섞인 경우)
- `--draft` 로 올릴지 / 정식 PR 로 올릴지 (작업 완료 자신 있는지)
- PR title / body 자동 생성 vs 사용자 직접 입력

그 외엔 멈추지 말고 진행. 비-개발자 사용자에게는 각 단계에서 무엇을 하는지 한 줄씩 설명을 곁들이면 학습에 도움.

## 예시 인터랙션

**Example 1 — 깔끔한 PR:**

```
user: PR 만들어
assistant: [git branch --show-current → feat/expense-edit]
           [git status — clean]
           [npm run lint → pass]
           [npx tsc --noEmit → pass]
           [git log main..HEAD --oneline → 3 커밋: feat(settle): 편집 다이얼로그 / fix: 환율 표시 / refactor: hook 정리]
           제목: `feat(settle): 지출 항목 편집 다이얼로그 추가`
           본문 초안:
             ## 변경 요약
             정산 페이지에서 카드 탭 → 편집 다이얼로그를 띄워 항목 수정/삭제 가능하게.
             ## 주요 변경사항
             - EditExpenseDialog 추가
             - 환율 표시 버그 수정
             - useExpenseForm 훅으로 로직 통합
             ## 테스트 방법
             1. 정산 페이지에서 항목 탭 → 다이얼로그 열림 확인
             2. 금액 수정 후 저장 → 리스트에 즉시 반영
           이대로 올릴까요?
user: ㅇㅇ
assistant: [git push -u origin feat/expense-edit]
           [gh pr create --base main --title "..." --body "..."]
           PR 만들었어요: https://github.com/.../pull/42
```

**Example 2 — main 위에서 호출됨:**

```
user: 이거 PR 로 올려줘
assistant: [git branch --show-current → main]
           지금 main 브랜치예요. main 직접 푸시는 막혀 있어서 PR 못 만들어요.
           먼저 `feature` 스킬로 새 브랜치 따고 변경분을 옮긴 뒤 다시 시도해야 합니다.
           새 브랜치 이름은 어떻게 할까요? (예: feat/xxx)
```

**Example 3 — lint 실패:**

```
user: PR 올려
assistant: [npm run lint → 2 errors in src/app/settle/page.tsx]
           lint 에러 2 개 발견:
             src/app/settle/page.tsx:142  Unused variable 'oldRate'
             src/app/settle/page.tsx:189  Missing dependency in useEffect
           수정하고 올릴까요? 아니면 그냥 진행할까요?
           (그냥 올리면 머지 직전에 다시 막힐 가능성 높음)
```
