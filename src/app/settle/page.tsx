"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
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
import {
  CATEGORY_META,
  type Expense,
  type ExpenseCategory,
  effectiveKrw,
  formatKrw,
  fromDoc,
} from "@/lib/expenses";
import { isAdminUid } from "@/lib/admin";
import { Edit2, Trash2 } from "lucide-react";

// ---------- 트립 데이터 (settle에서 필요한 최소 필드) ----------

interface TripData {
  id: string;
  name?: string;
  members?: Record<string, string>;
  memberUids?: string[];
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

function formatPaidDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
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
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
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

  const isInitialLoading =
    authLoading || tripLoading || (expensesLoading && expenses.length === 0);

  const closeAllSwipes = (exceptId?: string) => {
    swipeRefs.current.forEach((handle, id) => {
      if (id !== exceptId) handle?.close();
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
              <div className="space-y-3">
                {filteredExpenses.map((exp) => {
                  const canManage = canManageExpense(exp);
                  const card = (
                    <ExpenseCard
                      expense={exp}
                      members={trip?.members ?? EMPTY_MEMBERS}
                      memberPhotos={memberPhotos}
                      canManage={canManage}
                      onMenuClick={() => {
                        closeAllSwipes(exp.id);
                        swipeRefs.current.get(exp.id)?.toggle();
                      }}
                    />
                  );

                  if (!canManage) {
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

      <BottomNav />
    </div>
  );
}

// ---------- 하위 프레젠테이션 컴포넌트 ----------

function ExpenseCard({
  expense,
  members,
  memberPhotos,
  canManage = false,
  onMenuClick,
}: {
  expense: Expense;
  members: Record<string, string>;
  memberPhotos: Record<string, string | null>;
  canManage?: boolean;
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
      // Phase 5에서 편집 다이얼로그 연결
      onClick={() => {}}
      className="glass-panel p-4 rounded-xl flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-all active:scale-[0.99]"
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
      {canManage && (
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
      )}
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
    
