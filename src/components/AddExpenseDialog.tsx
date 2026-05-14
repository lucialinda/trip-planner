"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { addDoc, collection, doc, deleteDoc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORY_META,
  type Expense,
  type ExpenseCategory,
} from "@/lib/expenses";
import {
  ALL_CURRENCIES,
  getCurrencyMeta,
} from "@/lib/currencies";
import {
  fetchKrwRate,
  getCachedKrwRate,
} from "@/lib/exchangeRate";

// ---------- 상수 ----------

const DEBOUNCE_MS = 400;
const ALL_CATEGORIES: ExpenseCategory[] = [
  "food",
  "cafe",
  "transit",
  "lodging",
  "activity",
  "shopping",
  "etc",
];

// ---------- props ----------

export interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  /** trip.members ({ uid: displayName }) */
  members: Record<string, string>;
  /** 수정 모드: 기존 지출 데이터를 넣으면 편집 다이얼로그로 동작 */
  editingExpense?: Expense | null;
  /** 수정 모드에서 삭제 콜백 */
  onDeleted?: () => void;
  /** Phase 4 settings 도입 전이라 기본은 전체 카테고리. */
  enabledCategories?: ExpenseCategory[];
  /** Phase 4 settings 도입 전이라 기본은 KRW + JPY. */
  enabledCurrencies?: string[];
  /** 기본 통화 (없으면 enabledCurrencies 중 첫 비-KRW, 그것도 없으면 "KRW") */
  defaultCurrency?: string;
}

// ---------- 헬퍼 ----------

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pickInitialCurrency(
  enabled: string[],
  defaultCurrency: string | undefined,
): string {
  if (defaultCurrency && enabled.includes(defaultCurrency)) return defaultCurrency;
  const nonKrw = enabled.find((c) => c !== "KRW");
  return nonKrw ?? "KRW";
}

// ---------- 컴포넌트 ----------

