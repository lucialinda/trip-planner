"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type FirestoreError,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { AddExpenseDialog } from "@/components/AddExpenseDialog";
import {
  CATEGORY_META,
  type Expense,
  type ExpenseCategory,
  effectiveKrw,
  formatKrw,
  formatPaidAt,
  fromDoc,
} from "@/lib/expenses";

// ---------- 트립 데이터 (settle에서 필요한 최소 필드) ----------

interface TripData {
  id: string;
  name?: string;
  members?: Record<string, string>;
  memberUids?: string[];
  budgetPerPerson?: number;
}

// ---------- 상수 ----------

const EMPTY_MEMBERS: Record<string, string> = {};

// ---------- 필터 ----------

type FilterKey = "all" | "tentative" | "confirmed";
const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "모두보기" },
  { key: "tentative", label: "미정산" },
  { key: "confirmed", label: "정산완료" },
];

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
  const [sortKey, setSortKey] = useState<"date" | "amount" | "payer">("date");
  const [addOpen, setAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

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

  // 집계
  const memberCount = useMemo(
    () => Object.keys(trip?.members ?? {}).length,
    [trip]
  );

  const { total, byCategory, topCategory, perPerson, settlement } = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + effectiveKrw(e), 0);
    const byCategory: Record<ExpenseCategory, number> = {
      food: 0, cafe: 0, transit: 0, lodging: 0, activity: 0, shopping: 0, etc: 0,
    };
    for (const e of expenses) { byCategory[e.category] += effectiveKrw(e); }
    let topCategory: ExpenseCategory | null = null;
    let topAmount = 0;
    (Object.keys(byCategory) as ExpenseCategory[]).forEach((c) => {
      if (byCategory[c] > topAmount) { topAmount = byCategory[c]; topCategory = c; }
    });
    const perPerson = memberCount > 0 ? total / memberCount : 0;

    // ── 정산 계산: 누가 누구한테 얼마 ──
    // 1) 멤버별 총 결제액
    const paid: Record<string, number> = {};
    const members = trip?.members ?? {};
    Object.keys(members).forEach((uid) => { paid[uid] = 0; });
    for (const e of expenses) {
      if (e.paidByUid) paid[e.paidByUid] = (paid[e.paidByUid] ?? 0) + effectiveKrw(e);
    }
    // 2) 순 잔액 = 낸 돈 - 공평 몫
    const balances: { uid: string; name: string; net: number }[] = Object.entries(members).map(([uid, name]) => ({
      uid, name: String(name), net: Math.round((paid[uid] ?? 0) - perPerson),
    }));
    // 3) 최소 거래 계산 (greedy)
    const creditors = balances.filter((b) => b.net > 0).sort((a, b) => b.net - a.net);
    const debtors   = balances.filter((b) => b.net < 0).sort((a, b) => a.net - b.net);
    const transfers: { from: string; to: string; amount: number }[] = [];
    const cr = creditors.map((c) => ({ ...c }));
    const dr = debtors.map((d)   => ({ ...d }));
    let ci = 0, di = 0;
    while (ci < cr.length && di < dr.length) {
      const amount = Math.min(cr[ci].net, -dr[di].net);
      if (amount > 100) {
        transfers.push({ from: dr[di].name, to: cr[ci].name, amount: Math.round(amount) });
      }
      cr[ci].net -= amount;
      dr[di].net += amount;
      if (Math.abs(cr[ci].net) < 100) ci++;
      if (Math.abs(dr[di].net) < 100) di++;
    }
    return { total, byCategory, topCategory, perPerson, settlement: { paid, balances, transfers } };
  }, [expenses, memberCount, trip]);

  const filteredExpenses = useMemo(() => {
    const base = filter === "all"
      ? expenses
      : expenses.filter((e) => e.status === filter);
    return [...base].sort((a, b) => {
      if (sortKey === "amount") return effectiveKrw(b) - effectiveKrw(a);
      if (sortKey === "payer") return (a.paidBy ?? "").localeCompare(b.paidBy ?? "", "ko");
      // date (기본): 최신순
      return (b.paidAt?.getTime?.() ?? 0) - (a.paidAt?.getTime?.() ?? 0);
    });
  }, [expenses, filter, sortKey]);

  const isInitialLoading =
    authLoading || tripLoading || (expensesLoading && expenses.length === 0);

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
          // Phase 4에서 설정 다이얼로그 연결 (현재 noop)
          onClick={() => {}}
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
            {/* Hero: 총 지출 + 예산 진행률 */}
            <section className="relative overflow-hidden glass-elevated rounded-xl p-6 text-center">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-tertiary/5 pointer-events-none" />
              {(() => {
                const budgetPer = trip?.budgetPerPerson ?? 2500000;
                const budget = budgetPer * memberCount;
                const pct = budget > 0 ? Math.min(Math.round((total / budget) * 100), 100) : 0;
                const overBudget = total > budget && budget > 0;
                const statusLabel = overBudget ? "초과" : pct >= 80 ? "예산 임박" : pct >= 50 ? "주의" : "안정";
                const statusColor = overBudget ? "text-red-600" : pct >= 80 ? "text-amber-600" : pct >= 50 ? "text-amber-500" : "text-green-600";
                const barColor = overBudget ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-primary";
                return (
                  <>
                    <p className="text-on-surface-variant text-xs font-medium mb-1 tracking-wide uppercase">총 지출</p>
                    <h2 className="text-4xl font-extrabold text-primary tracking-tight mb-1">{formatKrw(total)}</h2>

                    {/* 예산 라인 + 편집 버튼 */}
                    {budgetEditOpen ? (
                      <div className="flex items-center justify-center gap-2 mb-3">
                        <span className="text-xs text-on-surface-variant">1인당</span>
                        <input
                          autoFocus
                          type="number"
                          value={budgetInput}
                          onChange={(e) => setBudgetInput(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              const val = parseInt(budgetInput.replace(/,/g, ""), 10);
                              if (!isNaN(val) && val > 0 && tripId) {
                                await updateDoc(doc(db, "trips", tripId), { budgetPerPerson: val });
                                toast.success("예산이 업데이트됐어요!");
                              }
                              setBudgetEditOpen(false);
                            }
                            if (e.key === "Escape") setBudgetEditOpen(false);
                          }}
                          placeholder="예: 2500000"
                          className="w-32 text-center border border-primary/40 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-primary"
                        />
                        <span className="text-xs text-on-surface-variant">원</span>
                        <button
                          onClick={async () => {
                            const val = parseInt(budgetInput.replace(/,/g, ""), 10);
                            if (!isNaN(val) && val > 0 && tripId) {
                              await updateDoc(doc(db, "trips", tripId), { budgetPerPerson: val });
                              toast.success("예산이 업데이트됐어요!");
                            }
                            setBudgetEditOpen(false);
                          }}
                          className="text-xs bg-primary text-white px-2 py-1 rounded-lg"
                        >확인</button>
                        <button onClick={() => setBudgetEditOpen(false)} className="text-xs text-slate-400">취소</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5 mb-3">
                        <p className="text-xs text-on-surface-variant">
                          예산 {formatKrw(budget)} ({memberCount}인 × {formatKrw(budgetPer)})
                        </p>
                        <button
                          onClick={() => { setBudgetInput(String(budgetPer)); setBudgetEditOpen(true); }}
                          className="text-primary/60 hover:text-primary transition-colors"
                          aria-label="예산 수정"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                      </div>
                    )}

                    {/* 예산 진행 바 */}
                    <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
                      <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>

                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                      overBudget ? "bg-red-50 border-red-200 text-red-600" :
                      pct >= 80  ? "bg-amber-50 border-amber-200 text-amber-700" :
                      pct >= 50  ? "bg-amber-50/60 border-amber-100 text-amber-600" :
                                   "bg-primary/10 border-primary/20 text-primary"
                    }`}>
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {overBudget ? "warning" : pct >= 80 ? "notifications" : "trending_up"}
                      </span>
                      <span className="text-[12px] font-bold">예산의 {pct}% 사용</span>
                      <span className={`text-[11px] font-semibold ${statusColor}`}>· {statusLabel}</span>
                    </div>
                  </>
                );
              })()}
            </section>

            {/* 요약 카드 3열 */}
            {(() => {
              const budget = (trip?.budgetPerPerson ?? 2500000) * memberCount;
              const remaining = budget - total;
              const tripDays = (() => {
                const members = trip?.members;
                if (!members) return 11;
                return 11; // 포르투갈&니스 11일
              })();
              const dailyAvg = tripDays > 0 ? total / tripDays : 0;
              return (
                <div className="grid grid-cols-3 gap-3">
                  <div className="glass-panel p-3 rounded-xl flex flex-col gap-1">
                    <span className="material-symbols-outlined text-green-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>savings</span>
                    <p className="text-[10px] text-on-surface-variant">남은 예산</p>
                    <p className={`font-bold text-sm ${remaining < 0 ? "text-red-500" : "text-green-600"}`}>
                      {remaining < 0 ? "-" : ""}{formatKrw(Math.abs(remaining))}
                    </p>
                  </div>
                  <div className="glass-panel p-3 rounded-xl flex flex-col gap-1">
                    <span className="material-symbols-outlined text-amber-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>today</span>
                    <p className="text-[10px] text-on-surface-variant">하루 평균</p>
                    <p className="font-bold text-sm text-on-surface">{formatKrw(dailyAvg)}</p>
                  </div>
                  <div className="glass-panel p-3 rounded-xl flex flex-col gap-1">
                    <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
                    <p className="text-[10px] text-on-surface-variant">1인당</p>
                    <p className="font-bold text-sm text-on-surface">{formatKrw(perPerson)}</p>
                  </div>
                </div>
              );
            })()}

            {/* 카테고리 분포 */}
            {total > 0 && (
              <div className="glass-panel p-4 rounded-xl">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">카테고리별 지출</p>
                <div className="space-y-2">
                  {(Object.entries(byCategory) as [ExpenseCategory, number][])
                    .filter(([, amt]) => amt > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, amt]) => {
                      const meta = CATEGORY_META[cat];
                      const pct = Math.round((amt / total) * 100);
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-sm text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>{meta.icon}</span>
                              <span className="text-xs font-medium text-on-surface">{meta.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-on-surface-variant">{pct}%</span>
                              <span className="text-xs font-bold text-on-surface">{formatKrw(amt)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 최종 정산 섹션 */}
            {settlement.transfers.length > 0 && (
              <div className="glass-panel p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
                  <p className="text-sm font-bold text-on-surface">최종 정산</p>
                  <span className="text-[10px] text-on-surface-variant bg-slate-100 px-2 py-0.5 rounded-full ml-auto">
                    {settlement.transfers.length}건
                  </span>
                </div>
                <div className="space-y-2">
                  {settlement.transfers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 py-2 border-b border-outline-variant/20 last:border-0">
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-sm font-semibold text-on-surface">{t.from}</span>
                        <span className="material-symbols-outlined text-primary text-base">arrow_forward</span>
                        <span className="text-sm font-semibold text-on-surface">{t.to}</span>
                      </div>
                      <span className="text-sm font-extrabold text-primary">{formatKrw(t.amount)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-on-surface-variant mt-3 text-center">
                  * 누락된 지출이 있으면 정산 금액이 변경될 수 있어요<br/>
                  * 원 단위 반올림으로 1원 차이가 자동 보정됩니다
                </p>
              </div>
            )}

            {/* 멤버별 결제 현황 */}
            {memberCount > 0 && total > 0 && (
              <div className="glass-panel p-4 rounded-xl">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">멤버별 결제 현황</p>
                <div className="space-y-2.5">
                  {settlement.balances.map((b) => {
                    const paidAmt = (settlement.paid[b.uid] ?? 0);
                    const pct = total > 0 ? Math.round((paidAmt / total) * 100) : 0;
                    const isCreditor = b.net > 0;
                    const isDebtor = b.net < 0;
                    return (
                      <div key={b.uid}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                              {b.name.charAt(0)}
                            </div>
                            <span className="text-xs font-medium text-on-surface">{b.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-on-surface-variant">{formatKrw(paidAmt)} 결제</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              isCreditor ? "bg-green-100 text-green-700" :
                              isDebtor   ? "bg-red-100 text-red-600" :
                              "bg-slate-100 text-slate-500"
                            }`}>
                              {isCreditor ? `+${formatKrw(b.net)} 받을 예정` :
                               isDebtor   ? `${formatKrw(b.net)} 보낼 예정` : "정산 완료"}
                            </span>
                          </div>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 지출 내역 헤더 + 정렬 */}
            <div className="flex items-center justify-between pt-2">
              <h3 className="text-lg font-bold text-on-surface">지출 내역</h3>
              <div className="flex items-center gap-1">
                {(["date", "amount", "payer"] as const).map((key) => {
                  const labels = { date: "최신순", amount: "금액순", payer: "결제자순" };
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSortKey(key)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                        sortKey === key
                          ? "bg-primary text-white"
                          : "text-on-surface-variant hover:bg-primary/10"
                      }`}
                    >
                      {labels[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 필터 칩 (모두보기 / 미정산 / 정산완료) */}
            <div className="flex gap-2">
              {FILTER_OPTIONS.map((opt) => {
                const active = filter === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFilter(opt.key)}
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

            {/* 리스트 */}
            {expenses.length === 0 ? (
              <EmptyState />
            ) : filteredExpenses.length === 0 ? (
              <FilterEmptyState />
            ) : (
              <div className="space-y-2">
                {filteredExpenses.map((exp) => (
                  <ExpenseCard
                    key={exp.id}
                    expense={exp}
                    myUid={user?.uid ?? ""}
                    memberCount={memberCount}
                    onEdit={() => setEditingExpense(exp)}
                  />
                ))}
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
          enabledCurrencies={["KRW", "EUR", "USD"]}
          defaultCurrency="EUR"
        />
      )}

      {/* 수정 다이얼로그 */}
      {trip && tripId && editingExpense && (
        <AddExpenseDialog
          open={!!editingExpense}
          onOpenChange={(open) => { if (!open) setEditingExpense(null); }}
          tripId={tripId}
          members={trip.members ?? EMPTY_MEMBERS}
          editingExpense={editingExpense}
          onDeleted={() => setEditingExpense(null)}
          enabledCurrencies={["KRW", "EUR", "USD"]}
        />
      )}

      <BottomNav />
    </div>
  );
}

// ---------- 하위 프레젠테이션 컴포넌트 ----------

function ExpenseCard({ expense, myUid, memberCount, onEdit }: {
  expense: Expense; myUid: string; memberCount: number; onEdit: () => void;
}) {
  const meta = CATEGORY_META[expense.category];
  const isConfirmed = expense.status === "confirmed";
  const krw = effectiveKrw(expense);
  const participantCount = Object.keys(expense.participants ?? {}).length || memberCount || 1;
  const myBurden = Math.round(krw / participantCount);
  const isMyExpense = expense.paidByUid === myUid;

  // 제목에서 이모지 제거 (앞쪽 이모지+공백 패턴)
  const cleanTitle = (expense.description || meta.label).replace(/^[\p{Emoji}\s]+/u, "").trim();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onEdit(); }}
      className="bg-white/70 border border-slate-100 rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:border-primary/30 hover:bg-white/90 transition-all active:scale-[0.99]"
    >
      {/* 카테고리 아이콘 */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.iconBoxClass}`}>
        <span className="material-symbols-outlined text-lg">{meta.icon}</span>
      </div>

      {/* 본문 */}
      <div className="flex-1 min-w-0">
        {/* 1행: 제목 */}
        <h4 className="text-on-surface font-semibold text-sm truncate">{cleanTitle}</h4>

        {/* 2행: 결제자 · 날짜 */}
        <p className="text-xs text-slate-400 mt-0.5">
          {expense.paidBy} 결제 · {formatPaidAt(expense.paidAt)} · {participantCount}명 분할
        </p>

        {/* 3행: 내 부담 */}
        <p className="text-xs mt-1.5">
          <span className="font-semibold text-on-surface">내 부담 {formatKrw(myBurden)}</span>
          {isMyExpense && participantCount > 1 && (
            <span className="text-green-600 ml-1">· +{formatKrw(krw - myBurden)} 받을 예정</span>
          )}
        </p>
      </div>

      {/* 오른쪽: 금액 + 상태 배지 */}
      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
        <p className="text-on-surface font-bold text-sm">{formatKrw(krw)}</p>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          isConfirmed
            ? "bg-green-100 text-green-700"
            : "bg-primary/10 text-primary"
        }`}>
          {isConfirmed ? "정산완료" : "미정산"}
        </span>
      </div>
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
    