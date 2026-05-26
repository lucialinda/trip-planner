"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getCurrencyMeta, type CurrencyMeta } from "@/lib/currencies";
import { calcKrwAmount } from "@/lib/expenseCalc";

interface Props {
  paymentCurrency: string;
  onCurrencyChange: (code: string) => void;
  visibleCurrencies: CurrencyMeta[];
  amountInput: string;
  onAmountChange: (v: string) => void;
  rate: number | null;
  rateLoading: boolean;
  rateError: boolean;
}

function toDisplay(raw: string, allowDecimal: boolean): string {
  if (!raw) return "";
  const stripped = raw.replace(/,/g, "");
  if (allowDecimal) {
    const [intPart = "", ...decParts] = stripped.split(".");
    const intNum = parseInt(intPart, 10);
    const formattedInt = Number.isFinite(intNum) ? intNum.toLocaleString("ko-KR") : intPart;
    return decParts.length > 0 ? `${formattedInt}.${decParts.join(".")}` : formattedInt;
  }
  const num = parseInt(stripped, 10);
  return Number.isFinite(num) ? num.toLocaleString("ko-KR") : "";
}

function toRaw(display: string): string {
  return display.replace(/,/g, "");
}

export function PaymentAmountSection({
  paymentCurrency,
  onCurrencyChange,
  visibleCurrencies,
  amountInput,
  onAmountChange,
  rate,
  rateLoading,
  rateError,
}: Props) {
  const isKrw = paymentCurrency === "KRW";
  const meta = getCurrencyMeta(paymentCurrency);
  const allowDecimal = meta.decimals > 0;

  const [display, setDisplay] = useState(() => toDisplay(amountInput, allowDecimal));

  const prevRawRef = useRef(amountInput);
  useEffect(() => {
    if (prevRawRef.current !== amountInput) {
      prevRawRef.current = amountInput;
      setDisplay(toDisplay(amountInput, allowDecimal));
    }
  }, [amountInput, allowDecimal]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = allowDecimal
      ? e.target.value.replace(/[^0-9.]/g, "")
      : e.target.value.replace(/[^0-9]/g, "");
    const formatted = toDisplay(cleaned, allowDecimal);
    const raw = toRaw(formatted);
    setDisplay(formatted);
    prevRawRef.current = raw;
    onAmountChange(raw);
  };

  const foreignNum = parseFloat(amountInput);
  const estimatedKrw =
    !isKrw && rate && Number.isFinite(foreignNum) && foreignNum > 0
      ? calcKrwAmount(foreignNum, rate)
      : null;

  return (
    <section className="border-b border-outline-variant py-5">
      <p className="text-[11px] font-semibold tracking-widest text-on-surface-variant uppercase">
        결제 금액
      </p>

      <div className="mt-4 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-end gap-3">
        <div className="min-w-0">
          <label className="mb-2 block text-xs font-medium text-on-surface-variant">통화</label>
          <div className="inline-flex rounded-full bg-surface-variant/60 p-1">
            {visibleCurrencies.map((c) => {
              const active = paymentCurrency === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => onCurrencyChange(c.code)}
                  aria-pressed={active}
                  title={c.label}
                  className={[
                    "flex h-8 min-w-12 items-center justify-center rounded-full px-2.5 text-xs font-bold transition-all",
                    active
                      ? "bg-white text-primary shadow-sm"
                      : "text-on-surface-variant hover:text-primary",
                  ].join(" ")}
                >
                  {c.code}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm font-semibold text-on-surface-variant/60 pointer-events-none">
              {meta.symbol}
            </span>
            <input
              type="text"
              inputMode={allowDecimal ? "decimal" : "numeric"}
              value={display}
              onChange={handleChange}
              placeholder="0"
              className="h-10 w-full rounded-full border border-outline-variant bg-white pl-8 pr-3 text-sm font-bold text-on-surface placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>
        </div>
      </div>

      {/* 원화 환산 summary card (외화만) */}
      {!isKrw && (
        <div className="mt-4 space-y-2 rounded-xl bg-surface-variant/30 px-3 py-3">
          <div className="flex items-center justify-between gap-4 text-xs text-on-surface-variant">
            <span>적용 환율</span>
            <span className="text-right font-medium">
              {rateLoading ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  조회 중...
                </span>
              ) : rateError ? (
                <span className="text-rose-500">조회 실패</span>
              ) : rate !== null ? (
                <>1 {paymentCurrency} &asymp; {rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} KRW</>
              ) : (
                "금액 입력 시 표시"
              )}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-on-surface-variant">원화 환산 금액</span>
            <span className="text-right text-base font-bold text-on-surface">
              {estimatedKrw !== null
                ? "₩" + estimatedKrw.toLocaleString("ko-KR")
                : "—"}
            </span>
          </div>

          <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
            가환율 기준 예상 금액이에요 · 전표매입 후 확정할 수 있어요
          </p>
        </div>
      )}
    </section>
  );
}
