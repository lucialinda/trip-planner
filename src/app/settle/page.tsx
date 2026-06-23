"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addDoc,
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
  updateDoc,
  type FirestoreError,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { AddExpenseDialog } from "@/components/AddExpenseDialog";
import { ProfileDialog } from "@/components/ProfileDialog";
import { SwipeableItem, type SwipeableItemHandle } from "@/components/ui/SwipeableItem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CATEGORY_META,
  type Expense,
  type ExpenseCategory,
  effectiveKrw,
  formatKrw,
  fromDoc,
  getParticipantUids,
  isEstimated,
  isFinalized,
  isForeignCurrency,
} from "@/lib/expenses";
import { isAdminUid } from "@/lib/admin";
import { Check, Circle, CircleCheck, Edit2, MoreHorizontal, Share2, Trash2 } from "lucide-react";

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

interface SettlementAdjustmentSnapshot {
  adjustmentId: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  amount: number;
  memo?: string;
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
  adjustments: SettlementAdjustmentSnapshot[];
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
  adjustmentIds: string[];
  adjustmentSnapshots: SettlementAdjustmentSnapshot[];
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
const REQUEST_STATUS_BADGE_CLASS: Record<SettlementRequestStatus, string> = {
  requested: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
};
type SettlementRequestFilter = "all" | SettlementRequestStatus;
const REQUEST_FILTER_OPTIONS: { key: SettlementRequestFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "requested", label: "요청" },
  { key: "completed", label: "완료" },
  { key: "cancelled", label: "취소" },
];
const CATEGORY_ORDER = Object.keys(CATEGORY_META) as ExpenseCategory[];
const CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  food: "🍽️",
  cafe: "☕",
  transit: "🚇",
  lodging: "🛏️",
  activity: "🎟️",
  shopping: "🛍️",
  etc: "📦",
};
const CATEGORY_REPORT_BAR_CLASS: Record<ExpenseCategory, string> = {
  food: "bg-primary",
  cafe: "bg-amber-500",
  transit: "bg-slate-500",
  lodging: "bg-tertiary",
  activity: "bg-rose-500",
  shopping: "bg-emerald-500",
  etc: "bg-on-surface-variant",
};

type CategoryReportRow = {
  category: ExpenseCategory;
  meta: (typeof CATEGORY_META)[ExpenseCategory];
  items: Expense[];
  amount: number;
  percent: number;
  barClass: string;
};

type ProductionSettlementMemberRow = {
  uid: string;
  name: string;
  paidTotal: number;
  shareTotal: number;
  balance: number;
  expenseCount: number;
  estimatedCount: number;
  finalizedCount: number;
};

type ProductionSettlementReport = {
  total: number;
  expenseCount: number;
  estimatedCount: number;
  finalizedCount: number;
  krwCount: number;
  tentativeCount: number;
  requestedCount: number;
  confirmedCount: number;
  memberRows: ProductionSettlementMemberRow[];
  transfers: SettlementTransfer[];
};

type ManualOffset = {
  id: string;
  fromUid: string;
  toUid: string;
  amount: number;
  status: "active" | "applied" | "voided";
  memo?: string;
  createdBy: string;
  appliedToSettlementRequestId: string | null;
};

function isFirestorePermissionDenied(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "permission-denied";
}

function settlementAdjustmentErrorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (isFirestorePermissionDenied(e)) {
    return "권한이 거부됐어요. 로컬에서는 Firestore emulator를 재시작해서 최신 firestore.rules를 반영해야 합니다.";
  }
  return message;
}

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