export function AddExpenseDialog({
  open,
  onOpenChange,
  tripId,
  members,
  editingExpense = null,
  onDeleted,
  enabledCategories = ALL_CATEGORIES,
  enabledCurrencies = ["KRW", "JPY"],
  defaultCurrency,
}: AddExpenseDialogProps) {
  const { user } = useAuth();

  const memberUids = useMemo(() => Object.keys(members), [members]);
  const initialCurrency = useMemo(
    () => pickInitialCurrency(enabledCurrencies, defaultCurrency),
    [enabledCurrencies, defaultCurrency],
  );

  // ---------- form state ----------
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [description, setDescription] = useState("");
  const [localCurrency, setLocalCurrency] = useState<string>(initialCurrency);
  const [localAmount, setLocalAmount] = useState<string>("");
  const [krwAmount, setKrwAmount] = useState<string>("");
  const [krwManuallyEdited, setKrwManuallyEdited] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState(false);
  const [paidByUid, setPaidByUid] = useState<string>("");
  const [paidAtLocal, setPaidAtLocal] = useState<string>("");
  const [participants, setParticipants] = useState<Record<string, true>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEditMode = !!editingExpense;

  // ---------- 다이얼로그 열릴 때 초기화 ----------
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!open) return;
    if (editingExpense) {
      // 수정 모드: 기존 데이터로 채우기
      setCategory(editingExpense.category);
      setDescription(editingExpense.description);
      setLocalCurrency(editingExpense.localCurrency);
      setLocalAmount(String(editingExpense.localAmount));
      setKrwAmount(String(editingExpense.krwAmount));
      setKrwManuallyEdited(false);
      setRate(editingExpense.rate ?? null);
      setRateLoading(false);
      setRateError(false);
      setPaidByUid(editingExpense.paidByUid);
      setPaidAtLocal(toDatetimeLocalValue(editingExpense.paidAt));
      setParticipants(editingExpense.participants ?? {});
    } else {
      // 추가 모드: 초기화
      const me = user?.uid ?? memberUids[0] ?? "";
      setCategory(null);
      setDescription("");
      setLocalCurrency(initialCurrency);
      setLocalAmount("");
      setKrwAmount("");
      setKrwManuallyEdited(false);
      setRate(initialCurrency === "KRW" ? 1 : getCachedKrwRate(initialCurrency) ?? null);
      setRateLoading(false);
      setRateError(false);
      setPaidByUid(me);
      setPaidAtLocal(toDatetimeLocalValue(new Date()));
      const init: Record<string, true> = {};
      for (const uid of memberUids) init[uid] = true;
      setParticipants(init);
    }
    setSaving(false);
    setDeleting(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editingExpense, user, memberUids, initialCurrency]);

  // ---------- 환율 fetch (debounce) — KRW는 핸들러에서 직접 동기화하므로 비-KRW만 ----------
  useEffect(() => {
    if (!open) return;
    if (localCurrency === "KRW") return;

    const amountNum = parseFloat(localAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setRateLoading(true);
      try {
        const r = await fetchKrwRate(localCurrency);
        if (cancelled) return;
        setRate(r);
        setRateError(false);
        if (!krwManuallyEdited) {
          const computed = Math.round(amountNum * r);
          setKrwAmount(String(computed));
        }
      } catch (e) {
        console.error("[AddExpenseDialog] fetchKrwRate failed", e);
        if (cancelled) return;
        setRateError(true);
        toast.error("환율 조회 실패. 원화를 직접 입력해주세요.");
      } finally {
        if (!cancelled) setRateLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, localAmount, localCurrency, krwManuallyEdited]);

  // ---------- 핸들러 ----------

  const handleLocalAmountChange = (value: string) => {
    setLocalAmount(value);
    // KRW면 즉시 1:1 동기화 (수동 수정 안 한 경우만)
    if (localCurrency === "KRW" && !krwManuallyEdited) {
      setKrwAmount(value);
    }
  };

  const handleCurrencyChange = (newCurrency: string) => {
    setLocalCurrency(newCurrency);
    setKrwManuallyEdited(false);
    setRateError(false);
    setRateLoading(false);
    if (newCurrency === "KRW") {
      setRate(1);
      setKrwAmount(localAmount); // 즉시 1:1 동기화
    } else {
      // 비-KRW로 바뀌면 캐시된 환율이 있으면 즉시 표시, 없으면 effect의 fetch가 채움
      const cached = getCachedKrwRate(newCurrency);
      setRate(cached ?? null);
    }
  };

  const handlePaidByChange = (uid: string) => {
    setPaidByUid(uid);
    // 새 결제자 자동 체크
    setParticipants((prev) => ({ ...prev, [uid]: true }));
  };

  const toggleParticipant = (uid: string) => {
    if (uid === paidByUid) return; // 결제자는 해제 불가
    setParticipants((prev) => {
      const next = { ...prev };
      if (next[uid]) {
        delete next[uid];
      } else {
        next[uid] = true;
      }
      return next;
    });
  };

  const selectAllParticipants = () => {
    const next: Record<string, true> = {};
    for (const uid of memberUids) next[uid] = true;
    setParticipants(next);
  };

  const selectOnlyPayer = () => {
    setParticipants(paidByUid ? { [paidByUid]: true } : {});
  };

  const handleSave = async () => {
    if (!user) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    if (!category) {
      toast.error("카테고리를 선택해주세요.");
      return;
    }
    const desc = description.trim();
    if (!desc) {
      toast.error("어디에 썼는지 적어주세요.");
      return;
    }
    const localNum = parseFloat(localAmount);
    if (!Number.isFinite(localNum) || localNum <= 0) {
      toast.error("금액을 입력해주세요.");
      return;
    }
    const krwNum = parseFloat(krwAmount);
    if (!Number.isFinite(krwNum) || krwNum <= 0) {
      toast.error("원화 금액을 확인해주세요.");
      return;
    }
    if (!paidByUid || !members[paidByUid]) {
      toast.error("결제자를 선택해주세요.");
      return;
    }
    // 정산 인원: 결제자는 자동 포함되어 있으므로 0명 시나리오는 보호용 검증
    const finalParticipants: Record<string, true> = {
      ...participants,
      [paidByUid]: true,
    };
    if (Object.keys(finalParticipants).length === 0) {
      toast.error("정산 인원이 비어 있어요.");
      return;
    }
    let paidAt: Date;
    try {
      paidAt = new Date(paidAtLocal);
      if (isNaN(paidAt.getTime())) throw new Error("invalid date");
    } catch {
      toast.error("결제 일시가 올바르지 않아요.");
      return;
    }

    // KRW일 때 rate=1, 그 외엔 fetch한 rate가 있어야 함 (rateError 시에는 사용자 수동 입력이라
    // rate가 null일 수 있음 → localNum/krwNum로 역산)
    const effectiveRate =
      localCurrency === "KRW"
        ? 1
        : rate ?? (localNum > 0 ? krwNum / localNum : 0);

    setSaving(true);
    try {
      const payload = {
        category,
        description: desc,
        paidByUid,
        paidBy: members[paidByUid] ?? "",
        localCurrency,
        localAmount: localNum,
        rate: effectiveRate,
        krwAmount: Math.round(krwNum),
        status: "tentative",
        paidAt: Timestamp.fromDate(paidAt),
        participants: finalParticipants,
        updatedAt: serverTimestamp(),
      };

      if (isEditMode && editingExpense) {
        await updateDoc(
          doc(db, "trips", tripId, "expenses", editingExpense.id),
          payload,
        );
        toast.success("지출을 수정했어요.");
      } else {
        await addDoc(collection(db, "trips", tripId, "expenses"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("지출을 추가했어요.");
      }
      onOpenChange(false);
    } catch (e) {
      console.error("[AddExpenseDialog] save failed", e);
      toast.error("저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  // ---------- 파생값 ----------

  const currencyMeta = getCurrencyMeta(localCurrency);
  const visibleCurrencies = ALL_CURRENCIES.filter((c) =>
    enabledCurrencies.includes(c.code),
  );
  const visibleCategories = ALL_CATEGORIES.filter((c) =>
    enabledCategories.includes(c),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-md max-h-[90vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "지출 수정" : "지출 추가"}</DialogTitle>
          <DialogDescription>
            결제한 항목을 기록하면 자동으로 1/n 정산이 계산돼요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* 1. 카테고리 */}
          <section>
            <h3 className="text-xs font-semibold text-on-surface-variant mb-2">
              카테고리
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {visibleCategories.map((c) => {
                const meta = CATEGORY_META[c];
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-all ${
                      active
                        ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                        : "border-outline-variant bg-white/40 hover:border-primary/40"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[22px] ${
                        active ? "text-primary" : "text-on-surface-variant"
                      }`}
                      style={{ fontVariationSettings: active ? "'FILL' 1" : undefined }}
                    >
                      {meta.icon}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        active ? "text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. 설명 */}
          <section>
            <h3 className="text-xs font-semibold text-on-surface-variant mb-2">
              내용
            </h3>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="어디에 썼나요?"
            />
          </section>

          {/* 3. 금액 */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-on-surface-variant">금액</h3>

            <div className="flex gap-2">
              {/* 통화 select */}
              <select
                value={localCurrency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className="h-9 rounded-md border border-outline-variant bg-white/60 px-2 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                aria-label="통화 선택"
              >
                {visibleCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>

              {/* 현지 금액 */}
              <Input
                type="number"
                inputMode="decimal"
                step={currencyMeta.decimals === 0 ? "1" : "0.01"}
                min="0"
                value={localAmount}
                onChange={(e) => handleLocalAmountChange(e.target.value)}
                placeholder={currencyMeta.symbol + "금액"}
                className="flex-1"
              />
            </div>

            {/* 환율 표시 (KRW가 아닐 때만) */}
            {localCurrency !== "KRW" && (
              <div className="flex items-center justify-between text-[11px] text-on-surface-variant px-1">
                <span>
                  {rateLoading ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> 환율 불러오는 중…
                    </span>
                  ) : rateError ? (
                    <span className="text-rose-500">
                      환율을 불러오지 못했어요. 원화를 직접 입력하세요.
                    </span>
                  ) : rate !== null ? (
                    <>
                      1 {localCurrency} ≈ {rate.toFixed(2)} KRW
                      <span className="ml-1 text-on-surface-variant/60">(가환율)</span>
                    </>
                  ) : (
                    "금액을 입력하면 환율이 표시돼요"
                  )}
                </span>
              </div>
            )}

            {/* 원화 금액 */}
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={krwAmount}
                onChange={(e) => {
                  setKrwAmount(e.target.value);
                  setKrwManuallyEdited(true);
                }}
                placeholder="₩원화 금액"
              />
              {rateLoading && !krwManuallyEdited && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant/60">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                </div>
              )}
            </div>

            {krwManuallyEdited && localCurrency !== "KRW" && (
              <button
                type="button"
                onClick={() => setKrwManuallyEdited(false)}
                className="text-[11px] text-primary font-semibold underline-offset-2 hover:underline"
              >
                자동 환산으로 되돌리기
              </button>
            )}
          </section>

          {/* 4. 결제자 + 결제 일시 */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-on-surface-variant">결제 정보</h3>

            <div>
              <label className="text-[11px] text-on-surface-variant mb-1 block">
                결제자
              </label>
              <select
                value={paidByUid}
                onChange={(e) => handlePaidByChange(e.target.value)}
                className="w-full h-9 rounded-md border border-outline-variant bg-white/60 px-2 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {memberUids.map((uid) => (
                  <option key={uid} value={uid}>
                    {members[uid]}
                    {uid === user?.uid ? " (나)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-on-surface-variant mb-1 block">
                결제 일시
              </label>
              <Input
                type="datetime-local"
                value={paidAtLocal}
                onChange={(e) => setPaidAtLocal(e.target.value)}
              />
            </div>
          </section>

          {/* 5. 정산 인원 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-on-surface-variant">
                정산 인원
              </h3>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={selectAllParticipants}
                  className="text-[11px] font-semibold text-primary px-2 py-0.5 rounded-full hover:bg-primary/10"
                >
                  전원 선택
                </button>
                <button
                  type="button"
                  onClick={selectOnlyPayer}
                  className="text-[11px] font-semibold text-on-surface-variant px-2 py-0.5 rounded-full hover:bg-primary/10 hover:text-primary"
                >
                  결제자만
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {memberUids.map((uid) => {
                const checked = !!participants[uid] || uid === paidByUid;
                const locked = uid === paidByUid;
                const name = members[uid] ?? "(이름 없음)";
                return (
                  <label
                    key={uid}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "border-outline-variant bg-white/40 hover:border-primary/30"
                    } ${locked ? "opacity-90" : "cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleParticipant(uid)}
                      className="h-4 w-4 accent-primary"
                    />
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
                      {name.charAt(0)}
                    </div>
                    <span className="text-sm text-on-surface flex-1">
                      {name}
                      {uid === user?.uid && (
                        <span className="text-on-surface-variant"> (나)</span>
                      )}
                    </span>
                    {locked && (
                      <span className="text-[10px] font-semibold text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full">
                        결제자
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        {/* footer */}
        <div className="flex gap-2 pt-4">
          {isEditMode && (
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={async () => {
                if (!editingExpense) return;
                if (!confirm("이 지출을 삭제할까요?")) return;
                setDeleting(true);
                try {
                  await deleteDoc(doc(db, "trips", tripId, "expenses", editingExpense.id));
                  toast.success("지출을 삭제했어요.");
                  onOpenChange(false);
                  onDeleted?.();
                } catch (e) {
                  console.error(e);
                  toast.error("삭제에 실패했어요.");
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={saving || deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "삭제"}
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={saving || deleting}
          >
            취소
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saving || deleting}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditMode ? "수정 완료" : "저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
  