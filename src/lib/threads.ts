import {
  collection,
  doc,
  updateDoc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  limitToLast,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  runTransaction,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── Types ──────────────────────────────────────────────────────────────────

export type ThreadVisibility = "public" | "private";

export interface Thread {
  id: string;
  title: string;
  visibility: ThreadVisibility;
  createdByUid: string;
  createdByName: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  deleted: boolean;
  // 핀 고정
  pinnedMessage?: { id: string; text: string; displayName: string } | null;
  // client-only
  isNew?: boolean;
  readAt?: Date | null;
}

export interface ReplyRef {
  id: string;
  text: string;
  displayName: string;
}

export interface ThreadMessage {
  id: string;
  text: string;
  uid: string;
  displayName: string;
  photoURL: string | null;
  createdAt: Timestamp | null;
  // 수정
  editedAt?: Timestamp | null;
  // 삭제 (soft delete)
  deletedAt?: Timestamp | null;
  // 이모지 반응: { "👍": ["uid1","uid2"], "❤️": ["uid3"] }
  reactions?: Record<string, string[]>;
  // 답장
  replyTo?: ReplyRef | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function tsMillis(ts: Timestamp | Date | null | undefined): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof (ts as Timestamp).toMillis === "function") return (ts as Timestamp).toMillis();
  return 0;
}

export function isThreadNew(thread: Thread, readAt: Date | null): boolean {
  const updated = tsMillis(thread.updatedAt);
  if (!updated) return false;
  return updated > tsMillis(readAt);
}

export function formatThreadTime(ts: Timestamp | null | undefined): string {
  if (!ts) return "";
  const date = ts.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function formatMessageTime(ts: Timestamp | null | undefined): string {
  if (!ts) return "";
  const date = ts.toDate();
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Paths ────────────────────────────────────────────────────────────────────

const threadsCol = (tripId: string) => collection(db, `trips/${tripId}/threads`);
const threadDoc = (tripId: string, threadId: string) =>
  doc(db, `trips/${tripId}/threads/${threadId}`);
const messagesCol = (tripId: string, threadId: string) =>
  collection(db, `trips/${tripId}/threads/${threadId}/messages`);
const msgDoc = (tripId: string, threadId: string, msgId: string) =>
  doc(db, `trips/${tripId}/threads/${threadId}/messages/${msgId}`);
const readDoc = (tripId: string, threadId: string, uid: string) =>
  doc(db, `trips/${tripId}/threads/${threadId}/reads/${uid}`);
const readsCol = (tripId: string, threadId: string) =>
  collection(db, `trips/${tripId}/threads/${threadId}/reads`);

// ── Thread subscriptions ──────────────────────────────────────────────────────

type ThreadQueryState = { public: Thread[]; private: Thread[] };

export function subscribeThreads(
  tripId: string,
  uid: string,
  onUpdate: (threads: Thread[]) => void,
  onError: (e: Error) => void
): Unsubscribe {
  const state: ThreadQueryState = { public: [], private: [] };
  const merge = () => {
    const byId: Record<string, Thread> = {};
    [...state.public, ...state.private].forEach((t) => { byId[t.id] = t; });
    onUpdate(Object.values(byId).sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt)));
  };
  const base = threadsCol(tripId);
  const u1 = onSnapshot(
    query(base, where("deleted", "==", false), where("visibility", "==", "public")),
    (snap) => { state.public = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Thread)); merge(); },
    onError
  );
  const u2 = onSnapshot(
    query(base, where("deleted", "==", false), where("visibility", "==", "private"), where("createdByUid", "==", uid)),
    (snap) => { state.private = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Thread)); merge(); },
    onError
  );
  return () => { u1(); u2(); };
}

export function subscribeMessages(
  tripId: string,
  threadId: string,
  onUpdate: (messages: ThreadMessage[]) => void,
  onError: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(messagesCol(tripId, threadId), orderBy("createdAt"), limitToLast(200)),
    (snap) => {
      onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ThreadMessage)));
    },
    onError
  );
}

