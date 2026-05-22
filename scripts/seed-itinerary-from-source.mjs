#!/usr/bin/env node
/**
 * docs/trip-seed-source-of-truth.md 의 일정 표를 운영 Firestore places에 추가한다.
 *
 * 기본은 dry-run이다. 실제 추가는 --execute 를 붙인다.
 * 기존 데이터는 삭제하지 않고, date + startTime + name 이 같은 일정은 건너뛴다.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import auth from "firebase-tools/lib/auth.js";
import scopes from "firebase-tools/lib/scopes.js";

const PROJECT_ID = "trip-planner-2026-ec5ec";
const DATABASE = "(default)";
const DOC_PATH = "docs/trip-seed-source-of-truth.md";
const DEFAULT_ADDED_BY = "나라";
const DEFAULT_ADDED_BY_UID = "xdiqN6R92NbFXjf2zB8y0xdTB0Ky";

function parseArgs(argv) {
  const args = argv.slice(2);
  const tripId = valueAfter(args, "--tripId") ?? args.find((arg) => !arg.startsWith("--"));
  return {
    tripId,
    execute: args.includes("--execute"),
  };
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

async function getAccessToken() {
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error("Firebase CLI 로그인 정보가 없습니다. firebase login 을 먼저 실행하세요.");
  }
  const token = await auth.getAccessToken(account.tokens.refresh_token, [
    scopes.CLOUD_PLATFORM,
    scopes.FIREBASE_PLATFORM,
  ]);
  if (!token?.access_token) throw new Error("Firebase access token을 가져오지 못했습니다.");
  return token.access_token;
}

function firestoreUrl(path) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents/${path}`;
}

function firestoreName(path) {
  return `projects/${PROJECT_ID}/databases/${DATABASE}/documents/${path}`;
}

async function firestoreGet(token, path) {
  const res = await fetch(firestoreUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Firestore GET 실패 (${res.status}): ${body.error?.message ?? JSON.stringify(body)}`);
  }
  return body;
}

async function firestoreRunQuery(token, parentPath, collectionId) {
  const res = await fetch(`${firestoreUrl(parentPath)}:runQuery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Firestore query 실패 (${res.status}): ${body.error?.message ?? JSON.stringify(body)}`);
  }
  return body.map((row) => row.document).filter(Boolean);
}

async function firestoreBatchWrite(token, writes) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents:batchWrite`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ writes }),
    },
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Firestore batchWrite 실패 (${res.status}): ${body.error?.message ?? JSON.stringify(body)}`);
  }
  const failed = (body.status ?? []).filter((status) => status.code && status.code !== 0);
  if (failed.length > 0) {
    throw new Error(`Firestore batchWrite 일부 실패: ${JSON.stringify(failed)}`);
  }
  return body;
}

function parseScheduleRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## 일정");
  if (start === -1) throw new Error("문서에서 ## 일정 섹션을 찾지 못했습니다.");
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const section = lines.slice(start, end === -1 ? lines.length : end);
  const rows = section
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => line.trim())
    .map(parseTableRow);
  if (rows.length === 0) throw new Error("일정 표에서 추가할 행을 찾지 못했습니다.");
  return rows;
}

function parseTableRow(line) {
  const cells = line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
  const [order, date, startTime, endTime, name, placeUrl, note] = cells;
  return {
    order: Number(order),
    date,
    startTime,
    endTime,
    name,
    placeUrl: cleanCell(placeUrl),
    note: cleanCell(note).replace(/<br\s*\/?>/gi, "\n"),
  };
}

function cleanCell(value = "") {
  return value.trim();
}

function keyOf(place) {
  return `${readString(place.fields?.date)}\u0000${readString(place.fields?.startTime)}\u0000${readString(place.fields?.name)}`;
}

function rowKey(row) {
  return `${row.date}\u0000${row.startTime}\u0000${row.name}`;
}

function readString(field) {
  return field?.stringValue ?? "";
}

function toFirestoreFields(row, now) {
  const fields = {
    date: { stringValue: row.date },
    startTime: { stringValue: row.startTime },
    endTime: { stringValue: row.endTime },
    name: { stringValue: row.name },
    addedBy: { stringValue: DEFAULT_ADDED_BY },
    addedByUid: { stringValue: DEFAULT_ADDED_BY_UID },
    order: { integerValue: String(row.order) },
    createdAt: { timestampValue: now },
    likes: { mapValue: { fields: {} } },
    dislikes: { mapValue: { fields: {} } },
  };
  if (row.note) fields.note = { stringValue: row.note };
  if (row.placeUrl) fields.placeUrl = { stringValue: row.placeUrl };
  return fields;
}

function createDocId(row) {
  const hash = crypto.createHash("sha1").update(rowKey(row)).digest("hex").slice(0, 16);
  return `seed_${String(row.order).padStart(2, "0")}_${hash}`;
}

async function main() {
  const { tripId, execute } = parseArgs(process.argv);
  if (!tripId) {
    throw new Error("tripId가 필요합니다. 예: node scripts/seed-itinerary-from-source.mjs --tripId <tripId> --execute");
  }

  const markdown = fs.readFileSync(DOC_PATH, "utf8");
  const rows = parseScheduleRows(markdown);
  const token = await getAccessToken();

  const trip = await firestoreGet(token, `trips/${tripId}`);
  const tripFields = trip.fields ?? {};
  console.log(`대상 trip: ${readString(tripFields.name)} (${tripId})`);
  console.log(`기간/code: ${readString(tripFields.startDate)} ~ ${readString(tripFields.endDate)} / ${readString(tripFields.code)}`);

  const existing = await firestoreRunQuery(token, `trips/${tripId}`, "places");
  const existingKeys = new Set(existing.map(keyOf));
  const rowsToAdd = rows.filter((row) => !existingKeys.has(rowKey(row)));
  const skipped = rows.length - rowsToAdd.length;

  console.log(`문서 일정: ${rows.length}개`);
  console.log(`기존 중복: ${skipped}개`);
  console.log(`추가 대상: ${rowsToAdd.length}개`);

  if (!execute) {
    console.log("dry-run 완료. 실제 추가는 --execute 를 붙여 실행하세요.");
    return;
  }

  if (rowsToAdd.length === 0) {
    console.log("추가할 일정이 없습니다.");
    return;
  }

  const now = new Date().toISOString();
  const writes = rowsToAdd.map((row) => ({
    update: {
      name: firestoreName(`trips/${tripId}/places/${createDocId(row)}`),
      fields: toFirestoreFields(row, now),
    },
  }));
  await firestoreBatchWrite(token, writes);
  console.log(`완료: trips/${tripId}/places 에 ${rowsToAdd.length}개 추가`);
}

main().catch((err) => {
  console.error(`[seed-itinerary-from-source] 실패: ${err.message ?? err}`);
  process.exit(1);
});
