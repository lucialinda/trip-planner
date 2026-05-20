"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  type FirestoreError,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { AddExpenseDialog } from "@/components/AddExpenseDialog";
import { SwipeableItem, type SwipeableItemHandle } from "@/components/ui/SwipeableItem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CATEGORY_META,
  type Expense,
  type ExpenseCategory,
  effectiveKrw,
  formatKrw,
  fromDoc,
  getParticipantUids,
} from "@/lib/expenses";
import { isAdminUid } from "@/lib/admin";
import { Check, Circle, CircleCheck, Edit2, Send, Trash2 } from "lucide-react";

// ---------- 트립 데이터 (settle에서 필요한 최소 필드) ----------

interface TripData {
  id: string;
  name?: string;
  members?: Record<string, string>;
  memberUids?: string[];
}

interface SettlementSettings {
  settlementAccountBank: string;
  settlementAccountNumber: string;
  settlementAccountHolder: string;
}

interface SettlementAccount {
  bankName?: string;
  accountNumber?: string;
  holderName?: string;
}

interface SettlementTransfer {
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  amount: number;
  toAccount?: SettlementAccount;
}

interface SettlementBalanceResult {
  balances: Map<string, number>;
  memberNames: Map<string, string>;
}

interface SettlementExpenseItem {
  id: string;
  title: string;
  amount: number;
  paidByName: string;
  participants: { name: string; isPayer: boolean }[];
  hasSharedSettlement: boolean;
}

interface SettlementPreviewData {
  requestId: string;
  title: string;
  tripName: string;
  text: string;
  total: number;
  expenseCount: number;
  transfers: SettlementTransfer[];
  transferTotal: number;
  expenses: SettlementExpenseItem[];
  accountLines: string[];
  pageUrl: string;
}

type SettlementRequestStatus = "requested" | "completed" | "cancelled";

interface SettlementExpenseSnapshot {
  expenseId: string;
  title: string;
  amount: number;
  payerUid: string;
  payerName: string;
  participantUids: string[];
  participantNames: string[];
}

interface SettlementRequest {
  id: string;
  tripId: string;
  title: string;
  status: SettlementRequestStatus;
  requestedByUid: string;
  requestedByName: string;
  requestedAt?: Date;
  completedAt?: Date;
  completedByUid?: string;
  completedByName?: string;
  cancelledAt?: Date;
  cancelledByUid?: string;
  cancelledByName?: string;
  expenseIds: string[];
  expenseSnapshots: SettlementExpenseSnapshot[];
  transfers: SettlementTransfer[];
  totalExpenseAmount: number;
  transferTotal: number;
  shareUrl: string;
  shareMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ---------- 상수 ----------

const EMPTY_MEMBERS: Record<string, string> = {};
const DEFAULT_SETTLEMENT_SETTINGS: SettlementSettings = {
  settlementAccountBank: "",
  settlementAccountNumber: "",
  settlementAccountHolder: "",
};

// ---------- 필터 ----------

type FilterKey = "all" | "tentative" | "confirmed";
type ListMode = "latest" | "amount" | "mine";
const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "모두보기" },
  { key: "tentative", label: "미정산" },
  { key: "confirmed", label: "정산완료" },
];
const LIST_MODE_OPTIONS: { key: ListMode; label: string }[] = [
  { key: "latest", label: "최신순" },
  { key: "amount", label: "금액순" },
  { key: "mine", label: "내 결제만" },
];

const REQUEST_STATUS_LABEL: Record<SettlementRequestStatus, string> = {
  requested: "요청",
  completed: "완료",
  cancelled: "취소",
};
type SettlementRequestFilter = "all" | SettlementRequestStatus;
const REQUEST_FILTER_OPTIONS: { key: SettlementRequestFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "requested", label: "요청" },
  { key: "completed", label: "완료" },
  { key: "cancelled", label: "취소" },
];

function formatPaidDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatRequestDate(date: Date | undefined): string {
  if (!date) return "날짜 없음";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function getRequestStatusDate(request: SettlementRequest): Date | undefined {
  if (request.status === "completed") return request.completedAt;
  if (request.status === "cancelled") return request.cancelledAt;
  return request.requestedAt;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 일부 WebView/localhost 환경에서는 Clipboard API가 노출되어도 권한 문제로 실패한다.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("클립보드 복사 권한을 사용할 수 없어요.");
  }
}

function normalizeSettlementSettings(data: Record<string, unknown> | undefined): SettlementSettings {
  return {
    settlementAccountBank:
      typeof data?.settlementAccountBank === "string" ? data.settlementAccountBank : "",
    settlementAccountNumber:
      typeof data?.settlementAccountNumber === "string" ? data.settlementAccountNumber : "",
    settlementAccountHolder:
      typeof data?.settlementAccountHolder === "string" ? data.settlementAccountHolder : "",
  };
}


function getSettlementAccountText(settings: SettlementSettings) {
  const bank = settings.settlementAccountBank.trim();
  const number = settings.settlementAccountNumber.trim();
  const holder = settings.settlementAccountHolder.trim();
  return [bank, number, holder].filter(Boolean).join(" ") || "계좌 미등록";
}

function settlementSettingsToAccount(settings: SettlementSettings): SettlementAccount | undefined {
  const bankName = settings.settlementAccountBank.trim();
  const accountNumber = settings.settlementAccountNumber.trim();
  const holderName = settings.settlementAccountHolder.trim();
  const account: SettlementAccount = {};
  if (bankName) account.bankName = bankName;
  if (accountNumber) account.accountNumber = accountNumber;
  if (holderName) account.holderName = holderName;
  return Object.keys(account).length > 0 ? account : undefined;
}

function getSettlementAccountSnapshotText(account: SettlementAccount | undefined) {
  if (!account) return "계좌 미등록";
  return [account.bankName, account.accountNumber, account.holderName].filter(Boolean).join(" ") || "계좌 미등록";
}

