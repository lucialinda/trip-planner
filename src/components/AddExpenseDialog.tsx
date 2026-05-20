"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
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
import {
  CATEGORY_META,
  type Expense,
  type ExpenseCategory,
  type ExchangeRateStatus,
} from "@/lib/expenses";
import { getCurrencyMeta } from "@/lib/currencies";
import { fetchKrwRate, getCachedKrwRate } from "@/lib/exchangeRate";
import {
  buildKrwPayload,
  buildFxEstimatedPayload,
  buildFxFinalizedPayload,
} from "@/lib/expenseCalc";

import { BasicInfoSection } from "@/components/expense/BasicInfoSection";
import { PaymentAmountSection } from "@/components/expense/PaymentAmountSection";
import { FxStatusSection } from "@/components/expense/FxStatusSection";
import { ParticipantsSection } from "@/components/expense/ParticipantsSection";

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
  /** 기존 지출을 넣으면 수정 모드로 동작 */
  editingExpense?: Expense | null;
  enabledCategories?: ExpenseCategory[];
  enabledCurrencies?: string[];
  defaultCurrency?: string;
}

// ---------- 헬퍼 ----------

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pickInitialCurrency(
  enabled: string[],
  defaultCurrency: string | undefined,
): string {
  if (defaultCurrency && enabled.includes(defaultCurrency))
    return defaultCurrency;
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
  enabledCategories = ALL_CATEGORIES,
  enabledCurrencies = ["EUR", "USD", "KRW"],
  defaultCurrency,
}: AddExpenseDialogProps) {
  const { user } = useAuth();

  const memberUids = useMemo(() => Object.keys(members), [members]);
  const initialCurrency = useMemo(
    () => pickInitialCurrency(enabledCurrencies, defaultCurrency),
    [enabledCurrencies, defaultCurrency],
  );

  // ── form state ────────────────────────────────────────────
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [description, setDescription] = useState("");

  // 결제 통화 / 금액
  const [paymentCurrency, setPaymentCurrency] = useState<string>(initialCurrency);
  const [amountInput, setAmountInput] = useState<string>("");

  // 환율
  const [rate, setRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState(false);

  // 환율 확정 상태 (외화일 때만 의미 있음)
  const [exchangeRateStatus, setExchangeRateStatus] =
    useState<ExchangeRateStatus>("estimated");
  const [finalizedKrwInput, setFinalizedKrwInput] = useState<string>("");

  // 결제 정보
  const [paidByUid, setPaidByUid] = useState<string>("");
  const [paidDateLocal, setPaidDateLocal] = useState<string>("");
  const [paidTimeLocal, setPaidTimeLocal] = useState<string>("");
  const [participants, setParticipants] = useState<Record<string, true>>({});

  const [saving, setSaving] = useState(false);
  const isEditMode = !!editingExpense;

  // ── 다이얼로그 열릴 때 초기화 ─────────────────────────────
  useEffect(() => {
    if (!open) return;

    if (editingExpense) {
      const currency = editingExpense.paymentCurrency ?? editingExpense.localCurrency;
      setCategory(editingExpense.category);
      setDescription(editingExpense.description);
      setPaymentCurrency(currency);
      setAmountInput(String(editingExpense.foreignAmount ?? editingExpense.localAmount));
      setRate(editingExpense.exchangeRate ?? editingExpense.rate ?? null);
      setRateLoading(false);
      setRateError(false);
      setExchangeRateStatus(
        editingExpense.exchangeRateStatus ??
          (currency !== "KRW" ? "estimated" : "estimated"),
      );
      setFinalizedKrwInput(
        editingExpense.finalizedKrwAmount
          ? String(editingExpense.finalizedKrwAmount)
          : "",
      );
      setPaidByUid(editingExpense.paidByUid);
      const [date, time] = toDatetimeLocalValue(editingExpense.paidAt).split("T");
      setPaidDateLocal(date ?? "");
      setPaidTimeLocal(time ?? "");
      setParticipants(editingExpense.participants ?? {});
      setSaving(false);
      return;
    }

    // 신규 입력 초기화
    const me = user?.uid ?? memberUids[0] ?? "";
    setCategory(null);
    setDescription("");
    setPaymentCurrency(initialCurrency);
    setAmountInput("");
    setRate(
      initialCurrency === "KRW"
        ? 1
        : getCachedKrwRate(initialCurrency) ?? null,
    );
    setRateLoading(false);
    setRateError(false);
    setExchangeRateStatus("estimated");
    setFinalizedKrwInput("");
    setPaidByUid(me);
    const [date, time] = toDatetimeLocalValue(new Date()).split("T");
    setPaidDateLocal(date ?? "");
    setPaidTimeLocal(time ?? "");
    const init: Record<string, true> = {};
    for (const uid of memberUids) init[uid] = true;
    setParticipants(init);
    setSaving(false);
  }, [open, editingExpense, user, memberUids, initialCurrency]);

  // ── 환율 fetch (debounce) ─────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (paymentCurrency === "KRW") return;

    const amountNum = parseFloat(amountInput);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setRateLoading(true);
      try {
        const r = await fetchKrwRate(paymentCurrency);
        if (cancelled) return;
        setRate(r);
        setRateError(false);
      } catch (e) {
        console.error("[AddExpenseDialog] fetchKrwRate failed", e);
        if (cancelled) return;
        setRateError(true);
        toast.error("환율 조회 실패. 직접 원화 금액을 입력해주세요.");
      } finally {
        if (!cancelled) setRateLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, amountInput, paymentCurrency]);

  // ── 핸들러 ────────────────────────────────────────────────

  const handleCurrencyChange = (newCurrency: string) => {
    setPaymentCurrency(newCurrency);
    setRateError(false);
    setRateLoading(false);
    setExchangeRateStatus("estimated");
    setFinalizedKrwInput("");
    if (newCurrency === "KRW") {
      setRate(1);
    } else {
      const cached = getCachedKrwRate(newCurrency);
      setRate(cached ?? null);
    }
  };

  const handlePaidByChange = (uid: string) => {
    const previousPaidByUid = paidByUid;
    setPaidByUid(uid);
    setParticipants((prev) => {
      const selectedUids = Object.keys(prev);
      const wasOnlyPreviousPayer =
        previousPaidByUid &&
        selectedUids.length === 1 &&
        selectedUids[0] === previousPaidByUid;
      if (wasOnlyPreviousPayer) return { [uid]: true };
      return { ...prev, [uid]: true };
    });
  };

  const toggleParticipant = (uid: string) => {
    if (uid === paidByUid) return;
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

  // ── 저장 ─────────────────────────────────────────────────

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
      toast.error("지출 내역을 입력해주세요.");
      return;
    }
    const amountNum = parseFloat(amountInput);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("금액을 입력해주세요.");
      return;
    }
    if (!paidByUid || !members[paidByUid]) {
      toast.error("결제자를 선택해주세요.");
      return;
    }
    const finalParticipants: Record<string, true> = {
      ...participants,
      [paidByUid]: true,
    };
    if (Object.keys(finalParticipants).length === 0) {
      toast.error("정산 인원이 비어 있어요.");
      return;
    }
    if (!paidDateLocal) {
      toast.error("결제일을 선택해주세요.");
      return;
    }

    // 외화 + finalized 검증
    if (paymentCurrency !== "KRW" && exchangeRateStatus === "finalized") {
      const finalKrw = parseFloat(finalizedKrwInput);
      if (!Number.isFinite(finalKrw) || finalKrw <= 0) {
        toast.error("최종 청구 원화 금액을 입력해주세요.");
        return;
      }
    }

    let paidAt: Date;
    try {
      paidAt = new Date(`${paidDateLocal}T${paidTimeLocal || "00:00"}`);
      if (isNaN(paidAt.getTime())) throw new Error("invalid date");
    } catch {
      toast.error("결제일이 올바르지 않아요.");
      return;
    }

    // ── payload 조립 ──────────────────────────────────────
    let amountPayload;
    if (paymentCurrency === "KRW") {
      amountPayload = buildKrwPayload(amountNum);
    } else if (exchangeRateStatus === "finalized") {
      const effectiveRate = rate ?? (amountNum > 0 ? parseFloat(finalizedKrwInput) / amountNum : 0);
      amountPayload = buildFxFinalizedPayload(
        paymentCurrency,
        amountNum,
        effectiveRate,
        parseFloat(finalizedKrwInput),
      );
    } else {
      // estimated
      const effectiveRate = rate ?? 0;
      if (effectiveRate <= 0) {
        toast.error("환율을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      amountPayload = buildFxEstimatedPayload(paymentCurrency, amountNum, effectiveRate);
    }

    setSaving(true);
    try {
      const payload = {
        category,
        description: desc,
        paidByUid,
        paidBy: members[paidByUid] ?? "",
        // 신규 필드
        paymentCurrency: amountPayload.paymentCurrency,
        foreignAmount: amountPayload.foreignAmount,
        exchangeRate: amountPayload.exchangeRate,
        exchangeRateStatus: amountPayload.exchangeRateStatus ?? null,
        estimatedKrwAmount: amountPayload.estimatedKrwAmount ?? null,
        finalizedKrwAmount: amountPayload.finalizedKrwAmount ?? null,
        cardSettlementConfirmed: amountPayload.cardSettlementConfirmed ?? false,
        // 하위 호환 필드 (기존 쿼리/뷰가 localCurrency / localAmount / rate / krwAmount 를 참조)
        localCurrency: amountPayload.localCurrency,
        localAmount: amountPayload.localAmount,
        rate: amountPayload.rate,
        krwAmount: amountPayload.krwAmount,
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
          createdByUid: user.uid,
          createdBy: user.displayName || "익명",
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

  // ── 파생값 ───────────────────────────────────────────────

  const visibleCurrencies = Array.from(new Set(enabledCurrencies)).map(
    getCurrencyMeta,
  );
  const visibleCategories = ALL_CATEGORIES.filter((c) =>
    enabledCategories.includes(c),
  );
  const isKrw = paymentCurrency === "KRW";
  const foreignAmountNum = parseFloat(amountInput);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-md max-h-[92vh] overflow-y-auto rounded-2xl p-0">
        {/* 헤더 */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-outline-variant px-5 pt-5 pb-4 rounded-t-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {isEditMode ? "지출 수정" : "지출 추가"}
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              결제한 항목을 기록하면 자동으로 1/n 정산이 계산돼요.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* 본문 */}
        <div className="px-4 py-4 space-y-3">
          {/* 1. 기본 정보 */}
          <BasicInfoSection
            category={category}
            onCategoryChange={setCategory}
            visibleCategories={visibleCategories}
            description={description}
            onDescriptionChange={setDescription}
            paidByUid={paidByUid}
            onPaidByChange={handlePaidByChange}
            members={members}
            currentUserUid={user?.uid}
            paidDateLocal={paidDateLocal}
            onPaidDateChange={setPaidDateLocal}
            paidTimeLocal={paidTimeLocal}
            onPaidTimeChange={setPaidTimeLocal}
          />

          {/* 2. 결제 금액 */}
          <PaymentAmountSection
            paymentCurrency={paymentCurrency}
            onCurrencyChange={handleCurrencyChange}
            visibleCurrencies={visibleCurrencies}
            amountInput={amountInput}
            onAmountChange={setAmountInput}
            rate={rate}
            rateLoading={rateLoading}
            rateError={rateError}
          />

          {/* 3. 환율 확정 상태 (외화만) */}
          {!isKrw && (
            <FxStatusSection
              paymentCurrency={paymentCurrency}
              foreignAmount={
                Number.isFinite(foreignAmountNum) ? foreignAmountNum : 0
              }
              rate={rate}
              exchangeRateStatus={exchangeRateStatus}
              onStatusChange={setExchangeRateStatus}
              finalizedKrwInput={finalizedKrwInput}
              onFinalizedKrwChange={setFinalizedKrwInput}
            />
          )}

          {/* 4. 정산 인원 */}
          <ParticipantsSection
            memberUids={memberUids}
            members={members}
            participants={participants}
            paidByUid={paidByUid}
            currentUserUid={user?.uid}
            onToggle={toggleParticipant}
            onSelectAll={selectAllParticipants}
            onSelectOnlyPayer={selectOnlyPayer}
          />
        </div>

        {/* footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-outline-variant px-4 py-4 flex gap-2 rounded-b-2xl">
          <Button
            variant="outline"
            className="flex-1 rounded-xl h-12"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            className="flex-[2] rounded-xl h-12 text-base font-semibold shadow-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditMode ? "수정 완료" : "저장하기"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
