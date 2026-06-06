#!/usr/bin/env node
/**
 * Sync stored settlement display-name snapshots from userProfiles/trip members.
 *
 * Dry-run by default:
 *   node scripts/sync-settlement-member-names.mjs
 *   node scripts/sync-settlement-member-names.mjs --trip <tripId>
 *
 * Commit:
 *   node scripts/sync-settlement-member-names.mjs --commit
 *   node scripts/sync-settlement-member-names.mjs --trip <tripId> --commit
 *
 * Emulator:
 *   node scripts/sync-settlement-member-names.mjs --emulator
 *
 * This script uses the Firebase Web SDK, so production writes require temporary
 * Firestore Rules access. Do not leave migration rules deployed after commit.
 */

import { initializeApp } from "firebase/app";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  writeBatch,
} from "firebase/firestore";

const DEFAULT_BATCH_LIMIT = 400;
const firebaseConfig = {
  apiKey: "AIzaSyBKqpyrKECFR3GhYtnbz0xe-FlrQ-0bkeA",
  authDomain: "trip-planner-2026-ec5ec.firebaseapp.com",
  projectId: "trip-planner-2026-ec5ec",
  storageBucket: "trip-planner-2026-ec5ec.firebasestorage.app",
  messagingSenderId: "916488885189",
  appId: "1:916488885189:web:d0ae67cf9a56c52f2e71ac",
};

function parseArgs(argv) {
  const rest = argv.slice(2);
  const valueAfter = (flag) => {
    const idx = rest.indexOf(flag);
    return idx >= 0 ? rest[idx + 1] : undefined;
  };
  return {
    commit: rest.includes("--commit"),
    emulator: rest.includes("--emulator"),
    tripId: valueAfter("--trip"),
  };
}