// 읽음 현황 한 번 조회 (에뮬레이터 watch stream 버그 우회)
export async function getReadsSnapshot(
  tripId: string,
  threadId: string
): Promise<Record<string, number>> {
  try {
    const snap = await import("firebase/firestore").then(({ getDocs }) =>
      getDocs(readsCol(tripId, threadId))
    );
    const result: Record<string, number> = {};
    snap.forEach((d) => {
      const ts = d.data().readAt as Timestamp | null;
      result[d.id] = ts ? ts.toMillis() : 0;
    });
    return result;
  } catch {
    return {};
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getThreadReadAt(
  tripId: string, threadId: string, uid: string
): Promise<Date | null> {
  try {
    const snap = await getDoc(readDoc(tripId, threadId, uid));
    if (!snap.exists()) return null;
    const ts = snap.data()?.readAt as Timestamp | null;
    return ts ? ts.toDate() : null;
  } catch { return null; }
}

export async function markThreadRead(
  tripId: string, threadId: string, uid: string
): Promise<void> {
  try {
    await setDoc(readDoc(tripId, threadId, uid), { uid, readAt: serverTimestamp() }, { merge: true });
  } catch (e) { console.warn("읽음 처리 실패:", e); }
}

// ── Thread CRUD ───────────────────────────────────────────────────────────────

export async function createThread(
  tripId: string, uid: string, displayName: string,
  title: string, visibility: ThreadVisibility
): Promise<string> {
  const ref = doc(threadsCol(tripId));
  await setDoc(ref, {
    title, visibility, createdByUid: uid, createdByName: displayName,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deleted: false,
  });
  await markThreadRead(tripId, ref.id, uid);
  return ref.id;
}

export async function updateThreadTitle(tripId: string, threadId: string, title: string): Promise<void> {
  await updateDoc(threadDoc(tripId, threadId), { title, updatedAt: serverTimestamp() });
}

export async function deleteThread(tripId: string, threadId: string): Promise<void> {
  await updateDoc(threadDoc(tripId, threadId), { deleted: true, updatedAt: serverTimestamp() });
}

// ── Message CRUD ──────────────────────────────────────────────────────────────

export async function sendMessage(
  tripId: string, threadId: string,
  uid: string, displayName: string, photoURL: string | null,
  text: string,
  replyTo?: ReplyRef | null
): Promise<void> {
  const batch = writeBatch(db);
  const msgRef = doc(messagesCol(tripId, threadId));
  batch.set(msgRef, {
    text, uid, displayName, photoURL: photoURL ?? null,
    createdAt: serverTimestamp(),
    ...(replyTo ? { replyTo } : {}),
  });
  batch.update(threadDoc(tripId, threadId), { updatedAt: serverTimestamp() });
  batch.set(readDoc(tripId, threadId, uid), { uid, readAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}

export async function editMessage(
  tripId: string, threadId: string, msgId: string, newText: string
): Promise<void> {
  await updateDoc(msgDoc(tripId, threadId, msgId), {
    text: newText,
    editedAt: serverTimestamp(),
  });
}

export async function deleteMessage(
  tripId: string, threadId: string, msgId: string
): Promise<void> {
  await updateDoc(msgDoc(tripId, threadId, msgId), {
    deletedAt: serverTimestamp(),
    text: "",
  });
}

export async function toggleReaction(
  tripId: string, threadId: string, msgId: string,
  emoji: string, uid: string, hasReacted: boolean
): Promise<void> {
  const ref = msgDoc(tripId, threadId, msgId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const current = (snap.data()?.reactions ?? {}) as Record<string, string[]>;
    const uids: string[] = current[emoji] ?? [];
    const next = hasReacted
      ? uids.filter((u) => u !== uid)
      : [...uids.filter((u) => u !== uid), uid];
    tx.update(ref, { [`reactions.${emoji}`]: next });
  });
}

export async function pinMessage(
  tripId: string, threadId: string,
  msg: { id: string; text: string; displayName: string } | null
): Promise<void> {
  await updateDoc(threadDoc(tripId, threadId), {
    pinnedMessage: msg,
    updatedAt: serverTimestamp(),
  });
}
