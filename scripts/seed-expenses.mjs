#!/usr/bin/env node
/**
 * 정산 페이지 검증용 샘플 expense 시드 스크립트.
 *
 * 사용법:
 *   1) 별도 터미널에서: npm run emulator
 *   2) 이 스크립트 실행:
 *        npm run seed:expenses                    # 첫 번째 trip에 시드 (덮어쓰기 X — 누적)
 *        npm run seed:expenses -- --reset         # 첫 번째 trip의 expenses 모두 지우고 새로 시드
 *        npm run seed:expenses -- <tripId>        # 특정 trip
 *        npm run seed:expenses -- <tripId> --reset
 *
 * Admin SDK로 emulator에 직접 쓰므로 firestore.rules는 우회.
 * `npm run emulator` 의 --export-on-exit 옵션 덕분에 종료 시 emulator_data/ 에 자동 export됨.
 */

import admin from "firebase-admin";

const PROJECT_ID = "trip-planner-2026-ec5ec";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "localhost:9099";

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

// 프랑스 테마 샘플 (AGENTS.md 가이드: 일본 관련 항목 금지)
const SAMPLES = [
  {
    category: "lodging",
    description: "르 마레 부티크 호텔 2박",
    localCurrency: "EUR",
    localAmount: 240,
    rate: 1450,
    daysAgo: 3,
    hour: 15,
    minute: 0,
    status: "confirmed",
  },
  {
    category: "food",
    description: "몽마르트르 비스트로 저녁",
    localCurrency: "EUR",
    localAmount: 78,
    rate: 1450,
    daysAgo: 2,
    hour: 19,
    minute: 30,
    status: "tentative",
  },
  {
    category: "transit",
    description: "파리 메트로 카르네 10매",
    localCurrency: "EUR",
    localAmount: 19.5,
    rate: 1450,
    daysAgo: 2,
    hour: 9,
    minute: 15,
    status: "tentative",
  },
  {
    category: "cafe",
    description: "라뒤레 마카롱·커피",
    localCurrency: "EUR",
    localAmount: 24,
    rate: 1450,
    daysAgo: 2,
    hour: 16,
    minute: 0,
    status: "confirmed",
  },
  {
    category: "activity",
    description: "루브르 박물관 입장권 4매",
    localCurrency: "EUR",
    localAmount: 88,
    rate: 1450,
    daysAgo: 1,
    hour: 10,
    minute: 30,
    status: "tentative",
  },
  {
    category: "shopping",
    description: "갤러리 라파예트 기념품",
    localCurrency: "EUR",
    localAmount: 56,
    rate: 1450,
    daysAgo: 1,
    hour: 17,
    minute: 45,
    status: "tentative",
  },
];

function paidAtDate(daysAgo, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

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

async function deleteExpenses(tripId) {
  const ref = db.collection(`trips/${tripId}/expenses`);
  const snap = await ref.get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

async function main() {
  const { tripId: tripIdArg, reset } = parseArgs(process.argv);
  const tripId = await pickTripId(tripIdArg);

  const tripSnap = await db.doc(`trips/${tripId}`).get();
  if (!tripSnap.exists) {
    throw new Error(`trips/${tripId} 가 없습니다.`);
  }
  const trip = tripSnap.data();
  const memberUids =
    Array.isArray(trip.memberUids) && trip.memberUids.length > 0
      ? trip.memberUids
      : Object.keys(trip.members ?? {});
  if (memberUids.length === 0) {
    throw new Error(`trips/${tripId} 에 멤버가 없습니다.`);
  }
  const participants = Object.fromEntries(memberUids.map((u) => [u, true]));

  console.log(`▶ 대상 trip: ${trip.name ?? "(이름없음)"} (${tripId})`);
  console.log(`  멤버 ${memberUids.length}명: ${memberUids.map((u) => trip.members?.[u] ?? u).join(", ")}`);

  if (reset) {
    const removed = await deleteExpenses(tripId);
    console.log(`▶ 기존 expenses ${removed}개 삭제`);
  }

  const batch = db.batch();
  SAMPLES.forEach((s, i) => {
    const paidByUid = memberUids[i % memberUids.length];
    const paidBy = trip.members?.[paidByUid] ?? "Unknown";
    const paidAt = paidAtDate(s.daysAgo, s.hour, s.minute);
    const krwAmount = Math.round(s.localAmount * s.rate);
    const ref = db.collection(`trips/${tripId}/expenses`).doc();
    const data = {
      category: s.category,
      description: s.description,
      paidByUid,
      paidBy,
      localCurrency: s.localCurrency,
      localAmount: s.localAmount,
      rate: s.rate,
      krwAmount,
      ...(s.status === "confirmed"
        ? { confirmedRate: s.rate, confirmedKrwAmount: krwAmount }
        : {}),
      status: s.status,
      paidAt: admin.firestore.Timestamp.fromDate(paidAt),
      participants,
      createdAt: admin.firestore.Timestamp.fromDate(paidAt),
      updatedAt: admin.firestore.Timestamp.fromDate(paidAt),
    };
    batch.set(ref, data);
  });
  await batch.commit();
  console.log(`✓ trips/${tripId}/expenses 에 ${SAMPLES.length}개 시드 완료`);
  console.log(`  → 에뮬레이터 종료(Ctrl+C) 시 emulator_data/ 에 자동 export됨. 커밋하면 영속.`);
}

main().catch((err) => {
  console.error("[seed-expenses] 실패:", err.message ?? err);
  process.exit(1);
});
