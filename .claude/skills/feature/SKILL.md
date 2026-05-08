---
name: feature
description: 새 기능/수정 작업을 시작할 때 main 브랜치를 최신화하고 컨벤션에 맞는 feature branch 를 따는 워크플로. 사용자가 "새 작업 시작", "기능 만들거야", "이거부터 작업할게", "브랜치 따줘", "feature branch", "새 브랜치", "이슈 시작" 같이 어떤 식으로든 새 작업을 시작한다고 말하면 항상 사용. main 에서 직접 작업하다가 나중에 브랜치를 따려고 하는 위험한 흐름을 막는 것이 이 스킬의 목적이라, 사용자가 "지금 main 인데 작업하려고" 같은 말을 해도 발동.
---

# feature

새 작업 시작 시 안전하게 main 최신화 + feature branch 생성하기 위한 스킬.

## 워크플로

1. **현재 브랜치 / 변경사항 확인** — `git status` + `git branch --show-current`
2. **변경사항 처리** — 작업 트리에 미커밋 변경이 있으면 다음 중 하나로 정리:
   - 의미 있는 변경 → `commit` 스킬 위임 후 진행
   - 임시 변경 (테스트 코드 등) → `git stash push -m "wip: ..."` (브랜치 따고 나서 `git stash pop` 안내)
   - 버릴 변경 → 사용자에게 `git restore .` 또는 `git clean -fd` 사용 의사 확인
3. **main 최신화** — `git checkout main && git pull` (rebase 모드라면 사용자 환경 그대로 따름)
4. **브랜치 이름 결정** — 사용자가 미리 지정 안 했으면 type + 짧은 설명으로 제안:
   - 형식: `<type>/<kebab-case-요약>` (예: `feat/expense-edit`, `fix/login-redirect`)
   - type 은 commit 스킬과 동일: `feat`, `fix`, `docs`, `refactor`, `style`, `test`, `chore`, `perf`, `ci`
5. **브랜치 생성 + 체크아웃** — `git checkout -b <name>`
6. **stash 복원 (있었다면)** — `git stash pop`
7. **시작 안내** — 어떤 작업부터 할지, 큰 변경이면 Plan subagent 권장한다는 안내

## 브랜치 이름 컨벤션

```
<type>/<짧은-설명-kebab-case>
```

| 요소 | 설명 |
|------|------|
| **type** | 커밋 컨벤션과 동일 (`feat`, `fix`, `docs`, `refactor`, `chore` 등) |
| **설명** | 4 단어 이내, kebab-case (소문자 + 하이픈), 영문 권장 |

**좋은 예시:**

- `feat/expense-edit`
- `feat/settle-multiselect`
- `fix/login-redirect-loop`
- `docs/onboarding-update`
- `refactor/firestore-hooks`
- `chore/upgrade-tailwind-v4`

**피해야 할 패턴:**

- `my-branch` / `temp` / `wip` — 의도가 안 보임
- `feat/expense_edit` — snake_case (kebab-case 권장)
- `feat/매우긴브랜치이름으로뭘하려는지전부설명하기` — 너무 길고 한글 + 공백 없음
- `feature/...` (full word) — `feat/` 로 통일

## 시작 전 체크 (안전망)

다음 케이스는 **반드시 사용자 확인** 후 진행:

- 사용자가 이미 `main` 위에서 변경을 만들고 있는 경우
  - → "지금 변경분이 main 위에 있어요. 새 브랜치로 옮길까요?"
  - 동의하면: `git checkout -b <new>` (변경분이 자동으로 새 브랜치로 따라감)
  - 안 동의하면: 작업 보존 의도 확인 후 stash 또는 commit
- 원격에 같은 이름의 브랜치가 이미 있는 경우 (`git ls-remote --heads origin <name>` 으로 확인)
  - → 다른 사람이 작업 중일 수 있음. 이름 변경 권장
- main 이 origin/main 보다 ahead 인 경우
  - → "로컬 main 이 origin 보다 앞서 있어요. 푸시 안 한 작업이 있는 것 같은데 어떻게 할까요?"

## Stash 사용 시 주의

- stash 메시지에는 **무엇을 임시 보존하는지** 명시 (`git stash push -m "wip: 정산 인원 체크박스 디버깅"`).
- 새 브랜치로 옮겨가서 `git stash pop` 했을 때 충돌 발생 가능 — 사용자에게 미리 안내.
- 여러 번 stash 쌓이면 헷갈리니 가급적 즉시 pop.

## 자주 빠지는 함정

- **main 에서 직접 작업하다가 뒤늦게 발견** → 이미 커밋해버린 상태면 `git branch <new>` 로 브랜치 만들고 `git reset --hard origin/main` 으로 main 되돌리기 (위험하니 사용자 확인 후)
- **pull 안 하고 브랜치 따기** → 충돌 폭탄. 1 단계에서 반드시 `git pull` 부터
- **branch 이름에 한글/공백** → CI 에서 깨짐. 영문 kebab-case 강제
- **`feature/...` vs `feat/...`** → 한 프로젝트에서 섞이면 grep 어려움. 이 프로젝트는 `feat/` 통일

## 사용자 의사 확인

다음 경우엔 진행 직전에 한 번 확인:

- 작업 트리에 큰 미커밋 변경이 있을 때 (어디로 옮길지)
- 브랜치 이름이 애매할 때 (type 이 fix 인지 feat 인지 등)
- main 이 dirty 한 상태일 때 (작업 사라질 위험)

그 외엔 멈추지 말고 진행. 비-개발자 사용자에게는 각 git 명령이 무엇을 하는지 한 줄씩 설명을 곁들이면 학습에 도움.

## 예시 인터랙션

**Example 1 — 깔끔한 시작:**

```
user: 정산 항목 편집 기능 작업 시작할게
assistant: [git status — clean]
           [git checkout main && git pull]
           브랜치 이름은 `feat/settle-edit-expense` 어때요?
user: ㅇㅇ
assistant: [git checkout -b feat/settle-edit-expense]
           브랜치 만들었어요. 큰 변경이면 Plan subagent 로 계획 먼저 짤까요?
```

**Example 2 — main 위에서 이미 작업 중:**

```
user: 이거 작업하려는데 브랜치 따줘
assistant: [git status — main 위에 미커밋 변경 3 파일]
           지금 main 위에서 변경 중이네요. 새 브랜치로 그대로 옮길까요?
           (커밋은 아직 안 됐으니 변경분이 새 브랜치로 따라감)
user: ㅇㅇ 이름은 feat/edit-mode 로
assistant: [git checkout -b feat/edit-mode]
           됐어요. 이 변경분 그대로 커밋해도 되고, 더 작업하다 쪼개서 커밋해도 됩니다.
```

**Example 3 — 임시 변경 stash:**

```
user: 새 기능 시작할 건데 지금 디버깅 중인 건 잠깐 미뤄둘게
assistant: [git status — 디버깅 print 문 등 변경 5 파일]
           stash 로 임시 보관할게요. 새 브랜치로 옮긴 뒤 `git stash pop` 으로 복원 가능합니다.
           [git stash push -m "wip: 디버깅 print 임시"]
           [git checkout main && git pull]
           새 브랜치 이름은요?
```
