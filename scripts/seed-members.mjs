#!/usr/bin/env node
/**
 * 정산 페이지 검증용 더미 멤버 시드 스크립트.
 *
 * 사용법:
 *   1) 별도 터미널에서: npm run emulator
 *   2) 이 스크립트 실행:
 *        npm run seed:members                    # 첫 번째 trip에 더미 멤버 2명 추가 (중복 방지)
 *        npm run seed:members -- --reset         # 첫 번째 trip에서 더미 멤버 제거 후 다시 추가
 *        npm run seed:members -- <tripId>        # 특정 trip
 *        npm run seed:members -- <tripId> --reset
 *
 * Admin SDK로 emulator에 직접 쓰므로 firestore.rules는 우회.
 * 추가되는 멤버는 실제 Auth 계정이 아니므로 로그인은 불가, 정산 N분할/리스트 표시 검증용.
 */

import admin from "firebase-admin";

const PROJECT_ID = "trip-planner-2026-ec5ec";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "localhost:9099";

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

// 스페인어 테마 더미 멤버 — UID는 실제 Firebase UID와 충돌하지 않도록 demo 프리픽스 부여.
const DEMO_MEMBERS = [
  { uid: "demoMember0000000000000Sofia", name: "Sofía" },
  { uid: "demoMember0000000000000Mateo", name: "Mateo" },
];
const DEMO_UIDS = DEMO_MEMBERS.map((m) => m.uid);

function parseArgs(argv) {
  const rest = argv.slice(2);
  const reset = rest.includes("--reset");
  const tripId = rest.find((a) => !a.startsWith("--"));
  return { tripId, reset };
}

async function pickTripId(arg) {
  if (arg) return arg;
  const snap = await db.collection("trips").limit(1).get();
  if (snap.empty) {
    throw new Error("trips 컬렉션이 비어 있어요. 앱에서 트립을 먼저 만든 뒤 다시 실행하세요.");
  }
  return snap.docs[0].id;
}

async function main() {
  const { tripId: tripIdArg, reset } = parseArgs(process.argv);
  const tripId = await pickTripId(tripIdArg);

  const ref = db.doc(`trips/${tripId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`trips/${tripId} 가 없습니다.`);
  }
  const trip = snap.data();
  const membersBefore = { ...(trip.members ?? {}) };
  const uidsBefore = Array.isArray(trip.memberUids)
    ? [...trip.memberUids]
    : Object.keys(membersBefore);

  console.log(`▶ 대상 trip: ${trip.name ?? "(이름없음)"} (${tripId})`);
  console.log(
    `  현재 멤버 ${uidsBefore.length}명: ${
      uidsBefore.map((u) => membersBefore[u] ?? u).join(", ") || "(없음)"
    }`,
  );

  // --reset: 이전에 추가된 데모 멤버 제거 후 다시 추가
  let nextMembers = { ...membersBefore };
  let nextUids = [...uidsBefore];
  if (reset) {
    let removed = 0;
    for (const uid of DEMO_UIDS) {
      if (uid in nextMembers) {
        delete nextMembers[uid];
        removed += 1;
      }
    }
    nextUids = nextUids.filter((u) => !DEMO_UIDS.includes(u));
    console.log(`▶ 기존 데모 멤버 ${removed}명 제거`);
  }

  // 더미 멤버 추가 (이미 있으면 스킵)
  let added = 0;
  for (const m of DEMO_MEMBERS) {
    if (m.uid in nextMembers) {
      console.log(`  · ${m.name} (${m.uid}) — 이미 멤버임, 건너뜀`);
      continue;
    }
    nextMembers[m.uid] = m.name;
    nextUids.push(m.uid);
    added += 1;
    console.log(`  + ${m.name} (${m.uid})`);
  }

  if (added === 0 && !reset) {
    console.log("✓ 추가할 데모 멤버 없음 (모두 이미 존재). 종료.");
    return;
  }

  await ref.update({ members: nextMembers, memberUids: nextUids });
  console.log(
    `✓ trips/${tripId}: 멤버 ${uidsBefore.length}명 → ${nextUids.length}명 (${added}명 추가${
      reset ? ", reset 적용" : ""
    })`,
  );
  console.log(`  → 에뮬레이터 종료(Ctrl+C) 시 emulator_data/ 에 자동 export됨. 커밋하면 영속.`);
}

main().catch((err) => {
  console.error("[seed-members] 실패:", err.message ?? err);
  process.exit(1);
});
