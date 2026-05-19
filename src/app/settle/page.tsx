"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  orderBy,
  query,
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
  settlementDefaultCurrency: string;
  settlementDefaultRate: string;
}

interface SettlementTransfer {
  fromName: string;
  toName: string;
  amount: number;
}

interface SettlementPreview {
  title: string;
  text: string;
  total: number;
  transfers: SettlementTransfer[];
  details: string[];
}

// ---------- 상수 ----------

const EMPTY_MEMBERS: Record<string, string> = {};
const DEFAULT_SETTLEMENT_SETTINGS: SettlementSettings = {
  settlementAccountBank: "",
  settlementAccountNumber: "",
  settlementAccountHolder: "",
  settlementDefaultCurrency: "USD",
  settlementDefaultRate: "1",
};

// ---------- 필터 ----------

type FilterKey = "all" | "tentative" | "confirmed";
const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "모두보기" },
  { key: "tentative", label: "미정산" },
  { key: "confirmed", label: "정산완료" },
];

function formatPaidDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function normalizeSettlementSettings(data: Record<string, unknown> | undefined): SettlementSettings {
  return {
    settlementAccountBank:
      typeof data?.settlementAccountBank === "string" ? data.settlementAccountBank : "",
    settlementAccountNumber:
      typeof data?.settlementAccountNumber === "string" ? data.settlementAccountNumber : "",
    settlementAccountHolder:
      typeof data?.settlementAccountHolder === "string" ? data.settlementAccountHolder : "",
    settlementDefaultCurrency:
      typeof data?.settlementDefaultCurrency === "string" && data.settlementDefaultCurrency
        ? data.settlementDefaultCurrency
        : DEFAULT_SETTLEMENT_SETTINGS.settlementDefaultCurrency,
    settlementDefaultRate:
      typeof data?.settlementDefaultRate === "string" && data.settlementDefaultRate
        ? data.settlementDefaultRate
        : DEFAULT_SETTLEMENT_SETTINGS.settlementDefaultRate,
  };
}

function getSettlementAccountLine(settings: SettlementSettings) {
  const bank = settings.settlementAccountBank.trim();
  const number = settings.settlementAccountNumber.trim();
  const holder = settings.settlementAccountHolder.trim();
  if (!bank && !number && !holder) return "송금 계좌: 정산 설정에서 계좌를 입력해 주세요.";
  return `송금 계좌: ${[bank, number, holder].filter(Boolean).join(" ")}`;
}