function buildSettlementShareMessage(data: Omit<SettlementPreviewData, "text">): string {
  const expenseLines = data.expenses.map((expense, idx) =>
    [
      `${idx + 1}) ${expense.title}`,
      `   - 금액: ${formatKrw(expense.amount)}`,
      `   - 결제자: ${expense.paidByName}`,
      expense.hasSharedSettlement
        ? `   - 정산 인원: ${expense.participants.map((participant) => participant.name).join(", ") || "정산 멤버 없음"}`
        : "   - 정산 없음",
    ].join("\n")
  );
  const transferLines = data.transfers.map(
    (transfer) => `- ${transfer.fromName} → ${transfer.toName}: ${formatKrw(transfer.amount)}`
  );

  return [
    `[${data.title}]`,
    "\n🧾 정산 대상",
    `총 ${data.expenseCount}건 · 총 지출 ${formatKrw(data.total)}`,
    `상계 후 송금 ${formatKrw(data.transferTotal)}`,
    "\n📌 지출 내역",
    expenseLines.join("\n\n") || "정산 대상 지출이 없어요.",
    "\n💸 상계 후 보낼 금액",
    "서로 주고받을 금액을 상계한 뒤, 실제로 송금할 금액입니다.",
    transferLines.join("\n") || "- 정산 대상 없음",
    "\n🏦 송금 계좌",
    data.accountLines.map((line) => `- ${line}`).join("\n"),
    data.pageUrl ? "\n🔗 정산 페이지" : "",
    data.pageUrl,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseSettlementRequestDoc(id: string, data: Record<string, unknown>): SettlementRequest {
  const ts = (key: string): Date | undefined => {
    const raw = data[key] as { toDate?: () => Date } | undefined;
    return raw?.toDate?.();
  };

  return {
    id,
    tripId: (data.tripId as string) ?? "",
    title: (data.title as string) ?? "정산 요청",
    status: (data.status as SettlementRequestStatus) ?? "requested",
    requestedByUid: (data.requestedByUid as string) ?? "",
    requestedByName: (data.requestedByName as string) ?? "요청자",
    requestedAt: ts("requestedAt"),
    completedAt: ts("completedAt"),
    completedByUid: data.completedByUid as string | undefined,
    completedByName: data.completedByName as string | undefined,
    cancelledAt: ts("cancelledAt"),
    cancelledByUid: data.cancelledByUid as string | undefined,
    cancelledByName: data.cancelledByName as string | undefined,
    expenseIds: Array.isArray(data.expenseIds) ? (data.expenseIds as string[]) : [],
    expenseSnapshots: Array.isArray(data.expenseSnapshots)
      ? (data.expenseSnapshots as SettlementExpenseSnapshot[])
      : [],
    transfers: Array.isArray(data.transfers) ? (data.transfers as SettlementTransfer[]) : [],
    totalExpenseAmount: typeof data.totalExpenseAmount === "number" ? data.totalExpenseAmount : 0,
    transferTotal: typeof data.transferTotal === "number" ? data.transferTotal : 0,
    shareUrl: (data.shareUrl as string) ?? "",
    shareMessage: data.shareMessage as string | undefined,
    createdAt: ts("createdAt"),
    updatedAt: ts("updatedAt"),
  };
}

function calculateRoundedShares(amount: number, participantUids: string[], payerUid: string) {
  if (participantUids.length === 0) return new Map<string, number>();

  const roundedShare = Math.round(amount / participantUids.length);
  const shares = new Map(participantUids.map((uid) => [uid, roundedShare]));
  let residue = amount - roundedShare * participantUids.length;
  const adjustmentOrder = [
    ...participantUids.filter((uid) => uid === payerUid),
    ...participantUids.filter((uid) => uid !== payerUid),
  ];

  for (const uid of adjustmentOrder) {
    if (residue === 0) break;
    const adjustment = residue > 0 ? 1 : -1;
    shares.set(uid, (shares.get(uid) ?? 0) + adjustment);
    residue -= adjustment;
  }

  return shares;
}

function calculateNetBalances(
  expenses: Expense[],
  members: Record<string, string>
): SettlementBalanceResult {
  const memberUids = Object.keys(members);
  const balances = new Map<string, number>();
  const memberNames = new Map(Object.entries(members));

  for (const expense of expenses) {
    const amount = Math.round(effectiveKrw(expense));
    const participantUids = getParticipantUids(expense, memberUids);
    if (participantUids.length === 0 || !expense.paidByUid) continue;

    if (expense.paidBy) {
      memberNames.set(expense.paidByUid, expense.paidBy);
    }
    balances.set(expense.paidByUid, (balances.get(expense.paidByUid) ?? 0) + amount);

    const shares = calculateRoundedShares(amount, participantUids, expense.paidByUid);
    for (const [uid, share] of shares) {
      balances.set(uid, (balances.get(uid) ?? 0) - share);
    }
  }

  return { balances, memberNames };
}

function buildOptimizedTransfers({ balances, memberNames }: SettlementBalanceResult): SettlementTransfer[] {
  const debtors = Array.from(balances.entries())
    .filter(([, balance]) => balance < -1)
    .map(([uid, balance]) => ({ uid, amount: Math.abs(balance) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Array.from(balances.entries())
    .filter(([, balance]) => balance > 1)
    .map(([uid, balance]) => ({ uid, amount: balance }))
    .sort((a, b) => b.amount - a.amount);
  const transfers: SettlementTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 1) {
      transfers.push({
        fromUid: debtor.uid,
        fromName: memberNames.get(debtor.uid) ?? "이름 없음",
        toUid: creditor.uid,
        toName: memberNames.get(creditor.uid) ?? "이름 없음",
        amount,
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount <= 1) debtorIndex += 1;
    if (creditor.amount <= 1) creditorIndex += 1;
  }

  return transfers;
}

function buildSettlementPreviewData({
  requestId,
  tripName,
  members,
  expenses,
  settings,
  settingsByUid,
  pageUrl,
}: {
  requestId: string;
  tripName: string;
  members: Record<string, string>;
  expenses: Expense[];
  settings: SettlementSettings;
  settingsByUid: Record<string, SettlementSettings>;
  pageUrl: string;
}): SettlementPreviewData {
  const memberUids = Object.keys(members);
  const total = expenses.reduce((sum, expense) => sum + effectiveKrw(expense), 0);
  const baseTransfers = buildOptimizedTransfers(calculateNetBalances(expenses, members));
  const transfers = baseTransfers.map((transfer) => {
    const receiverSettings = settingsByUid[transfer.toUid] ?? DEFAULT_SETTLEMENT_SETTINGS;
    const toAccount = settlementSettingsToAccount(receiverSettings);
    if (!toAccount) return transfer;
    return {
      ...transfer,
      toAccount,
    };
  });
  const largestExpense = [...expenses].sort((a, b) => effectiveKrw(b) - effectiveKrw(a))[0];
  const largestExpenseTitle = largestExpense
    ? largestExpense.description || CATEGORY_META[largestExpense.category].label
    : "정산 요청";
  const title =
    expenses.length > 1
      ? `${largestExpenseTitle} 외 ${expenses.length - 1}건`
      : largestExpenseTitle;
  const transferTotal = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
  const accountLines = Array.from(new Set(transfers.map((transfer) => transfer.toUid))).map((uid) => {
    const receiverName = members[uid] ?? transfers.find((transfer) => transfer.toUid === uid)?.toName ?? "받을 사람";
    const receiverAccount = transfers.find((transfer) => transfer.toUid === uid)?.toAccount;
    return `${receiverName}: ${getSettlementAccountSnapshotText(receiverAccount)}`;
  });
  const previewData = {
    requestId,
    title,
    tripName,
    total,
    expenseCount: expenses.length,
    transfers,
    transferTotal,
    expenses: expenses.map((expense) => {
      const participantUids = getParticipantUids(expense, memberUids);
      return {
        id: expense.id,
        title: expense.description || CATEGORY_META[expense.category].label,
        amount: effectiveKrw(expense),
        paidByName: members[expense.paidByUid] ?? expense.paidBy ?? "결제자",
        participants: participantUids.map((uid) => ({
          name: members[uid] ?? "이름 없음",
          isPayer: uid === expense.paidByUid,
        })),
        hasSharedSettlement: participantUids.some((uid) => uid !== expense.paidByUid),
      };
    }),
    accountLines,
    pageUrl,
  };

  return {
    ...previewData,
    text: buildSettlementShareMessage(previewData),
  };
}

function buildExpenseSnapshots(
  expenses: Expense[],
  members: Record<string, string>
): SettlementExpenseSnapshot[] {
  const memberUids = Object.keys(members);
  return expenses.map((expense) => {
    const participantUids = getParticipantUids(expense, memberUids);
    return {
      expenseId: expense.id,
      title: expense.description || CATEGORY_META[expense.category].label,
      amount: Math.round(effectiveKrw(expense)),
      payerUid: expense.paidByUid,
      payerName: members[expense.paidByUid] ?? expense.paidBy ?? "결제자",
      participantUids,
      participantNames: participantUids.map((uid) => members[uid] ?? "이름 없음"),
    };
  });
}

// ---------- Page ----------

function SettleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripId = searchParams.get("id");
  const requestIdParam = searchParams.get("request");
  const tabParam = searchParams.get("tab");
  const { user, loading: authLoading } = useAuth();

  const [trip, setTrip] = useState<TripData | null>(null);
  const [tripLoading, setTripLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expensesError, setExpensesError] = useState<FirestoreError | null>(null);
  const [settlementRequests, setSettlementRequests] = useState<SettlementRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [listMode, setListMode] = useState<ListMode>("latest");
  const [listModeMenuOpen, setListModeMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [settlementSettings, setSettlementSettings] = useState<SettlementSettings>(DEFAULT_SETTLEMENT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<SettlementSettings>(DEFAULT_SETTLEMENT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settlementPreview, setSettlementPreview] = useState<SettlementPreviewData | null>(null);
  const [settlementConfirming, setSettlementConfirming] = useState(false);
  const [requestActionLoading, setRequestActionLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(
    () => new Set()
  );
  const [memberPhotos, setMemberPhotos] = useState<Record<string, string | null>>({});
  const [memberSettlementSettings, setMemberSettlementSettings] = useState<Record<string, SettlementSettings>>({});
  const swipeRefs = useRef<Map<string, SwipeableItemHandle | null>>(new Map());

  // 비로그인 / id 누락 → 홈으로
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/");
      return;
    }
    if (!tripId) {
      router.push("/");
    }
  }, [authLoading, user, tripId, router]);

  // trip 문서 구독
  useEffect(() => {
    if (!user || !tripId) return;
    const unsub = onSnapshot(
      doc(db, "trips", tripId),
      (snap) => {
        if (snap.exists()) {
          setTrip({ id: snap.id, ...snap.data() } as TripData);
        } else {
          toast.error("여행 정보를 찾을 수 없습니다.");
          router.push("/");
        }
        setTripLoading(false);
      },
      (err) => {
        console.error("[settle] trip onSnapshot error", err);
        toast.error("여행 정보를 불러오지 못했어요.");
        setTripLoading(false);
      }
    );
    return () => unsub();
  }, [user, tripId, router]);

  // expenses 컬렉션 구독 (paidAt desc)
  useEffect(() => {
    if (!user || !tripId) return;
    const q = query(
      collection(db, "trips", tripId, "expenses"),
      orderBy("paidAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setExpenses(snap.docs.map((d) => fromDoc(d)));
        setExpensesError(null);
        setExpensesLoading(false);
      },
      (err) => {
        console.error("[settle] expenses onSnapshot error", err);
        setExpensesError(err);
        setExpensesLoading(false);
      }
    );
    return () => unsub();
  }, [user, tripId]);

  useEffect(() => {
    if (!user || !tripId) return;
    const q = query(
      collection(db, "trips", tripId, "settlementRequests"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSettlementRequests(
          snap.docs.map((d) => parseSettlementRequestDoc(d.id, d.data() as Record<string, unknown>))
        );
        setRequestsLoading(false);
      },
      (err) => {
        console.error("[settle] settlementRequests onSnapshot error", err);
        toast.error("정산 요청 목록을 불러오지 못했어요.");
        setRequestsLoading(false);
      }
    );
    return () => unsub();
  }, [user, tripId]);

  useEffect(() => {
    const members = trip?.members ?? {};
    const uids = Object.keys(members);
    if (!uids.length) {
      setMemberPhotos({});
      setMemberSettlementSettings({});
      return;
    }

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "userProfiles", uid));
            const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
            const url = typeof data?.photoURL === "string" ? data.photoURL : null;
            return [uid, { photoURL: url, settings: normalizeSettlementSettings(data) }] as const;
          } catch {
            return [uid, { photoURL: null, settings: DEFAULT_SETTLEMENT_SETTINGS }] as const;
          }
        })
      );
      if (!cancelled) {
        setMemberPhotos(Object.fromEntries(entries.map(([uid, profile]) => [uid, profile.photoURL])));
        setMemberSettlementSettings(Object.fromEntries(entries.map(([uid, profile]) => [uid, profile.settings])));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trip?.members]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "userProfiles", user.uid));
        const settings = normalizeSettlementSettings(
          snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
        );
        if (!cancelled) {
          setSettlementSettings(settings);
          setSettingsDraft(settings);
        }
      } catch {
        if (!cancelled) {
          setSettlementSettings(DEFAULT_SETTLEMENT_SETTINGS);
          setSettingsDraft(DEFAULT_SETTLEMENT_SETTINGS);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // 집계
  const memberCount = useMemo(
    () => Object.keys(trip?.members ?? {}).length,
    [trip]
  );

  const { total, byCategory, topCategory, perPerson } = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + effectiveKrw(e), 0);
    const byCategory: Record<ExpenseCategory, number> = {
      food: 0,
      cafe: 0,
      transit: 0,
      lodging: 0,
      activity: 0,
      shopping: 0,
      etc: 0,
    };
    for (const e of expenses) {
      byCategory[e.category] += effectiveKrw(e);
    }
    let topCategory: ExpenseCategory | null = null;
    let topAmount = 0;
    (Object.keys(byCategory) as ExpenseCategory[]).forEach((c) => {
      if (byCategory[c] > topAmount) {
        topAmount = byCategory[c];
        topCategory = c;
      }
    });
    // TODO(Phase 6): 실제 정산 방식(custom split / 결제자별 정산 등)에 맞게 교체
    const perPerson = memberCount > 0 ? total / memberCount : 0;
    return { total, byCategory, topCategory, perPerson };
  }, [expenses, memberCount]);

  const filteredExpenses = useMemo(
    () => {
      const next = expenses.filter((expense) => {
        const statusMatched = filter === "all" || expense.status === filter;
        const myPaymentMatched = listMode !== "mine" || expense.paidByUid === user?.uid;
        return statusMatched && myPaymentMatched;
      });

      return next.sort((a, b) => {
        if (listMode === "amount") {
          const amountCompare = effectiveKrw(b) - effectiveKrw(a);
          if (amountCompare !== 0) return amountCompare;
        }
        return b.paidAt.getTime() - a.paidAt.getTime();
      });
    },
    [expenses, filter, listMode, user?.uid]
  );

  const selectedExpenses = useMemo(
    () => expenses.filter((expense) => selectedExpenseIds.has(expense.id)),
    [expenses, selectedExpenseIds]
  );

  const selectedSettlementRequest = useMemo(
    () => settlementRequests.find((request) => request.id === requestIdParam) ?? null,
    [settlementRequests, requestIdParam]
  );

  const isRequestsTab = tabParam === "requests";


  const isInitialLoading =
    authLoading || tripLoading || (expensesLoading && expenses.length === 0);

  const closeAllSwipes = (exceptId?: string) => {
    swipeRefs.current.forEach((handle, id) => {
      if (id !== exceptId) handle?.close();
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedExpenseIds(new Set());
  };

  const clearSelectedExpenses = () => {
    setSelectedExpenseIds(new Set());
  };

  const toggleExpenseSelection = (expenseId: string) => {
    setSelectedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(expenseId)) {
        next.delete(expenseId);
      } else {
        next.add(expenseId);
      }
      return next;
    });
  };

  const canManageExpense = (expense: Expense) => {
    if (!user) return false;
    if (expense.status === "requested") return false;
    return (
      isAdminUid(user.uid) ||
      expense.createdByUid === user.uid ||
      expense.paidByUid === user.uid
    );
  };

  const openSettlementSettings = () => {
    setSettingsDraft(settlementSettings);
    setSettingsOpen(true);
  };

  const handleSaveSettlementSettings = async () => {
    if (!user) return;
    const draft: SettlementSettings = {
      settlementAccountBank: settingsDraft.settlementAccountBank.trim(),
      settlementAccountNumber: settingsDraft.settlementAccountNumber.trim(),
      settlementAccountHolder: settingsDraft.settlementAccountHolder.trim(),
    };

    setSettingsSaving(true);
    try {
      await setDoc(
        doc(db, "userProfiles", user.uid),
        {
          ...draft,
          settlementDefaultCurrency: deleteField(),
          settlementDefaultRate: deleteField(),
        },
        { merge: true }
      );
      setSettlementSettings(draft);
      setSettingsDraft(draft);
      setSettingsOpen(false);
      toast.success("정산 설정을 저장했어요.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`정산 설정 저장 실패: ${message}`);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!tripId) return;
    if (!window.confirm("이 지출을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "trips", tripId, "expenses", expense.id));
      toast.success("지출을 삭제했어요.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`삭제 실패: ${message}`);
    }
  };

  const handleShareSettlementRequest = async () => {
    if (selectedExpenses.length === 0) {
      toast.error("정산 요청할 내역을 선택해 주세요.");
      return;
    }
    if (!tripId) return;
    const invalidExpense = selectedExpenses.find((expense) => expense.status !== "tentative");
    if (invalidExpense) {
      toast.error("이미 요청중이거나 완료된 지출은 새 요청에 포함할 수 없어요.");
      return;
    }

    const requestRef = doc(collection(db, "trips", tripId, "settlementRequests"));
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/settle?id=${tripId}&request=${requestRef.id}`
        : `/settle?id=${tripId}&request=${requestRef.id}`;

    const preview = buildSettlementPreviewData({
      requestId: requestRef.id,
      tripName: trip?.name ?? "여행",
      members: trip?.members ?? EMPTY_MEMBERS,
      expenses: selectedExpenses,
      settings: settlementSettings,
      settingsByUid: { ...memberSettlementSettings, ...(user ? { [user.uid]: settlementSettings } : {}) },
      pageUrl: shareUrl,
    });
    setSettlementPreview(preview);
    setPreviewOpen(true);
  };

  const createSettlementRequest = async (preview: SettlementPreviewData) => {
    if (!user || !tripId || !trip) throw new Error("정산 요청을 만들 수 있는 여행 정보가 없어요.");
    const selectedIds = selectedExpenses.map((expense) => expense.id);
    if (selectedIds.length === 0) throw new Error("선택된 지출이 없어요.");

    const members = trip.members ?? EMPTY_MEMBERS;
    const requestedByName = members[user.uid] ?? user.displayName ?? "요청자";
    const requestRef = doc(db, "trips", tripId, "settlementRequests", preview.requestId);
    const expenseRefs = selectedIds.map((expenseId) => doc(db, "trips", tripId, "expenses", expenseId));
    const snapshots = buildExpenseSnapshots(selectedExpenses, members);

    await runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (requestSnap.exists()) {
        throw new Error("이미 생성된 정산 요청입니다.");
      }

      const expenseSnaps = await Promise.all(expenseRefs.map((ref) => transaction.get(ref)));
      for (const snap of expenseSnaps) {
        if (!snap.exists()) {
          throw new Error("선택한 지출 중 삭제된 내역이 있어요.");
        }
        const status = snap.data().status;
        if (status !== "tentative") {
          throw new Error("이미 요청중이거나 완료된 지출이 포함되어 있어요.");
        }
      }

      transaction.set(requestRef, {
        tripId,
        title: preview.title,
        status: "requested",
        requestedByUid: user.uid,
        requestedByName,
        requestedAt: serverTimestamp(),
        expenseIds: selectedIds,
        expenseSnapshots: snapshots,
        transfers: preview.transfers,
        totalExpenseAmount: Math.round(preview.total),
        transferTotal: Math.round(preview.transferTotal),
        shareUrl: preview.pageUrl,
        shareMessage: preview.text,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const ref of expenseRefs) {
        transaction.update(ref, {
          status: "requested",
          settlementRequestId: preview.requestId,
          settlementRequestedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  };

  const handleConfirmShareSettlementRequest = async () => {
    if (!settlementPreview) return;
    const { title, text } = settlementPreview;
    let requestCreated = false;
    setSettlementConfirming(true);

    try {
      await createSettlementRequest(settlementPreview);
      requestCreated = true;
      if (
        navigator.share &&
        (!navigator.canShare ||
          navigator.canShare({
            title,
            text,
          }))
      ) {
        await navigator.share({ title, text });
        setPreviewOpen(false);
        setSettlementPreview(null);
        exitSelectionMode();
        router.replace(`/settle?id=${tripId}&request=${settlementPreview.requestId}`);
        return;
      }

      await copyTextToClipboard(text);
      toast.success("정산 요청 메시지를 복사했어요.");
      setPreviewOpen(false);
      setSettlementPreview(null);
      exitSelectionMode();
      router.replace(`/settle?id=${tripId}&request=${settlementPreview.requestId}`);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (!requestCreated) {
        const message = e instanceof Error ? e.message : String(e);
        toast.error(`정산 요청 생성 실패: ${message}`);
        return;
      }
      try {
        await copyTextToClipboard(text);
        toast.success("공유창을 열지 못해서 정산 요청 메시지를 복사했어요.");
        setPreviewOpen(false);
        setSettlementPreview(null);
        exitSelectionMode();
        router.replace(`/settle?id=${tripId}&request=${settlementPreview.requestId}`);
      } catch (copyError: unknown) {
        const message = e instanceof Error ? e.message : copyError instanceof Error ? copyError.message : String(copyError);
        toast.error(`정산 요청 실패: ${message}`);
      }
    } finally {
      setSettlementConfirming(false);
    }
  };

  const canManageSettlementRequest = (request: SettlementRequest | null) => {
    if (!user || !request) return false;
    return isAdminUid(user.uid) || request.requestedByUid === user.uid;
  };

  const handleCompleteSettlementRequest = async (request: SettlementRequest) => {
    if (!user || !tripId || !canManageSettlementRequest(request)) return;
    if (!window.confirm("입금 확인 후 정산완료로 변경할까요?")) return;
    const requestRef = doc(db, "trips", tripId, "settlementRequests", request.id);
    setRequestActionLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const requestSnap = await transaction.get(requestRef);
        if (!requestSnap.exists()) throw new Error("정산 요청을 찾을 수 없어요.");
        if (requestSnap.data().status !== "requested") {
          throw new Error("요청중 상태에서만 완료할 수 있어요.");
        }

        transaction.update(requestRef, {
          status: "completed",
          completedAt: serverTimestamp(),
          completedByUid: user.uid,
          completedByName: trip?.members?.[user.uid] ?? user.displayName ?? "처리자",
          updatedAt: serverTimestamp(),
        });

        for (const expenseId of request.expenseIds) {
          transaction.update(doc(db, "trips", tripId, "expenses", expenseId), {
            status: "confirmed",
            settledAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });
      toast.success("정산완료로 변경했어요.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`정산완료 처리 실패: ${message}`);
    } finally {
      setRequestActionLoading(false);
    }
  };

  const handleCancelSettlementRequest = async (request: SettlementRequest) => {
    if (!user || !tripId || !canManageSettlementRequest(request)) return;
    if (!window.confirm("정산 요청을 취소하고 지출을 미정산으로 되돌릴까요?")) return;
    const requestRef = doc(db, "trips", tripId, "settlementRequests", request.id);
    setRequestActionLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const requestSnap = await transaction.get(requestRef);
        if (!requestSnap.exists()) throw new Error("정산 요청을 찾을 수 없어요.");
        if (requestSnap.data().status !== "requested") {
          throw new Error("요청중 상태에서만 취소할 수 있어요.");
        }

        transaction.update(requestRef, {
          status: "cancelled",
          cancelledAt: serverTimestamp(),
          cancelledByUid: user.uid,
          cancelledByName: trip?.members?.[user.uid] ?? user.displayName ?? "처리자",
          updatedAt: serverTimestamp(),
        });

        for (const expenseId of request.expenseIds) {
          transaction.update(doc(db, "trips", tripId, "expenses", expenseId), {
            status: "tentative",
            settlementRequestId: deleteField(),
            settlementRequestedAt: deleteField(),
            updatedAt: serverTimestamp(),
          });
        }
      });
      toast.success("정산 요청을 취소했어요.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`정산 요청 취소 실패: ${message}`);
    } finally {
      setRequestActionLoading(false);
    }
  };
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col overflow-x-hidden bg-background shadow-sm sm:border-x">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-white/80 backdrop-blur-md p-4 border-b border-outline-variant/30">
        <button
          type="button"
          onClick={() => {
            if (isRequestsTab && tripId) {
              router.push(`/settle?id=${tripId}`);
              return;
            }
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          aria-label="뒤로가기"
          className="p-2 -ml-2 text-primary hover:bg-primary/10 active:scale-95 transition-all rounded-full"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-on-surface text-lg font-bold leading-tight tracking-tight">
          {isRequestsTab ? "정산 요청 관리" : "정산"}
        </h2>
        <button
          type="button"
          aria-label="설정"
          onClick={openSettlementSettings}
          className="p-2 -mr-2 text-primary hover:bg-primary/10 active:scale-95 transition-all rounded-full"
        >
          <span className="material-symbols-outlined">more_vert</span>
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 px-4 pb-32 pt-4 space-y-6">
        {isInitialLoading ? (
          <SettleSkeleton />
        ) : expensesError ? (
          <ErrorState
            onRetry={() => {
              // onSnapshot은 자동 재구독이라 명시 retry는 불가. 페이지 reload로 우회.
              if (typeof window !== "undefined") window.location.reload();
            }}
          />
        ) : (
          <>
            {isRequestsTab ? (
              <SettlementRequestList
                requests={settlementRequests}
                loading={requestsLoading}
                activeRequestId={requestIdParam}
                onOpenRequest={(requestId) => router.push(`/settle?id=${tripId}&tab=requests&request=${requestId}`)}
              />
            ) : (
              <>
                {/* Hero: 총 지출 */}
                <section className="relative overflow-hidden glass-elevated rounded-xl p-8 text-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-tertiary/5 pointer-events-none" />
                  <p className="text-on-surface-variant text-xs font-medium mb-1 tracking-wide uppercase">
                    총 지출
                  </p>
                  <h2 className="text-4xl font-extrabold text-primary tracking-tight mb-3">
                    {formatKrw(total)}
                  </h2>
                  <div className="inline-flex items-center gap-1.5 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
                    <span
                      className="material-symbols-outlined text-sm text-primary"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      trending_up
                    </span>
                    <span className="text-[12px] text-primary font-bold">
                      예산 내 지출 중
                    </span>
                  </div>
                </section>

                {/* Bento 2열: 가장 많이 쓴 곳 / 1인당 정산 금액 */}
                <div className="grid grid-cols-2 gap-4">
                  <TopCategoryCard
                    topCategory={topCategory}
                    amount={topCategory ? byCategory[topCategory] : 0}
                    total={total}
                  />
                  <div className="glass-panel p-4 rounded-xl flex flex-col justify-between h-32">
                    <div className="flex items-center justify-between">
                      <span
                        className="material-symbols-outlined text-tertiary"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        group
                      </span>
                    </div>
                    <div>
                      <p className="text-on-surface-variant text-xs mb-0.5">
                        1인당 정산 금액
                      </p>
                      {/* TODO(Phase 6): 임시 계산값 — 실제 정산 방식 반영 필요 */}
                      <p className="font-bold text-on-surface">{formatKrw(perPerson)}</p>
                    </div>
                  </div>
                </div>

                <SettlementRequestSummary
                  requests={settlementRequests}
                  loading={requestsLoading}
                  onManage={() => router.push(`/settle?id=${tripId}&tab=requests`)}
                  onOpenRequest={(requestId) => router.push(`/settle?id=${tripId}&request=${requestId}`)}
                />

                {/* 지출 내역 헤더 + 정렬 토글 */}
                <div className="flex items-center justify-between pt-2">
                  <h3 className="text-lg font-bold text-on-surface">지출 내역</h3>
                </div>

                {/* 필터 칩 (모두보기 / 미정산 / 정산완료) */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {FILTER_OPTIONS.map((opt) => {
                      const active = filter === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setFilter(opt.key);
                            if (opt.key === "tentative") {
                              closeAllSwipes();
                              setSelectionMode(true);
                            } else {
                              exitSelectionMode();
                            }
                          }}
                          aria-pressed={active}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            active
                              ? "bg-primary text-white border border-primary"
                              : "bg-white/60 border border-outline-variant text-on-surface-variant hover:border-primary/40"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}

                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {filter === "tentative" && selectionMode && filteredExpenses.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={clearSelectedExpenses}
                          className="px-3 py-1.5 rounded-full border border-outline-variant bg-white/60 text-xs font-semibold text-on-surface-variant"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={handleShareSettlementRequest}
                          disabled={selectedExpenseIds.size === 0}
                          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-primary/20 disabled:cursor-not-allowed disabled:bg-primary/35"
                        >
                          <Check className="h-3.5 w-3.5" />
                          정산요청
                        </button>
                      </>
                    )}
                    <div
                      className="relative"
                      onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                          setListModeMenuOpen(false);
                        }
                      }}
                    >
                      <button
                        type="button"
                        aria-label="목록 표시 방식"
                        aria-expanded={listModeMenuOpen}
                        onClick={() => setListModeMenuOpen((open) => !open)}
                        className="inline-flex h-8 w-8 items-center justify-center text-on-surface-variant transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <span className="material-symbols-outlined text-[20px]">tune</span>
                      </button>
                      {listModeMenuOpen && (
                        <div className="absolute right-0 z-20 mt-2 w-32 overflow-hidden rounded-xl border border-outline-variant bg-white shadow-lg shadow-black/10">
                          {LIST_MODE_OPTIONS.map((option) => {
                            const active = listMode === option.key;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() => {
                                  setListMode(option.key);
                                  setListModeMenuOpen(false);
                                  if (filter === "tentative") {
                                    clearSelectedExpenses();
                                    setSelectionMode(true);
                                  } else {
                                    exitSelectionMode();
                                  }
                                }}
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                                  active
                                    ? "bg-primary/10 font-semibold text-primary"
                                    : "text-on-surface-variant hover:bg-surface-container"
                                }`}
                              >
                                <span>{option.label}</span>
                                {active && <Check className="h-3.5 w-3.5" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* 리스트 */}
                {expenses.length === 0 ? (
                  <EmptyState />
                ) : filteredExpenses.length === 0 ? (
                  <FilterEmptyState />
                ) : (
                  <div className="space-y-3">
                    {filteredExpenses.map((exp) => {
                      const canManage = canManageExpense(exp);
                      const card = (
                        <ExpenseCard
                          expense={exp}
                          members={trip?.members ?? EMPTY_MEMBERS}
                          memberPhotos={memberPhotos}
                          canManage={canManage}
                          selectionMode={selectionMode}
                          selected={selectedExpenseIds.has(exp.id)}
                          onSelectToggle={() => toggleExpenseSelection(exp.id)}
                          onMenuClick={() => {
                            closeAllSwipes(exp.id);
                            swipeRefs.current.get(exp.id)?.toggle();
                          }}
                        />
                      );

                      if (!canManage || selectionMode) {
                        return <div key={exp.id}>{card}</div>;
                      }

                      return (
                        <SwipeableItem
                          key={exp.id}
                          actionWidth={120}
                          ref={(handle) => {
                            if (handle) {
                              swipeRefs.current.set(exp.id, handle);
                            } else {
                              swipeRefs.current.delete(exp.id);
                            }
                          }}
                          onOpenChange={(open) => {
                            if (open) closeAllSwipes(exp.id);
                          }}
                          actions={
                            <div className="flex h-full w-full items-center justify-center gap-1.5 pl-2 pr-1">
                              <button
                                type="button"
                                aria-label="수정"
                                onClick={() => {
                                  swipeRefs.current.get(exp.id)?.close();
                                  setEditingExpense(exp);
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/15 text-slate-700 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-white/25 active:scale-95"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                aria-label="삭제"
                                onClick={() => {
                                  swipeRefs.current.get(exp.id)?.close();
                                  handleDeleteExpense(exp);
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/15 text-slate-700 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-rose-500/40 hover:text-white active:scale-95"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          }
                        >
                          {card}
                        </SwipeableItem>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* FAB */}
      {!isRequestsTab && (
      <div className="fixed bottom-24 left-1/2 z-30 w-full max-w-3xl -translate-x-1/2 px-5 pointer-events-none">
        <button
          type="button"
          aria-label="지출 추가"
          onClick={() => {
            if (!trip || !tripId) {
              toast.error("여행 정보를 불러오는 중이에요.");
              return;
            }
            setAddOpen(true);
          }}
          className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-transform active:scale-90 pointer-events-auto"
        >
          <span
            className="material-symbols-outlined text-[28px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            add
          </span>
        </button>
      </div>
      )}

      {/* 추가 다이얼로그 (Phase 3) */}
      {trip && tripId && (
        <AddExpenseDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          tripId={tripId}
          members={trip.members ?? EMPTY_MEMBERS}
        />
      )}

      {trip && tripId && editingExpense && (
        <AddExpenseDialog
          open={!!editingExpense}
          onOpenChange={(open) => {
            if (!open) setEditingExpense(null);
          }}
          tripId={tripId}
          members={trip.members ?? EMPTY_MEMBERS}
          editingExpense={editingExpense}
        />
      )}

      <SettlementSettingsDialog
        open={settingsOpen}
        settings={settingsDraft}
        saving={settingsSaving}
        onOpenChange={setSettingsOpen}
        onChange={setSettingsDraft}
        onSave={handleSaveSettlementSettings}
      />

      <SettlementRequestDetailDialog
        open={!!requestIdParam}
        request={selectedSettlementRequest}
        loading={requestsLoading}
        canManage={canManageSettlementRequest(selectedSettlementRequest)}
        actionLoading={requestActionLoading}
        onOpenChange={(open) => {
          if (!open && tripId) router.push(isRequestsTab ? `/settle?id=${tripId}&tab=requests` : `/settle?id=${tripId}`);
        }}
        onComplete={() => {
          if (selectedSettlementRequest) handleCompleteSettlementRequest(selectedSettlementRequest);
        }}
        onCancel={() => {
          if (selectedSettlementRequest) handleCancelSettlementRequest(selectedSettlementRequest);
        }}
      />

      <SettlementPreviewDialog
        open={previewOpen}
        preview={settlementPreview}
        confirming={settlementConfirming}
        onOpenChange={setPreviewOpen}
        onConfirm={handleConfirmShareSettlementRequest}
      />

      <BottomNav />
    </div>
  );
}

// ---------- 하위 프레젠테이션 컴포넌트 ----------

function SettlementRequestDetailDialog({
  open,
  request,
  loading,
  canManage,
  actionLoading,
  onOpenChange,
  onComplete,
  onCancel,
}: {
  open: boolean;
  request: SettlementRequest | null;
  loading: boolean;
  canManage: boolean;
  actionLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-sm overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>정산 요청 상세</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="rounded-xl bg-white/70 px-3 py-6 text-center text-sm text-on-surface-variant">
            정산 요청을 불러오는 중...
          </div>
        ) : request ? (
          <SettlementRequestDetailView
            request={request}
            canManage={canManage}
            actionLoading={actionLoading}
            onComplete={onComplete}
            onCancel={onCancel}
          />
        ) : (
          <div className="rounded-xl bg-white/70 px-3 py-6 text-center text-sm text-on-surface-variant">
            정산 요청을 찾을 수 없어요.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettlementRequestSummary({
  requests,
  loading,
  onManage,
  onOpenRequest,
}: {
  requests: SettlementRequest[];
  loading: boolean;
  onManage: () => void;
  onOpenRequest: (requestId: string) => void;
}) {
  const requestedCount = requests.filter((request) => request.status === "requested").length;
  const completedCount = requests.filter((request) => request.status === "completed").length;
  const cancelledCount = requests.filter((request) => request.status === "cancelled").length;
  const recentRequest =
    requests.find((request) => request.status === "requested") ??
    requests.find((request) => request.status === "completed") ??
    null;

  return (
    <section className="glass-panel rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-on-surface">정산 요청</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            요청중 {requestedCount}건 · 완료 {completedCount}건
            {cancelledCount > 0 ? ` · 취소 ${cancelledCount}건` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          관리하기 &gt;
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg bg-white/60 px-3 py-3 text-sm text-on-surface-variant">
          정산 요청을 불러오는 중...
        </div>
      ) : recentRequest ? (
        <button
          type="button"
          onClick={() => onOpenRequest(recentRequest.id)}
          className="w-full rounded-lg border border-outline-variant/60 bg-white/60 px-3 py-3 text-left transition-colors hover:border-primary/40"
        >
          <p className="text-xs font-semibold text-primary">
            최근 {REQUEST_STATUS_LABEL[recentRequest.status]}
          </p>
          <p className="mt-1 truncate text-sm font-bold text-on-surface">{recentRequest.title}</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {recentRequest.requestedByName} 요청 · 지출 {recentRequest.expenseIds.length}건 · 송금 {formatKrw(recentRequest.transferTotal)}
          </p>
        </button>
      ) : (
        <div className="rounded-lg bg-white/60 px-3 py-3 text-sm text-on-surface-variant">
          아직 정산 요청이 없어요.
        </div>
      )}
    </section>
  );
}

function SettlementRequestDetailView({
  request,
  canManage,
  actionLoading,
  onComplete,
  onCancel,
}: {
  request: SettlementRequest;
  canManage: boolean;
  actionLoading: boolean;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const receiverAccounts = Array.from(new Map(request.transfers.map((transfer) => [transfer.toUid, transfer])).values());
  const handleCopyShareMessage = async () => {
    if (!request.shareMessage) {
      toast.error("저장된 공유 메시지가 없어요.");
      return;
    }
    try {
      await copyTextToClipboard(request.shareMessage);
      toast.success("정산 요청 메시지를 복사했어요.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`복사 실패: ${message}`);
    }
  };

  return (
    <div className="space-y-5 py-2">
      <section className="rounded-xl border border-primary/15 bg-primary/5 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">{REQUEST_STATUS_LABEL[request.status]}</p>
            <h3 className="mt-1 truncate text-sm font-bold text-on-surface">{request.title}</h3>
            <p className="mt-1 text-xs text-on-surface-variant">
              {request.requestedByName} 요청 · 총 지출 ({request.expenseIds.length}건)
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              요청일 {formatRequestDate(request.requestedAt)}
              {request.status === "completed" ? ` · 완료일 ${formatRequestDate(request.completedAt)}` : ""}
              {request.status === "cancelled" ? ` · 취소일 ${formatRequestDate(request.cancelledAt)}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-base font-bold text-on-surface">{formatKrw(request.totalExpenseAmount)}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-bold text-on-surface">📌 지출 내역</h4>
        {request.expenseSnapshots.map((expense, idx) => (
          <article key={expense.expenseId} className="rounded-xl border border-outline-variant/60 bg-white/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-sm font-semibold leading-snug text-on-surface">
                {idx + 1}. {expense.title}
              </p>
              <p className="shrink-0 text-sm font-bold text-on-surface">{formatKrw(expense.amount)}</p>
            </div>
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold text-on-surface-variant">정산 인원</p>
              <div className="flex flex-wrap gap-1.5">
                {expense.participantNames.length > 1 ? (
                  expense.participantNames.map((name, nameIdx) => (
                    <span
                      key={`${expense.expenseId}-${name}-${nameIdx}`}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        expense.participantUids[nameIdx] === expense.payerUid
                          ? "bg-primary/10 font-semibold text-primary"
                          : "border border-outline-variant/70 bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      {name}
                    </span>
                  ))
                ) : (
                  <span className="inline-flex rounded-full border border-outline-variant/70 bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant">
                    정산 없음
                  </span>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-2 rounded-xl border border-outline-variant/60 bg-white/70 p-3">
        <h4 className="text-sm font-bold text-on-surface">💸 상계 후 보낼 금액</h4>
        <p className="text-xs leading-relaxed text-on-surface-variant">
          서로 주고받을 금액을 상계한 뒤, 실제로 송금할 금액입니다.
        </p>
        <div className="space-y-1.5">
          {request.transfers.length > 0 ? (
            request.transfers.map((transfer, idx) => (
              <div key={`${transfer.fromUid}-${transfer.toUid}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-on-surface">
                  {transfer.fromName} <span className="text-on-surface-variant">→</span> {transfer.toName}
                </span>
                <span className="shrink-0 font-bold text-primary">{formatKrw(transfer.amount)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-on-surface-variant">송금할 금액이 없어요.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant/60 bg-white/70 p-3">
        <h4 className="text-sm font-bold text-on-surface">🏦 송금 계좌</h4>
        <div className="mt-1 space-y-1">
          {receiverAccounts.length > 0 ? (
            receiverAccounts.map((transfer) => (
              <p key={transfer.toUid} className="text-sm leading-relaxed text-on-surface-variant">
                {transfer.toName}: {getSettlementAccountSnapshotText(transfer.toAccount)}
              </p>
            ))
          ) : (
            <p className="text-sm leading-relaxed text-on-surface-variant">정산 대상 계좌가 없어요.</p>
          )}
        </div>
      </section>

      {request.shareMessage && (
        <Button type="button" variant="outline" className="w-full" onClick={handleCopyShareMessage}>
          공유 메시지 다시 복사
        </Button>
      )}

      {canManage && request.status === "requested" && (
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={actionLoading}>
            요청 취소
          </Button>
          <Button type="button" className="flex-1" onClick={onComplete} disabled={actionLoading}>
            정산완료 처리
          </Button>
        </div>
      )}
    </div>
  );
}

function SettlementRequestList({
  requests,
  loading,
  activeRequestId,
  onOpenRequest,
}: {
  requests: SettlementRequest[];
  loading: boolean;
  activeRequestId: string | null;
  onOpenRequest: (requestId: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<SettlementRequestFilter>("all");
  const visibleRequests =
    statusFilter === "all"
      ? requests
      : requests.filter((request) => request.status === statusFilter);

  return (
    <section className="space-y-3">
      <div className="flex gap-2">
        {REQUEST_FILTER_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setStatusFilter(option.key)}
            aria-pressed={statusFilter === option.key}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === option.key
                ? "border border-primary bg-primary text-white"
                : "border border-outline-variant bg-white/60 text-on-surface-variant hover:border-primary/40"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="glass-panel rounded-xl p-4 text-sm text-on-surface-variant">정산 요청을 불러오는 중...</div>
      ) : visibleRequests.length === 0 ? (
        <div className="glass-panel rounded-xl p-4 text-sm text-on-surface-variant">해당 상태의 정산 요청이 없어요.</div>
      ) : (
        <div className="space-y-2">
          {visibleRequests.map((request) => (
            <button
              key={request.id}
              type="button"
              onClick={() => onOpenRequest(request.id)}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                activeRequestId === request.id
                  ? "border-primary bg-primary/5"
                  : "border-outline-variant/60 bg-white/60 hover:border-primary/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{request.title}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {request.requestedByName} 요청 · 지출 {request.expenseIds.length}건 · 송금 {formatKrw(request.transferTotal)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-on-surface-variant/80">
                    요청일 {formatRequestDate(request.requestedAt)}
                    {request.status === "completed" ? ` · 완료일 ${formatRequestDate(request.completedAt)}` : ""}
                    {request.status === "cancelled" ? ` · 취소일 ${formatRequestDate(request.cancelledAt)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {REQUEST_STATUS_LABEL[request.status]}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function SettlementSettingsDialog({
  open,
  settings,
  saving,
  onOpenChange,
  onChange,
  onSave,
}: {
  open: boolean;
  settings: SettlementSettings;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (settings: SettlementSettings) => void;
  onSave: () => void;
}) {
  const update = (key: keyof SettlementSettings, value: string) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle>정산 설정</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-on-surface">내 정산 계좌</label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={settings.settlementAccountBank}
                onChange={(e) => update("settlementAccountBank", e.target.value)}
                placeholder="은행"
              />
              <Input
                value={settings.settlementAccountHolder}
                onChange={(e) => update("settlementAccountHolder", e.target.value)}
                placeholder="예금주"
              />
            </div>
            <Input
              value={settings.settlementAccountNumber}
              onChange={(e) => update("settlementAccountNumber", e.target.value)}
              placeholder="계좌번호"
            />
          </div>


          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="button" className="flex-1" onClick={onSave} disabled={saving}>
              저장
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettlementPreviewDialog({
  open,
  preview,
  confirming,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  preview: SettlementPreviewData | null;
  confirming: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-sm overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>정산 요청 미리보기</DialogTitle>
        </DialogHeader>
        {preview && (
          <div className="space-y-5 py-2">
            <SettlementSharePreview preview={preview} />

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={confirming}>
                취소
              </Button>
              <Button type="button" className="flex-1 gap-1.5" onClick={onConfirm} disabled={confirming}>
                <Send className="h-4 w-4" />
                {confirming ? "처리중" : "확인"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettlementSharePreview({ preview }: { preview: SettlementPreviewData }) {
  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-primary/15 bg-primary/5 p-3.5">
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">🧾 정산 대상</p>
            <p className="mt-1 truncate text-sm font-bold text-on-surface">{preview.tripName}</p>
          </div>
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <p className="text-[11px] text-on-surface-variant">총 지출 ({preview.expenseCount}건)</p>
            <p className="mt-0.5 text-base font-bold text-on-surface">{formatKrw(preview.total)}</p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-bold text-on-surface">📌 지출 내역</h4>
        {preview.expenses.length > 0 ? (
          preview.expenses.map((expense) => (
            <article key={expense.id} className="rounded-xl border border-outline-variant/60 bg-white/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-on-surface">
                    {expense.title}
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm font-bold text-on-surface">
                  {formatKrw(expense.amount)}
                </p>
              </div>
              <div className="mt-3">
                {expense.hasSharedSettlement ? (
                  <>
                    <p className="mb-1.5 text-[11px] font-semibold text-on-surface-variant">정산 인원</p>
                    <div className="flex flex-wrap gap-1.5">
                      {expense.participants.length > 0 ? (
                        expense.participants.map((participant, idx) => (
                          <span
                            key={`${expense.id}-${participant.name}-${idx}`}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              participant.isPayer
                                ? "bg-primary/10 font-semibold text-primary"
                                : "border border-outline-variant/70 bg-surface-container text-on-surface-variant"
                            }`}
                          >
                            {participant.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-on-surface-variant">정산 멤버 없음</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {expense.participants.map((participant, idx) => (
                      <span
                        key={`${expense.id}-${participant.name}-${idx}`}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          participant.isPayer
                            ? "bg-primary/10 font-semibold text-primary"
                            : "border border-outline-variant/70 bg-surface-container text-on-surface-variant"
                        }`}
                      >
                        {participant.name}
                      </span>
                    ))}
                    <span className="inline-flex rounded-full border border-outline-variant/70 bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant">
                      정산 없음
                    </span>
                  </div>
                )}
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-xl bg-white/70 px-3 py-2 text-sm text-on-surface-variant">정산 대상 지출이 없어요.</p>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-outline-variant/60 bg-white/70 p-3">
        <h4 className="text-sm font-bold text-on-surface">💸 상계 후 보낼 금액</h4>
        <p className="text-xs leading-relaxed text-on-surface-variant">서로 주고받을 금액을 상계한 뒤, 실제로 송금할 금액입니다.</p>
        <div className="space-y-1.5">
          {preview.transfers.length > 0 ? (
            preview.transfers.map((transfer, idx) => (
              <div key={`${transfer.fromName}-${transfer.toName}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-on-surface">
                  {transfer.fromName} <span className="text-on-surface-variant">→</span> {transfer.toName}
                </span>
                <span className="shrink-0 font-bold text-primary">{formatKrw(transfer.amount)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-on-surface-variant">정산 대상이 없어요.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant/60 bg-white/70 p-3">
        <h4 className="text-sm font-bold text-on-surface">🏦 송금 계좌</h4>
        <div className="mt-1 space-y-1">
          {preview.accountLines.length > 0 ? (
            preview.accountLines.map((line, idx) => (
              <p key={`${line}-${idx}`} className="text-sm leading-relaxed text-on-surface-variant">
                {line}
              </p>
            ))
          ) : (
            <p className="text-sm leading-relaxed text-on-surface-variant">정산 대상 계좌가 없어요.</p>
          )}
        </div>
      </section>

      {preview.pageUrl && (
        <section className="rounded-xl border border-outline-variant/60 bg-white/70 p-3">
          <h4 className="text-sm font-bold text-on-surface">🔗 정산 페이지</h4>
          <a
            href={preview.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block break-all text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            {preview.pageUrl}
          </a>
        </section>
      )}
    </div>
  );
}

function ExpenseCard({
  expense,
  members,
  memberPhotos,
  canManage = false,
  selectionMode = false,
  selected = false,
  onSelectToggle,
  onMenuClick,
}: {
  expense: Expense;
  members: Record<string, string>;
  memberPhotos: Record<string, string | null>;
  canManage?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
  onMenuClick?: () => void;
}) {
  const meta = CATEGORY_META[expense.category];
  const isConfirmed = expense.status === "confirmed";
  const isRequested = expense.status === "requested";
  const krw = effectiveKrw(expense);
  const participantEntries = (
    Object.keys(expense.participants ?? {}).length > 0
      ? Object.keys(expense.participants ?? {}).map((uid) => [uid, members[uid] ?? ""] as const)
      : Object.entries(members)
  ).filter(([, name]) => !!name);
  const visibleParticipants = participantEntries.slice(0, 4);
  const hiddenParticipantCount = Math.max(0, participantEntries.length - visibleParticipants.length);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (selectionMode) onSelectToggle?.();
      }}
      className={`glass-panel p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-all active:scale-[0.99] ${
        selectionMode && selected ? "border-primary/50 bg-primary/5" : ""
      }`}
    >
      <div
        className={`w-12 h-12 rounded-lg flex items-center justify-center border ${meta.iconBoxClass}`}
      >
        <span className="material-symbols-outlined">{meta.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-on-surface font-bold text-base truncate">
          {expense.description || meta.label}
        </h4>
        <p className="text-on-surface-variant text-xs mt-0.5">
          {expense.paidBy ? `${expense.paidBy} 결제 · ` : ""}
          {formatPaidDate(expense.paidAt)}
        </p>
        {participantEntries.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {visibleParticipants.map(([uid, name], idx) => {
                const photo = memberPhotos[uid];
                const fallbackBg =
                  idx === 0
                    ? "bg-primary/20 text-primary"
                    : idx === 1
                    ? "bg-tertiary/20 text-tertiary"
                    : "bg-slate-200 text-slate-600";
                return (
                  <Avatar key={uid} size="sm" className="h-6 w-6 border-2 border-white">
                    {photo ? <AvatarImage src={photo} className="object-cover" /> : null}
                    <AvatarFallback className={`text-[10px] font-medium ${fallbackBg}`}>
                      {String(name).charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                );
              })}
              {hiddenParticipantCount > 0 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-medium text-slate-600">
                  +{hiddenParticipantCount}
                </div>
              )}
            </div>
            <span className="text-[11px] text-on-surface-variant">
              {participantEntries.length}명 정산
            </span>
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-on-surface font-bold">{formatKrw(krw)}</p>
        <p
          className={`text-[10px] font-semibold mt-0.5 ${
            isConfirmed ? "text-tertiary" : isRequested ? "text-amber-600" : "text-primary"
          }`}
        >
          {isConfirmed ? "정산 완료" : isRequested ? "요청중" : "정산 예정"}
        </p>
      </div>
      {selectionMode ? (
        <button
          type="button"
          aria-label={selected ? "선택 해제" : "정산 요청 선택"}
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            onSelectToggle?.();
          }}
          className={`shrink-0 rounded-full p-1 transition-colors ${
            selected ? "text-primary" : "text-primary/70 hover:text-primary"
          }`}
        >
          {selected ? (
            <CircleCheck className="h-6 w-6 fill-primary/10" strokeWidth={2.4} />
          ) : (
            <Circle className="h-6 w-6" strokeWidth={2.2} />
          )}
        </button>
      ) : canManage ? (
        <button
          type="button"
          aria-label="수정/삭제 메뉴"
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick?.();
          }}
          className="shrink-0 p-1 -mr-1 text-on-surface-variant hover:text-primary transition-colors rounded-full"
        >
          <span className="material-symbols-outlined text-[20px]">
            more_vert
          </span>
        </button>
      ) : null}
    </div>
  );
}

function TopCategoryCard({
  topCategory,
  amount,
  total,
}: {
  topCategory: ExpenseCategory | null;
  amount: number;
  total: number;
}) {
  const hasData = topCategory !== null && total > 0;
  const meta = hasData ? CATEGORY_META[topCategory] : CATEGORY_META.etc;
  const percent = hasData ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="glass-panel p-4 rounded-xl flex flex-col justify-between h-32">
      <span
        className={`material-symbols-outlined ${
          hasData ? "text-primary" : "text-on-surface-variant/60"
        }`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {meta.icon}
      </span>
      <div>
        <p className="text-on-surface-variant text-xs mb-0.5">가장 많이 쓴 곳</p>
        <p className="font-bold text-on-surface">
          {hasData ? `${meta.label} (${percent}%)` : "기록 없음"}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass-panel rounded-xl p-8 text-center">
      <span
        className="material-symbols-outlined text-4xl text-primary/70 mb-2"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        receipt_long
      </span>
      <p className="text-base font-bold text-on-surface mb-1">
        아직 정산 내역이 없어요
      </p>
      <p className="text-sm text-on-surface-variant">
        오른쪽 아래 + 버튼으로 첫 지출을 추가해보세요
      </p>
    </div>
  );
}

function FilterEmptyState() {
  return (
    <div className="glass-panel rounded-xl p-8 text-center">
      <span className="material-symbols-outlined text-3xl text-on-surface-variant/50 mb-1">
        filter_list_off
      </span>
      <p className="text-sm text-on-surface-variant">해당하는 항목이 없어요</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="glass-panel rounded-xl p-8 text-center">
      <span className="material-symbols-outlined text-3xl text-rose-500/70 mb-1">
        error_outline
      </span>
      <p className="text-sm text-on-surface mb-3">
        지출 내역을 불러오지 못했어요
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-full bg-primary text-white text-xs font-semibold"
      >
        다시 시도
      </button>
    </div>
  );
}

function SettleSkeleton() {
  return (
    <>
      <div className="h-40 rounded-xl bg-white/40 animate-pulse" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-32 rounded-xl bg-white/40 animate-pulse" />
        <div className="h-32 rounded-xl bg-white/40 animate-pulse" />
      </div>
      <div className="space-y-3">
        <div className="h-20 rounded-xl bg-white/40 animate-pulse" />
        <div className="h-20 rounded-xl bg-white/40 animate-pulse" />
        <div className="h-20 rounded-xl bg-white/40 animate-pulse" />
      </div>
    </>
  );
}

// ---------- Suspense 래퍼 ----------

export default function SettlePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
          로딩중...
        </div>
      }
    >
      <SettleContent />
    </Suspense>
  );
}
    