function asName(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getCurrentName(uid, members, profiles, fallback = "이름 없음") {
  return asName(profiles.get(uid)?.name) || asName(members[uid]) || fallback;
}

function snapshotAccountText(account) {
  if (!account || typeof account !== "object") return "계좌 미등록";
  return [account.bankName, account.accountNumber, account.holderName]
    .filter((v) => typeof v === "string" && v.trim())
    .join(" ") || "계좌 미등록";
}

function buildShareMessage(request, tripName) {
  const expenses = Array.isArray(request.expenseSnapshots) ? request.expenseSnapshots : [];
  const transfers = Array.isArray(request.transfers) ? request.transfers : [];
  const expenseLines = expenses.map((expense, idx) => {
    const participantNames = Array.isArray(expense.participantNames) ? expense.participantNames : [];
    const participantText = participantNames.length > 1 ? participantNames.join(", ") : "정산 없음";
    return [
      `${idx + 1}. ${expense.title ?? "지출"} - ₩${Math.round(expense.amount ?? 0).toLocaleString("ko-KR")}`,
      `   - 결제자: ${expense.payerName ?? "결제자"}`,
      `   - 정산 인원: ${participantText}`,
    ].join("\n");
  });
  const transferLines = transfers.map(
    (transfer) =>
      `- ${transfer.fromName ?? "보낼 사람"} → ${transfer.toName ?? "받을 사람"}: ₩${Math.round(
        transfer.amount ?? 0,
      ).toLocaleString("ko-KR")}`,
  );
  const accountLines = Array.from(
    new Map(transfers.map((transfer) => [transfer.toUid, transfer])).values(),
  ).map((transfer) => `${transfer.toName ?? "받을 사람"}: ${snapshotAccountText(transfer.toAccount)}`);

  return [
    `[${tripName}] 정산 요청`,
    "",
    `정산 제목: ${request.title ?? "정산 요청"}`,
    `총 지출: ₩${Math.round(request.totalExpenseAmount ?? 0).toLocaleString("ko-KR")}`,
    `상계 후 송금 총액: ₩${Math.round(request.transferTotal ?? 0).toLocaleString("ko-KR")}`,
    "",
    "지출 내역",
    expenseLines.length ? expenseLines.join("\n") : "- 지출 내역 없음",
    "",
    "보낼 금액",
    transferLines.length ? transferLines.join("\n") : "- 송금할 금액 없음",
    "",
    "송금 계좌",
    accountLines.length ? accountLines.join("\n") : "- 정산 대상 계좌 없음",
    "",
    request.shareUrl ? `상세 보기: ${request.shareUrl}` : "",
  ]
    .filter((line, idx, lines) => line || idx < lines.length - 1)
    .join("\n");
}

function isEqualJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addUpdate(batchState, ref, updates) {
  batchState.batch.update(ref, updates);
  batchState.pending += 1;
}

async function flushBatch(db, batchState, commit) {
  if (batchState.pending === 0) return;
  if (commit) {
    await batchState.batch.commit();
  }
  batchState.batch = writeBatch(db);
  batchState.pending = 0;
}

async function main() {
  const args = parseArgs(process.argv);

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  if (args.emulator) {
    connectFirestoreEmulator(db, "localhost", 8080);
  }
  const batchState = { batch: writeBatch(db), pending: 0 };
  const stats = {
    tripsScanned: 0,
    tripsChanged: 0,
    expensesScanned: 0,
    expensesChanged: 0,
    requestsScanned: 0,
    requestsChanged: 0,
  };
  const samples = [];

  const profileSnap = await getDocs(collection(db, "userProfiles"));
  const profiles = new Map(profileSnap.docs.map((doc) => [doc.id, doc.data() ?? {}]));

  const tripsSnap = args.tripId
    ? { docs: [await getDoc(doc(db, "trips", args.tripId))].filter((doc) => doc.exists()) }
    : await getDocs(collection(db, "trips"));

  for (const tripDoc of tripsSnap.docs) {
    stats.tripsScanned += 1;
    const trip = tripDoc.data() ?? {};
    const members = { ...(trip.members ?? {}) };
    const memberUids = Array.isArray(trip.memberUids) && trip.memberUids.length > 0
      ? trip.memberUids
      : Object.keys(members);
    const nextMembers = { ...members };

    for (const uid of memberUids) {
      const profileName = asName(profiles.get(uid)?.name);
      if (profileName && nextMembers[uid] !== profileName) {
        nextMembers[uid] = profileName;
      }
    }

    const membersChanged = !isEqualJson(members, nextMembers);
    if (membersChanged) {
      stats.tripsChanged += 1;
      addUpdate(batchState, tripDoc.ref, { members: nextMembers });
      samples.push(`trip ${tripDoc.id}: members updated`);
    }

    const expensesSnap = await getDocs(collection(db, "trips", tripDoc.id, "expenses"));
    for (const expenseDoc of expensesSnap.docs) {
      stats.expensesScanned += 1;
      const expense = expenseDoc.data() ?? {};
      const paidByUid = expense.paidByUid;
      if (!paidByUid) continue;
      const paidBy = getCurrentName(paidByUid, nextMembers, profiles, "");
      if (paidBy && expense.paidBy !== paidBy) {
        stats.expensesChanged += 1;
        addUpdate(batchState, expenseDoc.ref, { paidBy });
        samples.push(`expense ${tripDoc.id}/${expenseDoc.id}: paidBy "${expense.paidBy ?? ""}" -> "${paidBy}"`);
      }
      if (batchState.pending >= DEFAULT_BATCH_LIMIT) {
        await flushBatch(db, batchState, args.commit);
      }
    }

    const requestsSnap = await getDocs(collection(db, "trips", tripDoc.id, "settlementRequests"));
    for (const requestDoc of requestsSnap.docs) {
      stats.requestsScanned += 1;
      const request = requestDoc.data() ?? {};
      const updates = {};

      for (const field of ["requestedBy", "completedBy", "cancelledBy"]) {
        const uid = request[`${field}Uid`];
        const nameField = `${field}Name`;
        const nextName = uid ? getCurrentName(uid, nextMembers, profiles, "") : "";
        if (nextName && request[nameField] !== nextName) {
          updates[nameField] = nextName;
        }
      }

      if (Array.isArray(request.expenseSnapshots)) {
        const nextSnapshots = request.expenseSnapshots.map((snapshot) => {
          const payerName = getCurrentName(snapshot.payerUid, nextMembers, profiles, snapshot.payerName ?? "결제자");
          const participantNames = Array.isArray(snapshot.participantUids)
            ? snapshot.participantUids.map((uid, idx) =>
                getCurrentName(uid, nextMembers, profiles, snapshot.participantNames?.[idx] ?? "이름 없음"),
              )
            : snapshot.participantNames;
          return { ...snapshot, payerName, participantNames };
        });
        if (!isEqualJson(request.expenseSnapshots, nextSnapshots)) {
          updates.expenseSnapshots = nextSnapshots;
        }
      }

      if (Array.isArray(request.transfers)) {
        const nextTransfers = request.transfers.map((transfer) => ({
          ...transfer,
          fromName: getCurrentName(transfer.fromUid, nextMembers, profiles, transfer.fromName ?? "보낼 사람"),
          toName: getCurrentName(transfer.toUid, nextMembers, profiles, transfer.toName ?? "받을 사람"),
        }));
        if (!isEqualJson(request.transfers, nextTransfers)) {
          updates.transfers = nextTransfers;
        }
      }

      const requestForMessage = { ...request, ...updates };
      if (request.shareMessage) {
        const nextMessage = buildShareMessage(requestForMessage, trip.name ?? "여행");
        if (request.shareMessage !== nextMessage) {
          updates.shareMessage = nextMessage;
        }
      }

      if (Object.keys(updates).length > 0) {
        stats.requestsChanged += 1;
        addUpdate(batchState, requestDoc.ref, updates);
        samples.push(`settlementRequest ${tripDoc.id}/${requestDoc.id}: ${Object.keys(updates).join(", ")}`);
      }
      if (batchState.pending >= DEFAULT_BATCH_LIMIT) {
        await flushBatch(db, batchState, args.commit);
      }
    }
  }

  await flushBatch(db, batchState, args.commit);

  console.log(args.commit ? "COMMIT 완료" : "DRY RUN - 변경 사항을 쓰지 않았습니다. 실제 반영은 --commit을 붙이세요.");
  console.log(JSON.stringify(stats, null, 2));
  if (samples.length > 0) {
    console.log("samples:");
    for (const line of samples.slice(0, 30)) console.log(`- ${line}`);
    if (samples.length > 30) console.log(`- ... and ${samples.length - 30} more`);
  }
}

main().catch((error) => {
  console.error("[sync-settlement-member-names] 실패:", error.message ?? error);
  process.exit(1);
});
