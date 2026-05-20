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
    <div className="rounded-2xl border border-outline-variant bg-white/60 px-4 py-4 space-y-4">
      <p className="text-[11px] font-semibold tracking-widest text-on-surface-variant uppercase">
        결제 금액
      </p>

      {/* 통화 배지 + 금액 입력 — 한 줄 */}
      <div className="flex items-center gap-2">
        {/* 통화 코드 배지 */}
        <div className="flex items-center gap-1 shrink-0">
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
                  "flex items-center justify-center rounded-full border px-3 h-9",
                  "text-xs font-bold transition-all shrink-0",
                  active
                    ? "border-primary bg-primary text-white shadow-sm"
                    : "border-outline-variant bg-white/70 text-on-surface hover:border-primary/50 hover:bg-primary/5",
                ].join(" ")}
              >
                {c.code}
              </button>
            );
          })}
        </div>

        {/* 금액 입력 — 앞에 통화 기호 prefix */}
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-on-surface-variant/60 select-none pointer-events-none">
            {meta.symbol}
          </span>
          <input
            type="text"
            inputMode={allowDecimal ? "decimal" : "numeric"}
            value={display}
            onChange={handleChange}
            placeholder="0"
            className="w-full h-10 rounded-md border border-input bg-white/80 pl-7 pr-3 py-2 text-base font-semibold text-on-surface placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      {/* 원화 환산 summary card (외화만) */}
      {!isKrw && (
        <div className="rounded-xl bg-surface-variant/40 border border-outline-variant px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span>적용 환율</span>
            <span className="font-medium">
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

          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant">원화 환산 금액</span>
            <span className="text-base font-bold text-on-surface">
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
    </div>
  );
}
