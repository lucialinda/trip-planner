# trip-planner

친구들과 여행 일정을 함께 짜는 실시간 협업 웹앱. Next.js + Firebase 기반.

## 사전 준비

- **Node.js 20 +** — `node -v` 로 확인
- **Java JDK 11 +** — Firestore 에뮬레이터가 Java 로 동작
  - macOS: `brew install openjdk@17`
  - Windows: [Adoptium](https://adoptium.net/) 에서 JDK 17 설치
  - 확인: `java -version`
- **GitHub CLI (`gh`)** — PR 생성 워크플로에 사용
  - macOS: `brew install gh`
  - Windows: `winget install --id GitHub.cli` 또는 [공식 설치 페이지](https://cli.github.com/)
  - 설치 후: `gh auth login` (GitHub.com → HTTPS → 브라우저 로그인)
  - 확인: `gh auth status`

`firebase-tools` 는 `devDependencies` 에 포함돼 있어 `npm install` 한 번이면 끝. 글로벌 설치 불필요.

## 빠른 시작

```bash
# 1. 의존성 설치 (firebase-tools, firebase-admin 등 모두 포함)
npm install

# 2. Firebase 에뮬레이터 시작 (별도 터미널 유지)
npm run emulator

# 3. 다른 터미널에서 dev 서버
npm run dev
# → http://localhost:3000
```

처음 진입하면 로그인 화면. 에뮬레이터 환경에서는 dev 계정(`dev@example.com` / `123456`) 으로 즉시 로그인 가능 (`emulator_data/auth_export/accounts.json` 에 미리 시드돼 있음).

## 기술 스택

| 레이어 | 사용 기술 |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Shadcn UI |
| Backend | Firebase Firestore (실시간 동기화) · Firebase Auth (Google + 이메일) · Firebase Storage |
| Hosting | Firebase Hosting (`output: "export"` 정적 빌드) |
| Local | Firebase Emulator Suite (Auth · Firestore · Storage · Hosting) |

Firebase Project ID: `trip-planner-2026-ec5ec`

## 폴더 구조

```
src/
  app/                Next.js App Router 페이지 (/, /trip, /schedule, /settle, /community)
  components/         재사용 컴포넌트 + Shadcn UI (components/ui/)
  contexts/           AuthContext 등 React Context
  lib/                Firebase 초기화, 도메인 로직(expenses, currencies, exchangeRate)
docs/
  structure-guide.md       전체 아키텍처 가이드
  settle/                  정산 기능 단계별 설계 문서 + PROGRESS.md
  design-references/       디자인 레퍼런스 정적 HTML
scripts/
  seed-expenses.mjs        에뮬레이터에 샘플 지출 데이터 시드
  seed-members.mjs         에뮬레이터 트립에 더미 멤버 추가
emulator_data/             에뮬레이터 import/export 폴더 (git 트래킹)
firebase.json              Firebase 호스팅·에뮬레이터·rules 설정
firestore.rules            Firestore 보안 규칙 (211 줄)
storage.rules              Storage 보안 규칙
AGENTS.md                  AI 어시스턴트 공통 작업 룰 (팀 공유)
CLAUDE.local.md            AI 어시스턴트 개인 룰 (gitignore, 각자 관리)
```

## 개발 흐름

### 로컬 실행

`npm run emulator` 와 `npm run dev` 를 별도 터미널에서 동시에 실행. 에뮬레이터는 다음 포트를 점유:

| 포트 | 역할 |
|---|---|
| 4000 | Emulator UI (브라우저로 데이터 확인) |
| 5001 | Hosting 미리보기 |
| 8080 | Firestore |
| 9099 | Auth |
| 9199 | Storage |

`src/lib/firebase.ts` 가 `localhost` 감지 시 자동으로 에뮬레이터에 연결됨.

### 시드 데이터

정산 페이지 같은 기능을 검증할 때 사용:

```bash
npm run seed:expenses           # 첫 트립에 샘플 지출 7 건 (프랑스 테마)
npm run seed:expenses -- --reset
npm run seed:members            # 첫 트립에 더미 멤버 2 명 (Sofía, Mateo)
npm run seed:members -- --reset
```

`firebase-admin` 으로 직접 쓰므로 `firestore.rules` 를 우회. 에뮬레이터가 켜져 있어야 함.

### 에뮬레이터 데이터 동기화 (Windows ↔ Mac)

`emulator_data/` 는 git 으로 추적해 두 머신 간에 공유. 작업 종료 시 `Ctrl+C` 로 에뮬레이터를 끄면 자동으로 export 되며, **반드시 커밋·푸시할 것**.

```bash
npm run emulator
# 작업 후 Ctrl+C → emulator_data/ 자동 export
git add emulator_data
git commit -m "chore(data): emulator data update"
git push
```

다른 머신에서 작업 시작 전엔 `git pull` 먼저. 양쪽에서 동시에 켜놓고 작업하면 머지 충돌 발생하니 한 번에 한쪽에서만 사용.

### 빌드 & 배포

```bash
npm run build                            # → out/ 디렉토리에 정적 빌드
npx firebase deploy --only hosting       # Firebase Hosting 배포
```

`output: "export"` 모드라 Next.js Image 최적화 대신 `unoptimized: true` 사용. 동적 SSR 라우트 추가 시 호환 여부 확인 필요.

## 협업 가이드

### 첫 출근 체크리스트

신규 협업자가 0 → 동작까지 가기 위한 단계:

1. 사전 준비 (Node.js, Java, gh CLI) 설치 확인 + `gh auth login` 으로 GitHub 인증
2. 저장소 clone 후 `npm install`
3. `npm run emulator` + 별도 터미널 `npm run dev` 동시 실행
4. 브라우저에서 `dev@example.com` / `123456` 으로 로그인 → 트립 하나 만들고 일정/지출 추가해보기
5. `npm run seed:members` / `npm run seed:expenses` 한 번 돌려서 정산 페이지 동작 확인
6. (배포 권한 필요 시) Firebase 콘솔에서 `trip-planner-2026-ec5ec` 프로젝트 collaborator 권한 요청 → `npx firebase login`
7. 첫 PR — 작은 버그 수정이나 문구 다듬기로 워크플로 익히기 (아래 "브랜치 & PR 흐름" 참고)

### 브랜치 & PR 흐름

`main` 브랜치는 **PR 을 통해서만** 변경. 직접 푸시 금지 (GitHub 설정에서 막혀 있음).

기본 흐름:

```bash
# 1. 새 작업 시작
git checkout main
git pull
git checkout -b feat/xxx        # 또는 fix/, docs/, refactor/, chore/

# 2. 작업 + 커밋 (작은 단위로 쪼개서)
# ... 코드 변경 ...
git add .
git commit -m "feat(scope): 설명"

# 3. 푸시 + PR 생성
git push -u origin feat/xxx
gh pr create --fill             # 또는 --title "..." --body "..."

# 4. 리뷰 통과 후 머지 (Squash 권장)
gh pr merge --squash --delete-branch
```

브랜치 이름 컨벤션: `<type>/<짧은-설명-kebab-case>` (예: `feat/expense-edit`, `fix/login-redirect`).

**AI 어시스턴트 사용 시:** Claude/Cursor 한테 자연어로 의도만 던져도 됨.

- `"새 작업 시작할게"` / `"브랜치 따줘"` → `feature` 스킬이 main 최신화 + 브랜치 생성을 안내
- `"PR 만들어줘"` / `"리뷰 요청"` → `pr` 스킬이 lint 체크 + 푸시 + `gh pr create` 까지 진행
- `"커밋해"` → `commit` 스킬이 type/scope 골라서 메시지 작성

스킬 정의: `.claude/skills/<name>/SKILL.md`

### 커밋 컨벤션

```
type(scope): 설명
```

- type: `feat`, `fix`, `docs`, `refactor`, `style`, `test`, `chore`, `perf`, `ci`
- scope: 영향 범위 한 단어 (예: `settle`, `auth`, `dropdown-menu`)
- 설명: 50 자 이내, 명령형, 마침표 없음
- 한 커밋이 두 type 에 걸치면 쉼표 결합 (`feat,docs`) + body 에 항목별 한 줄
- 자세한 룰: Claude/Cursor 사용 시 `commit` 스킬 자동 호출

예시:
- `feat(itinerary): 날짜별 장소 드래그 정렬 추가`
- `fix(auth): 만료 토큰 재발급 무한 루프 해결`
- `docs(settle): PROGRESS.md Phase 3 작업 노트 보강`

### AI 어시스턴트 룰

- **`AGENTS.md`** — 팀 공통 룰. Firestore 모델, 작업 방식, 컴포넌트 컨벤션 등. 모든 협업자가 따름.
- **`CLAUDE.local.md`** — 개인 룰. `.gitignore` 처리됨. 답변 언어, 예시 데이터 테마 등 본인 취향만 적어둠. 협업자에게 강요하지 않음.
- **`.agents/skills/`** — Firebase 공식 skill 모음 (`skills-lock.json` 으로 잠김). Genkit, Firestore, Auth 등.

새 협업자는 자기 취향에 맞춰 `CLAUDE.local.md` 를 직접 작성. 예시는 같은 파일 템플릿 참고하거나 관리자에게 요청.

### 보안 규칙 변경 시

`firestore.rules` 또는 `storage.rules` 를 건드리는 PR 은:
1. 에뮬레이터에서 실제 시나리오로 테스트 (멤버/비멤버, 트립 가입/탈퇴 등)
2. 머지 후 prod 반영: `npx firebase deploy --only firestore:rules,storage:rules`

## 주요 문서 링크

- [`AGENTS.md`](./AGENTS.md) — AI 어시스턴트 공통 작업 룰
- [`docs/structure-guide.md`](./docs/structure-guide.md) — Next.js 아키텍처 개관
- [`docs/settle/PROGRESS.md`](./docs/settle/PROGRESS.md) — 정산 기능 phase 진행 상태
- [`docs/design-references/`](./docs/design-references/) — 디자인 레퍼런스 정적 HTML
- [`TASKS.md`](./TASKS.md) — 작업 백로그

## 주의사항

- Firebase config 키는 클라이언트 환경변수로 노출되어도 무방 (Firestore Rules 로 권한 제어)
- `output: "export"` 사용 → `next/image` 최적화 비활성 (`unoptimized: true`)
- `emulator_data/accounts.json` 의 `dev@example.com` 은 가짜 계정. **실제 사용자 정보를 커밋하지 말 것**