function formatSignedKrw(amount: number): string {
  if (Math.abs(amount) <= 1) return formatKrw(0);
  return `${amount > 0 ? "+" : "-"}${formatKrw(Math.abs(amount))}`;
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

function getMemberName(members: Record<string, string>, uid: string, fallback = "이름 없음"): string {
  return members[uid] ?? fallback;
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
  const transferLines = data.transfers.map(
    (transfer) => `- ${transfer.fromName} → ${transfer.toName}: ${formatKrw(transfer.amount)}`
  );

  return [
    "🧾 정산 대상",
    `지출 ${data.expenseCount}건${data.adjustments.length > 0 ? ` · 추가 조정 ${data.adjustments.length}건` : ""}`,
    `총 지출 ${formatKrw(data.total)}`,
    "\n💸 최종 송금 금액",
    transferLines.join("\n") || "- 정산 대상 없음",
    "\n🏦 송금 계좌",
    data.accountLines.map((line) => `- ${line}`).join("\n"),
    data.pageUrl ? "\n🔗 정산 페이지" : "",
    data.pageUrl,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSettlementRequestShareMessage(request: SettlementRequest, pageUrl: string): string {
  const transferLines = request.transfers.map(
    (transfer) => `- ${transfer.fromName} → ${transfer.toName}: ${formatKrw(transfer.amount)}`
  );
  const receiverAccounts = Array.from(new Map(request.transfers.map((transfer) => [transfer.toUid, transfer])).values());
  const accountLines = receiverAccounts.map(
    (transfer) => `- ${transfer.toName}: ${getSettlementAccountSnapshotText(transfer.toAccount)}`
  );

  return [
    "🧾 정산 대상",
    `지출 ${request.expenseIds.length}건${request.adjustmentIds.length > 0 ? ` · 추가 조정 ${request.adjustmentIds.length}건` : ""}`,
    `총 지출 ${formatKrw(request.totalExpenseAmount)}`,
    "\n💸 최종 송금 금액",
    transferLines.join("\n") || "- 정산 대상 없음",
    "\n🏦 송금 계좌",
    accountLines.join("\n") || "- 계좌 미등록",
    pageUrl ? "\n🔗 정산 페이지" : "",
    pageUrl,
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
    adjustmentIds: Array.isArray(data.adjustmentIds) ? (data.adjustmentIds as string[]) : [],
    adjustmentSnapshots: Array.isArray(data.adjustmentSnapshots)
      ? (data.adjustmentSnapshots as SettlementAdjustmentSnapshot[])
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

function parseSettlementAdjustmentDoc(id: string, data: Record<string, unknown>): ManualOffset {
  return {
    id,
    fromUid: (data.fromMemberId as string) ?? "",
    toUid: (data.toMemberId as string) ?? "",
    amount: typeof data.amount === "number" ? data.amount : 0,
    status: (data.status as ManualOffset["status"]) ?? "active",
    memo: data.memo as string | undefined,
    createdBy: (data.createdBy as string) ?? "",
    appliedToSettlementRequestId:
      typeof data.appliedToSettlementRequestId === "string"
        ? data.appliedToSettlementRequestId
        : null,
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

    balances.set(expense.paidByUid, (balances.get(expense.paidByUid) ?? 0) + amount);

    const shares = calculateRoundedShares(amount, participantUids, expense.paidByUid);
    for (const [uid, share] of shares) {
      balances.set(uid, (balances.get(uid) ?? 0) - share);
    }
  }

  return { balances, memberNames };
}

function applyManualOffsetsToBalances(
  base: SettlementBalanceResult,
  adjustments: ManualOffset[],
  members: Record<string, string>
): SettlementBalanceResult {
  const balances = new Map(base.balances);
  const memberNames = new Map(base.memberNames);

  for (const adjustment of adjustments) {
    memberNames.set(adjustment.fromUid, members[adjustment.fromUid] ?? memberNames.get(adjustment.fromUid) ?? "이름 없음");
    memberNames.set(adjustment.toUid, members[adjustment.toUid] ?? memberNames.get(adjustment.toUid) ?? "이름 없음");
    balances.set(adjustment.fromUid, (balances.get(adjustment.fromUid) ?? 0) - adjustment.amount);
    balances.set(adjustment.toUid, (balances.get(adjustment.toUid) ?? 0) + adjustment.amount);
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

function buildProductionSettlementReport(
  expenses: Expense[],
  members: Record<string, string>
): ProductionSettlementReport {
  const memberUids = Object.keys(members);
  const rows = new Map<string, ProductionSettlementMemberRow>();

  const ensureRow = (uid: string, fallbackName?: string) => {
    const existing = rows.get(uid);
    if (existing) return existing;
    const row: ProductionSettlementMemberRow = {
      uid,
      name: members[uid] ?? fallbackName ?? "이름 없음",
      paidTotal: 0,
      shareTotal: 0,
      balance: 0,
      expenseCount: 0,
      estimatedCount: 0,
      finalizedCount: 0,
    };
    rows.set(uid, row);
    return row;
  };

  for (const uid of memberUids) {
    ensureRow(uid);
  }

  let total = 0;
  let estimatedCount = 0;
  let finalizedCount = 0;
  let krwCount = 0;
  let tentativeCount = 0;
  let requestedCount = 0;
  let confirmedCount = 0;

  for (const expense of expenses) {
    const amount = Math.round(effectiveKrw(expense));
    total += amount;

    if (isEstimated(expense)) estimatedCount += 1;
    if (isFinalized(expense)) finalizedCount += 1;
    if (!isForeignCurrency(expense)) krwCount += 1;
    if (expense.status === "tentative") tentativeCount += 1;
    if (expense.status === "requested") requestedCount += 1;
    if (expense.status === "confirmed") confirmedCount += 1;

    if (expense.paidByUid) {
      const payerRow = ensureRow(expense.paidByUid, expense.paidBy || "결제자");
      payerRow.paidTotal += amount;
      payerRow.expenseCount += 1;
      if (isEstimated(expense)) payerRow.estimatedCount += 1;
      if (isFinalized(expense)) payerRow.finalizedCount += 1;
    }

    const participantUids = getParticipantUids(expense, memberUids);
    if (participantUids.length === 0 || !expense.paidByUid) continue;

    const shares = calculateRoundedShares(amount, participantUids, expense.paidByUid);
    for (const [uid, share] of shares) {
      ensureRow(uid).shareTotal += share;
    }
  }

  const balances = new Map<string, number>();
  const memberNames = new Map<string, string>();
  for (const row of rows.values()) {
    row.balance = row.paidTotal - row.shareTotal;
    balances.set(row.uid, row.balance);
    memberNames.set(row.uid, row.name);
  }

  return {
    total,
    expenseCount: expenses.length,
    estimatedCount,
    finalizedCount,
    krwCount,
    tentativeCount,
    requestedCount,
    confirmedCount,
    memberRows: Array.from(rows.values()).sort((a, b) => b.balance - a.balance),
    transfers: buildOptimizedTransfers({ balances, memberNames }),
  };
}

function payerFirstUids(participantUids: string[], payerUid: string): string[] {
  return [...participantUids].sort((a, b) => {
    if (a === payerUid) return -1;
    if (b === payerUid) return 1;
    return 0;
  });
}

function buildSettlementPreviewData({
  requestId,
  tripName,
  members,
  expenses,
  adjustments,
  settings,
  settingsByUid,
  pageUrl,
}: {
  requestId: string;
  tripName: string;
  members: Record<string, string>;
  expenses: Expense[];
  adjustments: ManualOffset[];
  settings: SettlementSettings;
  settingsByUid: Record<string, SettlementSettings>;
  pageUrl: string;
}): SettlementPreviewData {
  const memberUids = Object.keys(members);
  const total = expenses.reduce((sum, expense) => sum + effectiveKrw(expense), 0);
  const baseTransfers = buildOptimizedTransfers(
    applyManualOffsetsToBalances(calculateNetBalances(expenses, members), adjustments, members)
  );
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
  const adjustmentSnapshots = adjustments.map((adjustment) => ({
    adjustmentId: adjustment.id,
    fromUid: adjustment.fromUid,
    fromName: getMemberName(members, adjustment.fromUid),
    toUid: adjustment.toUid,
    toName: getMemberName(members, adjustment.toUid),
    amount: adjustment.amount,
    ...(adjustment.memo ? { memo: adjustment.memo } : {}),
  }));
  const previewData = {
    requestId,
    title,
    tripName,
    total,
    expenseCount: expenses.length,
    transfers,
    transferTotal,
    expenses: expenses.map((expense) => {
      const participantUids = payerFirstUids(getParticipantUids(expense, memberUids), expense.paidByUid);
      return {
        id: expense.id,
        title: expense.description || CATEGORY_META[expense.category].label,
        amount: effectiveKrw(expense),
        paidByName: getMemberName(members, expense.paidByUid, "결제자"),
        participants: participantUids.map((uid) => ({
          name: getMemberName(members, uid),
          isPayer: uid === expense.paidByUid,
        })),
        hasSharedSettlement: participantUids.some((uid) => uid !== expense.paidByUid),
      };
    }),
    adjustments: adjustmentSnapshots,
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
    const participantUids = payerFirstUids(getParticipantUids(expense, memberUids), expense.paidByUid);
    return {
      expenseId: expense.id,
      title: expense.description || CATEGORY_META[expense.category].label,
      amount: Math.round(effectiveKrw(expense)),
      payerUid: expense.paidByUid,
      payerName: getMemberName(members, expense.paidByUid, "결제자"),
      participantUids,
      participantNames: participantUids.map((uid) => getMemberName(members, uid)),
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
  const selectedExpenseIdsParam = searchParams.get("selected");
  const { user, loading: authLoading } = useAuth();

  const [trip, setTrip] = useState<TripData | null>(null);
  const [tripLoading, setTripLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expensesError, setExpensesError] = useState<FirestoreError | null>(null);
  const [settlementRequests, setSettlementRequests] = useState<SettlementRequest[]>([]);
  const [settlementAdjustments, setSettlementAdjustments] = useState<ManualOffset[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(true);
  const [adjustmentsError, setAdjustmentsError] = useState<FirestoreError | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [listMode, setListMode] = useState<ListMode>("latest");
  const [listModeMenuOpen, setListModeMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [settlementSettings, setSettlementSettings] = useState<SettlementSettings>(DEFAULT_SETTLEMENT_SETTINGS);
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
  const expenseDialogHistoryRef = useRef(false);

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
    if (!user || !tripId) return;
    const q = query(
      collection(db, "trips", tripId, "settlementAdjustments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSettlementAdjustments(
          snap.docs
            .map((d) => parseSettlementAdjustmentDoc(d.id, d.data() as Record<string, unknown>))
            .filter((adjustment) => adjustment.status !== "voided")
        );
        setAdjustmentsError(null);
        setAdjustmentsLoading(false);
      },
      (err) => {
        console.error("[settle] settlementAdjustments onSnapshot error", err);
        setAdjustmentsError(err);
        toast.error(`추가 조정 항목을 불러오지 못했어요: ${settlementAdjustmentErrorMessage(err)}`);
        setAdjustmentsLoading(false);
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
  }, [trip?.members, profileOpen]);

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
        }
      } catch {
        if (!cancelled) {
          setSettlementSettings(DEFAULT_SETTLEMENT_SETTINGS);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, profileOpen]);

  const closeExpenseDialog = () => {
    if (expenseDialogHistoryRef.current && typeof window !== "undefined") {
      window.history.back();
      return;
    }
    setAddOpen(false);
    setEditingExpense(null);
  };

  useEffect(() => {
    const expenseDialogOpen = addOpen || !!editingExpense;
    if (!expenseDialogOpen || expenseDialogHistoryRef.current || typeof window === "undefined") {
      return;
    }

    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        settleExpenseDialog: true,
      },
      "",
      window.location.href,
    );
    expenseDialogHistoryRef.current = true;
  }, [addOpen, editingExpense]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      if (!expenseDialogHistoryRef.current) return;
      expenseDialogHistoryRef.current = false;
      setAddOpen(false);
      setEditingExpense(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
  const selectedProductionExpenseIdSet = useMemo(
    () => new Set(
      (selectedExpenseIdsParam ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
    [selectedExpenseIdsParam]
  );
  const tentativeExpenses = useMemo(
    () => expenses.filter((expense) => expense.status === "tentative"),
    [expenses]
  );
  const productionPreviewExpenses = useMemo(
    () => selectedProductionExpenseIdSet.size > 0
      ? tentativeExpenses.filter((expense) => selectedProductionExpenseIdSet.has(expense.id))
      : tentativeExpenses,
    [selectedProductionExpenseIdSet, tentativeExpenses]
  );
  const activeSettlementAdjustments = useMemo(
    () => settlementAdjustments.filter((adjustment) => adjustment.status === "active"),
    [settlementAdjustments]
  );
  const selectableFilteredExpenseIds = useMemo(
    () => filteredExpenses
      .filter((expense) => expense.status === "tentative")
      .map((expense) => expense.id),
    [filteredExpenses]
  );
  const allFilteredExpensesSelected =
    selectableFilteredExpenseIds.length > 0 &&
    selectableFilteredExpenseIds.every((expenseId) => selectedExpenseIds.has(expenseId));

  const selectedSettlementRequest = useMemo(
    () => settlementRequests.find((request) => request.id === requestIdParam) ?? null,
    [settlementRequests, requestIdParam]
  );
  const productionSettlementReport = useMemo(
    () => buildProductionSettlementReport(
      productionPreviewExpenses,
      trip?.members ?? EMPTY_MEMBERS
    ),
    [productionPreviewExpenses, trip?.members]
  );
  const settlementStatusCounts = useMemo(
    () => ({
      tentative: expenses.filter((expense) => expense.status === "tentative").length,
      confirmed: expenses.filter((expense) => expense.status === "confirmed").length,
    }),
    [expenses]
  );

  const isRequestsTab = tabParam === "requests";
  const isCategoryReportTab = tabParam === "categories";
  const isProductionReportTab = tabParam === "production";
  const isSubPage = isRequestsTab || isCategoryReportTab || isProductionReportTab;
  const profilePhoto = user ? memberPhotos[user.uid] || user.photoURL || null : null;


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

  const selectAllFilteredExpenses = () => {
    setSelectedExpenseIds(new Set(selectableFilteredExpenseIds));
  };

  const openProductionPreviewForSelectedExpenses = () => {
    if (!tripId) return;
    const ids = selectedExpenses
      .filter((expense) => expense.status === "tentative")
      .map((expense) => expense.id);
    if (ids.length === 0) {
      toast.error("정산 미리보기로 확인할 미정산 내역을 선택해 주세요.");
      return;
    }
    router.push(`/settle?id=${tripId}&tab=production&selected=${ids.join(",")}`);
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
    if (expense.status !== "tentative") return false;
    // 미정산 지출은 모든 여행 멤버가 수정/삭제할 수 있음
    return isAdminUid(user.uid) || Boolean(trip?.members?.[user.uid]);
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!tripId) return;
    if (expense.status !== "tentative") {
      toast.error("정산 요청중이거나 완료된 지출은 삭제할 수 없어요.");
      return;
    }
    if (!window.confirm("이 지출을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, "trips", tripId, "expenses", expense.id));
      toast.success("지출을 삭제했어요.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`삭제 실패: ${message}`);
    }
  };

  const handleCreateSettlementRequest = async (targetExpenses: Expense[], targetAdjustments: ManualOffset[]) => {
    if (targetExpenses.length === 0) {
      toast.error("정산 요청할 내역을 선택해 주세요.");
      return;
    }
    if (!tripId) return;
    const invalidExpense = targetExpenses.find((expense) => expense.status !== "tentative");
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
      expenses: targetExpenses,
      adjustments: targetAdjustments,
      settings: settlementSettings,
      settingsByUid: { ...memberSettlementSettings, ...(user ? { [user.uid]: settlementSettings } : {}) },
      pageUrl: shareUrl,
    });
    setSettlementConfirming(true);
    try {
      await createSettlementRequest(preview);
      toast.success("정산 요청을 생성했어요.");
      exitSelectionMode();
      router.replace(`/settle?id=${tripId}&request=${requestRef.id}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`정산 요청 생성 실패: ${message}`);
    } finally {
      setSettlementConfirming(false);
    }
  };

  const createSettlementRequest = async (preview: SettlementPreviewData) => {
    if (!user || !tripId || !trip) throw new Error("정산 요청을 만들 수 있는 여행 정보가 없어요.");
    const selectedIds = preview.expenses.map((expense) => expense.id);
    if (selectedIds.length === 0) throw new Error("선택된 지출이 없어요.");

    const members = trip.members ?? EMPTY_MEMBERS;
    const requestedByName = members[user.uid] ?? user.displayName ?? "요청자";
    const requestRef = doc(db, "trips", tripId, "settlementRequests", preview.requestId);
    const expenseRefs = selectedIds.map((expenseId) => doc(db, "trips", tripId, "expenses", expenseId));
    const adjustmentIds = preview.adjustments.map((adjustment) => adjustment.adjustmentId);
    const adjustmentRefs = adjustmentIds.map((adjustmentId) => doc(db, "trips", tripId, "settlementAdjustments", adjustmentId));
    const expensesById = new Map(expenses.map((expense) => [expense.id, expense]));
    const snapshotExpenses = selectedIds.map((expenseId) => expensesById.get(expenseId));
    if (snapshotExpenses.some((expense) => !expense)) {
      throw new Error("선택한 지출 중 현재 목록에서 찾을 수 없는 내역이 있어요.");
    }
    const snapshots = buildExpenseSnapshots(snapshotExpenses as Expense[], members);

    await runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (requestSnap.exists()) {
        throw new Error("이미 생성된 정산 요청입니다.");
      }

      const expenseSnaps = await Promise.all(expenseRefs.map((ref) => transaction.get(ref)));
      const adjustmentSnaps = await Promise.all(adjustmentRefs.map((ref) => transaction.get(ref)));
      for (const snap of expenseSnaps) {
        if (!snap.exists()) {
          throw new Error("선택한 지출 중 삭제된 내역이 있어요.");
        }
        const status = snap.data().status;
        if (status !== "tentative") {
          throw new Error("이미 요청중이거나 완료된 지출이 포함되어 있어요.");
        }
      }
      for (const snap of adjustmentSnaps) {
        if (!snap.exists()) {
          throw new Error("추가 조정 항목 중 삭제된 내역이 있어요.");
        }
        if (snap.data().status !== "active") {
          throw new Error("이미 정산에 반영되었거나 취소된 추가 조정 항목이 포함되어 있어요.");
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
        adjustmentIds,
        adjustmentSnapshots: preview.adjustments,
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
      for (const ref of adjustmentRefs) {
        transaction.update(ref, {
          status: "applied",
          appliedToSettlementRequestId: preview.requestId,
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
    if (!window.confirm("입금 확인 후 정산 완료로 변경할까요?")) return;
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
      toast.success("정산 완료로 변경했어요.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`정산 완료 처리 실패: ${message}`);
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
        for (const adjustmentId of request.adjustmentIds) {
          transaction.update(doc(db, "trips", tripId, "settlementAdjustments", adjustmentId), {
            status: "active",
            appliedToSettlementRequestId: null,
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
  const showSettlementActionBar =
    !isSubPage &&
    filter === "tentative" &&
    selectionMode &&
    selectableFilteredExpenseIds.length > 0;

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col overflow-x-hidden bg-background shadow-sm sm:border-x">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-sky-100 bg-white/80 px-2 backdrop-blur-md">
        {isSubPage && tripId ? (
          <button
            type="button"
            onClick={() => router.replace(`/settle?id=${tripId}`)}
            aria-label="뒤로가기"
            className="flex h-10 w-10 items-center justify-center rounded-full text-primary transition-all hover:bg-primary/10 active:scale-95"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        ) : (
          <div className="h-10 w-10" aria-hidden="true" />
        )}
        <h1 className="text-base font-bold tracking-tight text-on-surface">
          {isRequestsTab ? "정산 내역" : isCategoryReportTab ? "지출 리포트" : isProductionReportTab ? "정산 미리보기" : "정산"}
        </h1>
        {isSubPage ? (
          isProductionReportTab && tripId ? (
            <button
              type="button"
              onClick={() => router.push(`/settle?id=${tripId}&tab=requests`)}
              aria-label="정산 요청 관리"
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary active:scale-95"
            >
              <MoreHorizontal className="h-5 w-5" strokeWidth={2.2} />
            </button>
          ) : (
            <div className="h-10 w-10" aria-hidden="true" />
          )
        ) : (
          <button
            type="button"
            aria-label="프로필"
            onClick={() => setProfileOpen(true)}
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full glass-card text-primary"
          >
            {profilePhoto ? (
              <Avatar className="h-10 w-10">
                <AvatarImage src={profilePhoto} className="object-cover" />
                <AvatarFallback className="bg-primary/10 text-sm text-primary">
                  {(user?.displayName || "?").charAt(0)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span className="material-symbols-outlined">person</span>
            )}
          </button>
        )}
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
                onOpenRequest={(requestId) => router.replace(`/settle?id=${tripId}&tab=requests&request=${requestId}`)}
              />
            ) : isProductionReportTab ? (
              <ProductionSettlementStatusView
                report={productionSettlementReport}
                loading={expensesLoading || adjustmentsLoading}
                adjustments={activeSettlementAdjustments}
                adjustmentsError={adjustmentsError}
                creatingRequest={settlementConfirming}
                onCreateRequest={() => handleCreateSettlementRequest(productionPreviewExpenses, activeSettlementAdjustments)}
                onCreateAdjustment={async ({ fromUid, toUid, amount, memo }) => {
                  if (!tripId || !user) return;
                  await addDoc(collection(db, "trips", tripId, "settlementAdjustments"), {
                    type: "direct_transfer",
                    fromMemberId: fromUid,
                    toMemberId: toUid,
                    amount,
                    currency: "KRW",
                    memo,
                    status: "active",
                    createdBy: user.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    appliedToSettlementRequestId: null,
                  });
                }}
                onUpdateAdjustment={async (adjustmentId, { fromUid, toUid, amount, memo }) => {
                  if (!tripId) return;
                  await updateDoc(doc(db, "trips", tripId, "settlementAdjustments", adjustmentId), {
                    fromMemberId: fromUid,
                    toMemberId: toUid,
                    amount,
                    memo,
                    updatedAt: serverTimestamp(),
                  });
                }}
                onVoidAdjustment={async (adjustmentId) => {
                  if (!tripId) return;
                  await updateDoc(doc(db, "trips", tripId, "settlementAdjustments", adjustmentId), {
                    status: "voided",
                    updatedAt: serverTimestamp(),
                  });
                }}
              />
            ) : isCategoryReportTab ? (
              <CategoryExpenseReport
                expenses={expenses}
                byCategory={byCategory}
                total={total}
                members={trip?.members ?? EMPTY_MEMBERS}
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
                    onClick={() => router.push(`/settle?id=${tripId}&tab=categories`)}
                  />
                  <button
                    type="button"
                    onClick={() => router.push(`/settle?id=${tripId}&tab=production`)}
                    className="glass-panel relative p-4 rounded-xl flex flex-col justify-between h-32 w-full text-left hover:bg-white/60 transition-colors active:scale-[0.98]"
                  >
                    <span className="absolute right-1.5 top-1 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                      <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="flex items-center justify-between">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-tertiary"
                        aria-hidden="true"
                      >
                        <path
                          d="M14.3557 2.59534C14.4445 2.48261 14.6098 2.46762 14.7175 2.56254L15.6385 3.37473L12.7383 7H14.6592L16.7648 4.36797L18.417 5.82489C18.5186 5.9145 18.5304 6.06873 18.4435 6.1727L17.7523 7H19.6965C20.1905 6.27893 20.0778 5.28948 19.4091 4.69984L15.7096 1.43749C14.9561 0.77305 13.7991 0.877958 13.1775 1.66709L8.9762 7H10.8858L14.3557 2.59534ZM5.25 6.5C4.83579 6.5 4.5 6.83579 4.5 7.25C4.5 7.66421 4.83579 8 5.25 8L18.25 8C20.0449 8 21.5 9.45507 21.5 11.25V17.75C21.5 19.5449 20.0449 21 18.25 21H6.25C4.45507 21 3 19.5449 3 17.75V7.25C3 6.00736 4.00736 5 5.25 5H9.57L8.37844 6.5H5.25ZM15.5 14.75C15.5 15.1642 15.8358 15.5 16.25 15.5H18.25C18.6642 15.5 19 15.1642 19 14.75C19 14.3358 18.6642 14 18.25 14H16.25C15.8358 14 15.5 14.3358 15.5 14.75Z"
                          fill="currentColor"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-on-surface-variant text-xs mb-0.5">
                        정산 미리보기
                      </p>
                      <p className="text-sm font-bold text-on-surface">
                        미정산 {settlementStatusCounts.tentative}건 · 정산완료 {settlementStatusCounts.confirmed}건
                      </p>
                    </div>
                  </button>
                </div>


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

      {showSettlementActionBar && (
        <div className="fixed bottom-24 left-1/2 z-40 w-full max-w-3xl -translate-x-1/2 px-4">
          <div className="flex flex-col gap-2 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-lg shadow-primary/10 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface">
                {selectedExpenseIds.size}건 선택됨
              </p>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3">
              <button
                type="button"
                onClick={selectAllFilteredExpenses}
                disabled={allFilteredExpensesSelected}
                className="text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary disabled:cursor-default disabled:text-on-surface-variant/40"
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={clearSelectedExpenses}
                disabled={selectedExpenseIds.size === 0}
                className="text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary disabled:cursor-default disabled:text-on-surface-variant/40"
              >
                선택 해제
              </button>
              <button
                type="button"
                onClick={openProductionPreviewForSelectedExpenses}
                disabled={selectedExpenseIds.size === 0}
                className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm shadow-primary/25 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-primary/40 disabled:shadow-none"
              >
                정산요청
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      {!isSubPage && !showSettlementActionBar && (
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
          onOpenChange={(open) => {
            if (open) {
              setAddOpen(true);
              return;
            }
            closeExpenseDialog();
          }}
          tripId={tripId}
          members={trip.members ?? EMPTY_MEMBERS}
        />
      )}

      {trip && tripId && editingExpense && (
        <AddExpenseDialog
          open={!!editingExpense}
          onOpenChange={(open) => {
            if (!open) closeExpenseDialog();
          }}
          tripId={tripId}
          members={trip.members ?? EMPTY_MEMBERS}
          editingExpense={editingExpense}
        />
      )}

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />

      <SettlementRequestDetailDialog
        open={!!requestIdParam}
        request={selectedSettlementRequest}
        loading={requestsLoading}
        canManage={isRequestsTab && canManageSettlementRequest(selectedSettlementRequest)}
        actionLoading={requestActionLoading}
        onOpenChange={(open) => {
          if (!open && tripId) router.replace(isRequestsTab ? `/settle?id=${tripId}&tab=requests` : `/settle?id=${tripId}`);
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
  const dialogTitle = request?.status === "completed" ? "정산 완료" : "정산 요청 상세";
  const canShareRequest = !!request && request.status === "requested";
  const handleShareRequest = async () => {
    if (!request) return;
    const title = `${request.title} 정산 요청`;
    const shareMessage = buildSettlementRequestShareMessage(
      request,
      typeof window !== "undefined" ? window.location.href : ""
    );
    try {
      if (
        navigator.share &&
        (!navigator.canShare ||
          navigator.canShare({
            title,
            text: shareMessage,
          }))
      ) {
        await navigator.share({
          title,
          text: shareMessage,
        });
        return;
      }

      await copyTextToClipboard(shareMessage);
      toast.success("공유 기능을 사용할 수 없어 정산 요청 메시지를 복사했어요.");
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const message = e instanceof Error ? e.message : String(e);
      try {
        await copyTextToClipboard(shareMessage);
        toast.success("공유창을 열지 못해서 정산 요청 메시지를 복사했어요.");
      } catch {
        toast.error(`공유 실패: ${message}`);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-sm overflow-y-auto rounded-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle>{dialogTitle}</DialogTitle>
            {canShareRequest ? (
              <button
                type="button"
                onClick={handleShareRequest}
                disabled={actionLoading}
                aria-label="공유하기"
                className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Share2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
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
}: {
  requests: SettlementRequest[];
  loading: boolean;
  onManage: () => void;
}) {
  const requestedCount = requests.filter((r) => r.status === "requested").length;
  const completedCount = requests.filter((r) => r.status === "completed").length;

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-on-surface">정산 요청</h3>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            {loading ? "불러오는 중..." : `진행 중 ${requestedCount}건 · 완료 ${completedCount}건`}
          </p>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-outline-variant/30 transition-colors text-lg font-bold"
          aria-label="관리"
        >
          &hellip;
        </button>
      </div>
    </section>
  );
}

function ProductionSettlementStatusView({
  report,
  loading,
  adjustments,
  adjustmentsError,
  creatingRequest,
  onCreateRequest,
  onCreateAdjustment,
  onUpdateAdjustment,
  onVoidAdjustment,
}: {
  report: ProductionSettlementReport;
  loading: boolean;
  adjustments: ManualOffset[];
  adjustmentsError: FirestoreError | null;
  creatingRequest: boolean;
  onCreateRequest: () => void;
  onCreateAdjustment: (adjustment: { fromUid: string; toUid: string; amount: number; memo: string }) => Promise<void>;
  onUpdateAdjustment: (
    adjustmentId: string,
    adjustment: { fromUid: string; toUid: string; amount: number; memo: string }
  ) => Promise<void>;
  onVoidAdjustment: (adjustmentId: string) => Promise<void>;
}) {
  const [offsetFromUid, setOffsetFromUid] = useState("");
  const [offsetToUid, setOffsetToUid] = useState("");
  const [offsetAmount, setOffsetAmount] = useState("");
  const [offsetMemo, setOffsetMemo] = useState("");
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null);
  const [editFromUid, setEditFromUid] = useState("");
  const [editToUid, setEditToUid] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const payerRows = report.memberRows
    .filter((row) => row.expenseCount > 0)
    .sort((a, b) => b.paidTotal - a.paidTotal);
  const memberRows = [...report.memberRows].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const activeAdjustments = adjustments.filter((adjustment) => adjustment.status === "active");
  const appliedAdjustments = adjustments.filter((adjustment) => adjustment.status === "applied");
  const memberNameByUid = new Map(report.memberRows.map((row) => [row.uid, row.name]));
  const adjustedRows = report.memberRows
    .map((row) => {
      const offsetDelta = adjustments.reduce((sum, offset) => {
        if (offset.fromUid === row.uid) return sum - offset.amount;
        if (offset.toUid === row.uid) return sum + offset.amount;
        return sum;
      }, 0);
      return {
        ...row,
        offsetDelta,
        finalBalance: row.balance + offsetDelta,
      };
    })
    .sort((a, b) => b.finalBalance - a.finalBalance);
  const finalTransfers = buildOptimizedTransfers({
    balances: new Map(adjustedRows.map((row) => [row.uid, row.finalBalance])),
    memberNames: new Map(adjustedRows.map((row) => [row.uid, row.name])),
  });
  const hasAppliedAdjustments = appliedAdjustments.length > 0;
  const adjustmentPermissionBlocked = isFirestorePermissionDenied(adjustmentsError);

  const validateAdjustmentInput = (fromUid: string, toUid: string, amount: number) => {
    if (!fromUid || !toUid) {
      toast.error("보내는 사람과 받는 사람을 선택해 주세요.");
      return false;
    }
    if (fromUid === toUid) {
      toast.error("보내는 사람과 받는 사람이 같을 수 없어요.");
      return false;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("금액을 1원 이상으로 입력해 주세요.");
      return false;
    }
    return true;
  };

  const addOffset = async () => {
    const amount = Math.round(Number(offsetAmount));
    if (!validateAdjustmentInput(offsetFromUid, offsetToUid, amount)) return;
    setAdjustmentSaving(true);
    try {
      await onCreateAdjustment({
        fromUid: offsetFromUid,
        toUid: offsetToUid,
        amount,
        memo: offsetMemo.trim(),
      });
      setOffsetAmount("");
      setOffsetMemo("");
      toast.success("추가 조정 항목을 추가했어요.");
    } catch (e: unknown) {
      const message = settlementAdjustmentErrorMessage(e);
      toast.error(`추가 조정 항목 저장 실패: ${message}`);
    } finally {
      setAdjustmentSaving(false);
    }
  };

  const startEditOffset = (adjustment: ManualOffset) => {
    if (adjustment.status !== "active") return;
    setEditingAdjustmentId(adjustment.id);
    setEditFromUid(adjustment.fromUid);
    setEditToUid(adjustment.toUid);
    setEditAmount(String(adjustment.amount));
    setEditMemo(adjustment.memo ?? "");
  };

  const cancelEditOffset = () => {
    setEditingAdjustmentId(null);
    setEditFromUid("");
    setEditToUid("");
    setEditAmount("");
    setEditMemo("");
  };

  const saveOffsetEdit = async (adjustmentId: string) => {
    const amount = Math.round(Number(editAmount));
    if (!validateAdjustmentInput(editFromUid, editToUid, amount)) return;
    setAdjustmentSaving(true);
    try {
      await onUpdateAdjustment(adjustmentId, {
        fromUid: editFromUid,
        toUid: editToUid,
        amount,
        memo: editMemo.trim(),
      });
      cancelEditOffset();
      toast.success("추가 조정 항목을 수정했어요.");
    } catch (e: unknown) {
      const message = settlementAdjustmentErrorMessage(e);
      toast.error(`추가 조정 항목 수정 실패: ${message}`);
    } finally {
      setAdjustmentSaving(false);
    }
  };

  const voidOffset = async (adjustmentId: string) => {
    setAdjustmentSaving(true);
    try {
      await onVoidAdjustment(adjustmentId);
      if (editingAdjustmentId === adjustmentId) cancelEditOffset();
      toast.success("추가 조정 항목을 취소했어요.");
    } catch (e: unknown) {
      const message = settlementAdjustmentErrorMessage(e);
      toast.error(`추가 조정 항목 취소 실패: ${message}`);
    } finally {
      setAdjustmentSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel rounded-xl p-6 text-sm text-on-surface-variant">
        정산 미리보기를 불러오는 중...
      </div>
    );
  }

  if (report.expenseCount === 0) {
    return (
      <div className="glass-panel rounded-xl p-8 text-center">
        <span className="material-symbols-outlined mb-2 text-4xl text-primary/70">receipt_long</span>
        <p className="text-sm font-semibold text-on-surface">미정산 지출이 없어요</p>
        <p className="mt-1 text-xs text-on-surface-variant">새 미정산 지출을 추가하면 미리보기가 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="glass-elevated rounded-xl p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
            <p className="text-[11px] font-semibold text-primary">총 정산금액</p>
            <p className="mt-1 text-xl font-extrabold text-on-surface">{formatKrw(report.total)}</p>
          </div>
          <div className="rounded-xl border border-outline-variant/70 bg-white/70 p-3">
            <p className="text-[11px] font-semibold text-on-surface-variant">참여인원</p>
            <p className="mt-1 text-xl font-extrabold text-on-surface">{report.memberRows.length}명</p>
          </div>
          <div className="rounded-xl border border-outline-variant/70 bg-white/70 p-3">
            <p className="text-[11px] font-semibold text-on-surface-variant">총 결제건수</p>
            <p className="mt-1 text-xl font-extrabold text-on-surface">{report.expenseCount}건</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[11px] font-semibold text-amber-700">추가 조정</p>
            <p className="mt-1 text-xl font-extrabold text-on-surface">{activeAdjustments.length}건</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-bold text-on-surface">기본 정산 내역</h3>
        <p className="text-xs leading-relaxed text-on-surface-variant">
          결제자별 지출과 1인당 분담액을 기준으로 계산한 기본 정산입니다.
        </p>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-bold text-on-surface">결제 요약</h4>
        <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-white/75">
          <div className="grid grid-cols-[1.1fr_0.8fr_1fr_1fr] border-b border-outline-variant/60 bg-surface-container px-3 py-2 text-[11px] font-semibold text-on-surface-variant">
            <span>멤버</span>
            <span className="text-right">결제 건수</span>
            <span className="text-right">결제 금액</span>
            <span className="text-right">미확정(가환율)</span>
          </div>
          {payerRows.map((row) => (
            <div key={row.uid} className="grid grid-cols-[1.1fr_0.8fr_1fr_1fr] border-b border-outline-variant/50 px-3 py-2 text-xs last:border-b-0">
              <span className="truncate font-semibold text-on-surface">{row.name}</span>
              <span className="text-right text-on-surface-variant">{row.expenseCount}건</span>
              <span className="text-right text-on-surface-variant">{formatKrw(row.paidTotal)}</span>
              <span className="text-right font-semibold text-amber-700">{row.estimatedCount}건</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-bold text-on-surface">멤버별 정산 내역</h4>
        <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-white/75">
          <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] border-b border-outline-variant/60 bg-surface-container px-3 py-2 text-[11px] font-semibold text-on-surface-variant">
            <span>멤버</span>
            <span className="text-right">결제 금액</span>
            <span className="text-right">부담 금액</span>
            <span className="text-right">결과</span>
          </div>
          {report.memberRows.map((row) => (
            <div key={row.uid} className="grid grid-cols-[1.1fr_1fr_1fr_1fr] border-b border-outline-variant/50 px-3 py-2 text-xs last:border-b-0">
              <span className="truncate font-semibold text-on-surface">{row.name}</span>
              <span className="text-right text-on-surface-variant">{formatKrw(row.paidTotal)}</span>
              <span className="text-right text-on-surface-variant">{formatKrw(row.shareTotal)}</span>
              <span className={`text-right font-bold ${row.balance >= 0 ? "text-primary" : "text-rose-600"}`}>
                {formatSignedKrw(row.balance)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-on-surface-variant">
          *결과 = 결제 금액 - 부담 금액 (양수는 받을 금액, 음수는 보낼 금액)
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-bold text-on-surface">추가 조정 항목</h3>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            기본 정산 외에 따로 주고받아야 할 금액을 추가할 수 있어요.
          </p>
        </div>
        {adjustmentPermissionBlocked ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            로컬 Firestore emulator가 최신 rules를 반영하지 않아 추가 조정 항목을 저장할 수 없어요.
            emulator를 재시작하거나 운영 rules를 배포한 뒤 다시 시도해 주세요.
          </div>
        ) : null}
        <div className="rounded-xl border border-outline-variant/60 bg-white/75 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-on-surface-variant">보내는 사람</span>
              <select
                value={offsetFromUid}
                onChange={(e) => setOffsetFromUid(e.target.value)}
                className="h-10 w-full rounded-lg border border-outline-variant bg-white px-2 text-sm text-on-surface"
              >
                <option value="">선택</option>
                {memberRows.map((row) => (
                  <option key={row.uid} value={row.uid}>{row.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-on-surface-variant">받는 사람</span>
              <select
                value={offsetToUid}
                onChange={(e) => setOffsetToUid(e.target.value)}
                className="h-10 w-full rounded-lg border border-outline-variant bg-white px-2 text-sm text-on-surface"
              >
                <option value="">선택</option>
                {memberRows.map((row) => (
                  <option key={row.uid} value={row.uid}>{row.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-on-surface-variant">금액</span>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={offsetAmount}
                onChange={(e) => setOffsetAmount(e.target.value)}
                placeholder="50000"
                className="h-10 w-full rounded-lg border border-outline-variant bg-white px-3 text-sm text-on-surface"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-on-surface-variant">메모</span>
              <input
                type="text"
                value={offsetMemo}
                onChange={(e) => setOffsetMemo(e.target.value)}
                placeholder="현금 보정"
                className="h-10 w-full rounded-lg border border-outline-variant bg-white px-3 text-sm text-on-surface"
              />
            </label>
            <Button
              type="button"
              className="h-10 self-end"
              onClick={addOffset}
              disabled={adjustmentSaving || adjustmentPermissionBlocked}
            >
              추가
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {adjustments.length > 0 ? (
              adjustments.map((offset) => {
                const isEditing = editingAdjustmentId === offset.id;
                const isApplied = offset.status === "applied";
                return (
                  <div key={offset.id} className="rounded-lg bg-surface-container px-3 py-2">
                    {isEditing ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1.2fr_auto_auto]">
                        <select
                          value={editFromUid}
                          onChange={(e) => setEditFromUid(e.target.value)}
                          className="h-9 rounded-lg border border-outline-variant bg-white px-2 text-sm text-on-surface"
                        >
                          {memberRows.map((row) => (
                            <option key={row.uid} value={row.uid}>{row.name}</option>
                          ))}
                        </select>
                        <select
                          value={editToUid}
                          onChange={(e) => setEditToUid(e.target.value)}
                          className="h-9 rounded-lg border border-outline-variant bg-white px-2 text-sm text-on-surface"
                        >
                          {memberRows.map((row) => (
                            <option key={row.uid} value={row.uid}>{row.name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="h-9 rounded-lg border border-outline-variant bg-white px-3 text-sm text-on-surface"
                        />
                        <input
                          type="text"
                          value={editMemo}
                          onChange={(e) => setEditMemo(e.target.value)}
                          className="h-9 rounded-lg border border-outline-variant bg-white px-3 text-sm text-on-surface"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => saveOffsetEdit(offset.id)}
                          disabled={adjustmentSaving || adjustmentPermissionBlocked}
                        >
                          저장
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={cancelEditOffset}
                          disabled={adjustmentSaving}
                        >
                          취소
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="min-w-0 truncate text-sm font-semibold text-on-surface">
                              {memberNameByUid.get(offset.fromUid) ?? "이름 없음"}
                              <span className="mx-1.5 text-on-surface-variant">→</span>
                              {memberNameByUid.get(offset.toUid) ?? "이름 없음"}
                            </p>
                            {isApplied ? (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                                정산 반영됨
                              </span>
                            ) : null}
                          </div>
                          {offset.memo ? (
                            <p className="mt-0.5 truncate text-xs text-on-surface-variant">{offset.memo}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <p className="text-sm font-bold text-primary">{formatKrw(offset.amount)}</p>
                          <button
                            type="button"
                            onClick={() => startEditOffset(offset)}
                            disabled={adjustmentSaving || isApplied || adjustmentPermissionBlocked}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-outline-variant/30 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="추가 조정 항목 수정"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="추가 조정 항목 삭제"
                            onClick={() => voidOffset(offset.id)}
                            disabled={adjustmentSaving || isApplied || adjustmentPermissionBlocked}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-outline-variant/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-on-surface-variant">추가된 조정 항목이 없어요.</p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-bold text-on-surface">🧾 최종 정산 결과</h3>
        <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-white/75">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b border-outline-variant/60 bg-surface-container px-3 py-2 text-[11px] font-semibold text-on-surface-variant">
            <span>멤버</span>
            <span className="text-right">기본 정산</span>
            <span className="text-right">추가 조정</span>
            <span className="text-right">최종 결과</span>
          </div>
          {adjustedRows.map((row) => (
            <div key={row.uid} className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b border-outline-variant/50 px-3 py-2 text-xs last:border-b-0">
              <span className="truncate font-semibold text-on-surface">{row.name}</span>
              <span className={`text-right font-medium ${row.balance >= 0 ? "text-primary" : "text-rose-600"}`}>
                {formatSignedKrw(row.balance)}
              </span>
              <span className={`text-right font-medium ${row.offsetDelta >= 0 ? "text-primary" : "text-rose-600"}`}>
                {formatSignedKrw(row.offsetDelta)}
              </span>
              <span className={`text-right font-bold ${row.finalBalance >= 0 ? "text-primary" : "text-rose-600"}`}>
                {formatSignedKrw(row.finalBalance)}
              </span>
            </div>
          ))}
        </div>

        <h4 className="text-sm font-bold text-on-surface">💸 송금해야 할 금액</h4>
        {finalTransfers.length > 0 ? (
          <div className="space-y-2">
            {finalTransfers.map((transfer, idx) => (
              <article
                key={`${transfer.fromUid}-${transfer.toUid}-${idx}`}
                className="rounded-xl border border-outline-variant/60 bg-white/75 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-on-surface">
                    {transfer.fromName}
                    <span className="mx-1.5 text-on-surface-variant">→</span>
                    {transfer.toName}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {hasAppliedAdjustments ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        송금 전
                      </span>
                    ) : null}
                    <p className="text-sm font-extrabold text-primary">{formatKrw(transfer.amount)}</p>
                  </div>
                </div>
                {hasAppliedAdjustments ? (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" disabled>
                      보냈어요
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled>
                      받았어요
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-outline-variant/60 bg-white/70 p-4 text-sm text-on-surface-variant">
            최종 송금할 금액이 없어요.
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-outline-variant/60 bg-white/75 p-4">
        <div>
          <h3 className="text-base font-bold text-on-surface">정산 요청</h3>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            송금해야 할 금액을 확인한 뒤 정산 요청을 만들거나 기존 요청 상태를 확인합니다.
          </p>
        </div>
        <Button type="button" className="w-full" onClick={onCreateRequest} disabled={report.expenseCount === 0 || creatingRequest}>
          {creatingRequest ? "생성 중..." : "정산 요청 생성"}
        </Button>
      </section>
    </div>
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
  const [expandedDetail, setExpandedDetail] = useState<"expenses" | "adjustments" | null>(null);
  const expensesExpanded = expandedDetail === "expenses";
  const adjustmentsExpanded = expandedDetail === "adjustments";
  const receiverAccounts = Array.from(new Map(request.transfers.map((transfer) => [transfer.toUid, transfer])).values());

  return (
    <div className="space-y-5 py-2">
      <section className="rounded-xl border border-primary/15 bg-primary/5 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${REQUEST_STATUS_BADGE_CLASS[request.status]}`}>
                {REQUEST_STATUS_LABEL[request.status]}
              </span>
            </p>
            <h3 className="mt-1 truncate text-sm font-bold text-on-surface">{request.title}</h3>
            <p className="mt-1 text-xs text-on-surface-variant">
              {request.requestedByName} 요청 · 지출 {request.expenseIds.length}건
              {request.adjustmentIds.length > 0 ? ` · 추가 조정 ${request.adjustmentIds.length}건` : ""}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              요청일 {formatRequestDate(request.requestedAt)}
              {request.status === "completed" ? ` · 완료일 ${formatRequestDate(request.completedAt)}` : ""}
              {request.status === "cancelled" ? ` · 취소일 ${formatRequestDate(request.cancelledAt)}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-base font-bold text-on-surface">{formatKrw(request.totalExpenseAmount)}</p>
        </div>
        <div className="mt-3 space-y-2">
          <div
            className={`rounded-lg border bg-white/60 transition-colors ${
              expensesExpanded ? "border-primary/40 bg-primary/5" : "border-primary/10"
            }`}
          >
            <button
              type="button"
              onClick={() => setExpandedDetail((current) => (current === "expenses" ? null : "expenses"))}
              aria-expanded={expensesExpanded}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-on-surface-variant">📌 지출 내역</p>
                <p className="mt-0.5 text-sm font-bold text-on-surface">
                  {request.expenseIds.length}건 · {formatKrw(request.totalExpenseAmount)}
                </p>
              </div>
              <span className="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant">
                {expensesExpanded ? "expand_less" : "expand_more"}
              </span>
            </button>
            {expensesExpanded ? (
              <div className="space-y-1.5 border-t border-outline-variant/60 px-3 py-2">
                {request.expenseSnapshots.length > 0 ? (
                request.expenseSnapshots.map((expense, idx) => (
                  <article key={expense.expenseId} className="rounded-lg border border-outline-variant/50 bg-white/80 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-on-surface">
                        {idx + 1}. {expense.title}
                      </p>
                        <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                          결제: {expense.payerName} · 정산인원: {expense.participantNames.length}명
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-on-surface">{formatKrw(expense.amount)}</p>
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-lg border border-outline-variant/50 bg-white/80 px-3 py-2 text-xs text-on-surface-variant">
                  저장된 지출 세부 내역이 없어요.
                </p>
              )}
              </div>
            ) : null}
          </div>
          <div
            className={`rounded-lg border bg-white/60 transition-colors ${
              adjustmentsExpanded ? "border-primary/40 bg-primary/5" : "border-primary/10"
            }`}
          >
            <button
              type="button"
              onClick={() => setExpandedDetail((current) => (current === "adjustments" ? null : "adjustments"))}
              aria-expanded={adjustmentsExpanded}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-on-surface-variant">➕ 추가 조정</p>
                <p className="mt-0.5 text-sm font-bold text-on-surface">
                  {request.adjustmentIds.length}건
                </p>
              </div>
              <span className="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant">
                {adjustmentsExpanded ? "expand_less" : "expand_more"}
              </span>
            </button>
            {adjustmentsExpanded ? (
              <div className="space-y-1.5 border-t border-outline-variant/60 px-3 py-2">
                {request.adjustmentSnapshots.length > 0 ? (
                  request.adjustmentSnapshots.map((adjustment) => (
                    <article key={adjustment.adjustmentId} className="rounded-lg border border-outline-variant/50 bg-white/80 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-on-surface">
                            {adjustment.fromName}
                            <span className="mx-1.5 text-on-surface-variant">→</span>
                            {adjustment.toName}
                          </p>
                          {adjustment.memo ? (
                            <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">{adjustment.memo}</p>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-sm font-bold text-primary">{formatKrw(adjustment.amount)}</p>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="rounded-lg border border-outline-variant/50 bg-white/80 px-3 py-2 text-xs text-on-surface-variant">
                    추가 조정 항목이 없어요.
                  </p>
                )}
              </div>
            ) : null}
            </div>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-outline-variant/60 bg-white/70 p-3">
        <h4 className="text-sm font-bold text-on-surface">💸 최종 송금 금액</h4>
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

      {request.status === "requested" && canManage && (
        <div className="space-y-2 pt-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={actionLoading}>
              취소하기
            </Button>
            <Button type="button" className="flex-1" onClick={onComplete} disabled={actionLoading}>
              정산 완료
            </Button>
          </div>
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
                    {request.requestedByName} 요청 · 지출 {request.expenseIds.length}건
                    {request.adjustmentIds.length > 0 ? ` · 조정 ${request.adjustmentIds.length}건` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-on-surface-variant/80">
                    요청일 {formatRequestDate(request.requestedAt)}
                    {request.status === "completed" ? ` · 완료일 ${formatRequestDate(request.completedAt)}` : ""}
                    {request.status === "cancelled" ? ` · 취소일 ${formatRequestDate(request.cancelledAt)}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${REQUEST_STATUS_BADGE_CLASS[request.status]}`}>
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
          <DialogTitle>미리보기</DialogTitle>
        </DialogHeader>
        {preview && (
          <div className="space-y-5 py-2">
            <SettlementSharePreview preview={preview} />

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl text-sm font-semibold" onClick={() => onOpenChange(false)} disabled={confirming}>
                취소
              </Button>
              <Button type="button" className="h-11 flex-1 rounded-xl text-sm font-semibold" onClick={onConfirm} disabled={confirming}>
                {confirming ? "처리중" : "정산요청"}
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
        <h4 className="text-sm font-bold text-on-surface">💸 최종 송금 금액</h4>
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
  const estimated =
    isEstimated(expense) ||
    (isForeignCurrency(expense) &&
      !expense.finalizedKrwAmount &&
      !expense.confirmedKrwAmount &&
      !expense.cardSettlementConfirmed);
  const krw = effectiveKrw(expense);
  const participantEntries = (
    Object.keys(expense.participants ?? {}).length > 0
      ? Object.keys(expense.participants ?? {}).map((uid) => [uid, members[uid] ?? ""] as const)
      : Object.entries(members)
  ).filter(([, name]) => !!name);
  const payerName = getMemberName(members, expense.paidByUid, "");
  const visibleParticipants = participantEntries.slice(0, 4);
  const hiddenParticipantCount = Math.max(0, participantEntries.length - visibleParticipants.length);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (selectionMode) onSelectToggle?.();
      }}
      className={`glass-panel relative p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-all active:scale-[0.99] ${
        selectionMode && selected ? "border-primary/50 bg-primary/5" : ""
      }`}
    >
      {selectionMode && (
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
      )}
      <div className="flex-1 min-w-0">
        <h4 className="flex min-w-0 items-center gap-1.5 text-on-surface font-bold text-base">
          <span
            className="material-symbols-outlined shrink-0 text-[17px] leading-none text-primary/70"
            aria-hidden="true"
          >
            {meta.icon}
          </span>
          <span className="min-w-0 truncate">
            {expense.description || meta.label}
          </span>
        </h4>
        <p className="text-on-surface-variant text-xs mt-0.5">
          {payerName ? `${payerName} 결제 · ` : ""}
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
        <div className="flex items-center justify-end gap-1.5">
          {estimated && (
            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              가환율
            </span>
          )}
          <p className="text-on-surface font-bold">{formatKrw(krw)}</p>
        </div>
        <p
          className={`text-[10px] font-semibold mt-0.5 ${
            isConfirmed ? "text-tertiary" : isRequested ? "text-amber-600" : "text-primary"
          }`}
        >
          {isConfirmed ? "정산 완료" : isRequested ? "요청중" : "정산 예정"}
        </p>
      </div>
      {!selectionMode && canManage ? (
        <button
          type="button"
          aria-label="지출 관리 메뉴"
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick?.();
          }}
          className="absolute right-1.5 top-1 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

function CategoryExpenseReport({
  expenses,
  byCategory,
  total,
  members,
}: {
  expenses: Expense[];
  byCategory: Record<ExpenseCategory, number>;
  total: number;
  members: Record<string, string>;
}) {
  const [expandedCategory, setExpandedCategory] = useState<ExpenseCategory | null>(null);
  const rows: CategoryReportRow[] = CATEGORY_ORDER.map((category) => {
    const items = expenses
      .filter((expense) => expense.category === category)
      .sort((a, b) => effectiveKrw(b) - effectiveKrw(a));
    const amount = byCategory[category] ?? 0;
    const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
    return {
      category,
      meta: CATEGORY_META[category],
      items,
      amount,
      percent,
      barClass: CATEGORY_REPORT_BAR_CLASS[category],
    };
  });
  rows.sort((a, b) => b.amount - a.amount);

  if (total <= 0) {
    return (
      <div className="glass-panel rounded-xl p-8 text-center">
        <span className="material-symbols-outlined mb-2 text-4xl text-primary/70">analytics</span>
        <p className="text-sm font-semibold text-on-surface">아직 지출 리포트가 없어요</p>
        <p className="mt-1 text-xs text-on-surface-variant">지출을 추가하면 카테고리별 비중을 볼 수 있어요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="glass-elevated rounded-xl p-5">
        <p className="text-xs font-medium text-on-surface-variant">총 지출</p>
        <div className="mt-2">
          <div>
            <p className="text-3xl font-extrabold tracking-tight text-primary">{formatKrw(total)}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-bold text-on-surface">카테고리별 지출</h3>
        <div className="space-y-2.5">
          {rows.map((row) => {
            const expanded = expandedCategory === row.category;
            const hasItems = row.items.length > 0;
            return (
              <div
                key={row.category}
                className={`rounded-xl border bg-white/70 p-3 transition-colors ${
                  expanded ? "border-primary/50 bg-primary/5" : "border-outline-variant/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedCategory((current) => (current === row.category ? null : row.category))}
                  disabled={!hasItems}
                  aria-expanded={expanded}
                  className="w-full text-left disabled:cursor-default"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${row.meta.iconBoxClass}`}
                        aria-hidden="true"
                      >
                        <span
                          className="material-symbols-outlined block text-[18px] leading-none"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          {row.meta.icon}
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-on-surface">{row.meta.label}</p>
                        <p className="text-[11px] text-on-surface-variant">{row.items.length}건 · {row.percent}%</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-sm font-bold text-on-surface">{formatKrw(row.amount)}</p>
                      {hasItems && (
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                          {expanded ? "expand_less" : "expand_more"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-container">
                    <div className={`h-full rounded-full ${row.barClass}`} style={{ width: `${row.percent}%` }} />
                  </div>
                </button>

                {expanded && (
                  <div className="mt-3 space-y-2 border-t border-outline-variant/60 pt-3">
                    {row.items.map((expense) => {
                      const payerName = getMemberName(members, expense.paidByUid, "");
                      return (
                        <article key={expense.id} className="rounded-xl border border-outline-variant/60 bg-white/80 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-on-surface">{expense.description || row.meta.label}</p>
                              <p className="mt-0.5 text-[11px] text-on-surface-variant">
                                {payerName ? `${payerName} 결제 · ` : ""}
                                {formatPaidDate(expense.paidAt)}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold text-on-surface">{formatKrw(effectiveKrw(expense))}</p>
                              <p className="mt-0.5 text-[11px] font-semibold text-on-surface-variant">
                                {expense.status === "confirmed" ? "정산완료" : expense.status === "requested" ? "요청중" : "미정산"}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
function TopCategoryCard({
  topCategory,
  amount,
  total,
  onClick,
}: {
  topCategory: ExpenseCategory | null;
  amount: number;
  total: number;
  onClick?: () => void;
}) {
  const hasData = topCategory !== null && total > 0;
  const meta = hasData ? CATEGORY_META[topCategory] : CATEGORY_META.etc;
  const percent = hasData ? Math.round((amount / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasData}
      className="glass-panel relative p-4 rounded-xl flex flex-col justify-between h-32 w-full text-left transition-colors hover:bg-white/60 active:scale-[0.98] disabled:cursor-default disabled:hover:bg-transparent disabled:active:scale-100"
    >
      {hasData && (
        <span className="absolute right-1.5 top-1 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
        </span>
      )}
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
    </button>
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
        <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-background shadow-sm sm:border-x px-4 pt-20 pb-32 space-y-6">
          <SettleSkeleton />
        </div>
      }
    >
      <SettleContent />
    </Suspense>
  );
}