function buildSettlementPreview({
  tripName,
  members,
  expenses,
  settings,
  pageUrl,
}: {
  tripName: string;
  members: Record<string, string>;
  expenses: Expense[];
  settings: SettlementSettings;
  pageUrl: string;
}): SettlementPreview {
  const memberUids = Object.keys(members);
  const total = expenses.reduce((sum, expense) => sum + effectiveKrw(expense), 0);
  const transferMap = new Map<string, { fromName: string; toName: string; amount: number }>();

  for (const expense of expenses) {
    const participantUids = getParticipantUids(expense, memberUids);
    if (participantUids.length === 0) continue;
    const share = Math.round(effectiveKrw(expense) / participantUids.length);
    for (const uid of participantUids) {
      if (uid === expense.paidByUid) continue;
      const key = `${uid}->${expense.paidByUid}`;
      const prev = transferMap.get(key);
      transferMap.set(key, {
        fromName: members[uid] ?? "이름 없음",
        toName: members[expense.paidByUid] ?? expense.paidBy ?? "결제자",
        amount: (prev?.amount ?? 0) + share,
      });
    }
  }

  const transfers = Array.from(transferMap.values()).filter((item) => item.amount > 0);
  const details = expenses.map(
    (expense) =>
      `${expense.description || CATEGORY_META[expense.category].label}: ${formatKrw(effectiveKrw(expense))} (${expense.paidBy} 결제)`
  );
  const transferLines = transfers.map(
    (transfer) => `- ${transfer.fromName} -> ${transfer.toName}: ${formatKrw(transfer.amount)}`
  );
  const currencyLine = `기본 통화/환율: ${settings.settlementDefaultCurrency || "USD"} / ${settings.settlementDefaultRate || "1"}`;
  const title = `${tripName} 정산 요청`;
  const text = [
    `[${title}]`,
    `선택한 미정산 내역 ${expenses.length}건`,
    `총 지출 금액: ${formatKrw(total)}`,
    currencyLine,
    getSettlementAccountLine(settings),
    "",
    "보낼 금액",
    transferLines.join("\n") || "- 정산 대상 없음",
    "",
    "선택 내역",
    details.map((line) => `- ${line}`).join("\n"),
    pageUrl ? `\n정산 페이지: ${pageUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { title, text, total, transfers, details };
}

// ---------- Page ----------

function SettleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripId = searchParams.get("id");
  const { user, loading: authLoading } = useAuth();

  const [trip, setTrip] = useState<TripData | null>(null);
  const [tripLoading, setTripLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expensesError, setExpensesError] = useState<FirestoreError | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [settlementSettings, setSettlementSettings] = useState<SettlementSettings>(DEFAULT_SETTLEMENT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<SettlementSettings>(DEFAULT_SETTLEMENT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settlementPreview, setSettlementPreview] = useState<SettlementPreview | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(
    () => new Set()
  );
  const [memberPhotos, setMemberPhotos] = useState<Record<string, string | null>>({});
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
    const members = trip?.members ?? {};
    const uids = Object.keys(members);
    if (!uids.length) {
      setMemberPhotos({});
      return;
    }

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "userProfiles", uid));
            const url = snap.exists() ? (snap.data()?.photoURL ?? null) : null;
            return [uid, url] as const;
          } catch {
            return [uid, null] as const;
          }
        })
      );
      if (!cancelled) setMemberPhotos(Object.fromEntries(entries));
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
    () =>
      filter === "all"
        ? expenses
        : expenses.filter((e) => e.status === filter),
    [expenses, filter]
  );

  const selectedExpenses = useMemo(
    () => expenses.filter((expense) => selectedExpenseIds.has(expense.id)),
    [expenses, selectedExpenseIds]
  );

  const enabledExpenseCurrencies = useMemo(
    () => Array.from(new Set(["KRW", settlementSettings.settlementDefaultCurrency, "JPY"])),
    [settlementSettings.settlementDefaultCurrency]
  );

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
      settlementDefaultCurrency: settingsDraft.settlementDefaultCurrency.trim().toUpperCase() || "USD",
      settlementDefaultRate: settingsDraft.settlementDefaultRate.trim() || "1",
    };
    const rate = Number(draft.settlementDefaultRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error("환율은 0보다 큰 숫자로 입력해 주세요.");
      return;
    }

    setSettingsSaving(true);
    try {
      await setDoc(doc(db, "userProfiles", user.uid), draft, { merge: true });
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

    const preview = buildSettlementPreview({
      tripName: trip?.name ?? "여행",
      members: trip?.members ?? EMPTY_MEMBERS,
      expenses: selectedExpenses,
      settings: settlementSettings,
      pageUrl: typeof window !== "undefined" ? window.location.href : "",
    });
    setSettlementPreview(preview);
    setPreviewOpen(true);
  };

  const handleConfirmShareSettlementRequest = async () => {
    if (!settlementPreview) return;
    const { title, text } = settlementPreview;

    try {
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
        return;
      }

      await copyTextToClipboard(text);
      toast.success("정산 요청 메시지를 복사했어요.");
      setPreviewOpen(false);
      setSettlementPreview(null);
      exitSelectionMode();
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      try {
        await copyTextToClipboard(text);
        toast.success("공유창을 열지 못해서 정산 요청 메시지를 복사했어요.");
        setPreviewOpen(false);
        setSettlementPreview(null);
        exitSelectionMode();
      } catch (copyError: unknown) {
        const message = copyError instanceof Error ? copyError.message : String(copyError);
        toast.error(`정산 요청 실패: ${message}`);
      }
    }
  };
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col overflow-x-hidden bg-background shadow-sm sm:border-x">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-white/80 backdrop-blur-md p-4 border-b border-outline-variant/30">
        <button
          type="button"
          onClick={() => {
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
          정산
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
                  {/* Phase 6: 정산 방식 모달 트리거 자리 */}
                  <button
                    type="button"
                    aria-label="정산 방식"
                    onClick={() => {}}
                    className="text-on-surface-variant/60 hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">tune</span>
                  </button>
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

            {/* 지출 내역 헤더 + 정렬 토글 */}
            <div className="flex items-center justify-between pt-2">
              <h3 className="text-lg font-bold text-on-surface">지출 내역</h3>
              <button
                type="button"
                // Phase 5 이후 정렬 동작 연결
                onClick={() => {}}
                className="text-primary text-sm font-semibold flex items-center gap-1"
              >
                최신순
                <span className="material-symbols-outlined text-base">expand_more</span>
              </button>
            </div>

            {/* 필터 칩 (모두보기 / 미정산 / 정산완료) */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap gap-2">
                {FILTER_OPTIONS.map((opt) => {
                  const active = filter === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setFilter(opt.key);
                        if (opt.key !== "tentative") exitSelectionMode();
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
              {filter === "tentative" && filteredExpenses.length > 0 && (
                <div className="flex shrink-0 items-center gap-1.5">
                  {selectionMode ? (
                    <>
                      <button
                        type="button"
                        onClick={exitSelectionMode}
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        closeAllSwipes();
                        setSelectionMode(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                    >
                      <CircleCheck className="h-3.5 w-3.5" />
                      선택
                    </button>
                  )}
                </div>
              )}
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
      </main>

      {/* FAB */}
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

      {/* 추가 다이얼로그 (Phase 3) */}
      {trip && tripId && (
        <AddExpenseDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          tripId={tripId}
          members={trip.members ?? EMPTY_MEMBERS}
          enabledCurrencies={enabledExpenseCurrencies}
          defaultCurrency={settlementSettings.settlementDefaultCurrency}
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

      <SettlementPreviewDialog
        open={previewOpen}
        preview={settlementPreview}
        onOpenChange={setPreviewOpen}
        onConfirm={handleConfirmShareSettlementRequest}
      />

      <BottomNav />
    </div>
  );
}

// ---------- 하위 프레젠테이션 컴포넌트 ----------

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

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-on-surface">결제 통화</label>
              <select
                value={settings.settlementDefaultCurrency}
                onChange={(e) => update("settlementDefaultCurrency", e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="USD">USD</option>
                <option value="JPY">JPY</option>
                <option value="EUR">EUR</option>
                <option value="KRW">KRW</option>
                <option value="TWD">TWD</option>
                <option value="THB">THB</option>
                <option value="VND">VND</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-on-surface">기본 환율</label>
              <Input
                inputMode="decimal"
                value={settings.settlementDefaultRate}
                onChange={(e) => update("settlementDefaultRate", e.target.value)}
                placeholder="1"
              />
            </div>
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
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  preview: SettlementPreview | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle>정산 요청 미리보기</DialogTitle>
        </DialogHeader>
        {preview && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
              <p className="text-xs text-on-surface-variant">총 요청 내역</p>
              <p className="mt-1 text-xl font-bold text-primary">{formatKrw(preview.total)}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-on-surface">보낼 금액</p>
              <div className="space-y-1.5">
                {preview.transfers.length > 0 ? (
                  preview.transfers.map((transfer, idx) => (
                    <div key={`${transfer.fromName}-${transfer.toName}-${idx}`} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 text-sm">
                      <span className="text-on-surface">{transfer.fromName} &rarr; {transfer.toName}</span>
                      <span className="font-bold text-on-surface">{formatKrw(transfer.amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg bg-white/60 px-3 py-2 text-sm text-on-surface-variant">정산 대상이 없어요.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-on-surface">공유 메시지</p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-outline-variant/60 bg-white/70 p-3 text-xs leading-relaxed text-on-surface-variant">
                {preview.text}
              </pre>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button type="button" className="flex-1 gap-1.5" onClick={onConfirm}>
                <Send className="h-4 w-4" />
                확인
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
            isConfirmed ? "text-tertiary" : "text-primary"
          }`}
        >
          {isConfirmed ? "정산 완료" : "정산 예정"}
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
    
