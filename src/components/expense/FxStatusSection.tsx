"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import type { ExchangeRateStatus } from "@/lib/expenses";
import { calcKrwAmount } from "@/lib/expenseCalc";

interface Props {
  foreignAmount: number;
  rate: number | null;
  exchangeRateStatus: ExchangeRateStatus;
  onStatusChange: (status: ExchangeRateStatus) => void;
  finalizedKrwInput: string;
  onFinalizedKrwChange: (v: string) => void;
}

function toDisplay(raw: string): string {
  if (!raw) return "";
  const num = parseInt(raw.replace(/,/g, ""), 10);
  return Number.isFinite(num) ? num.toLocaleString("ko-KR") : "";
}

function toRaw(display: string): string {
  return display.replace(/,/g, "");
}

export function FxStatusSection({
  foreignAmount,
  rate,
  exchangeRateStatus,
  onStatusChange,
  finalizedKrwInput,
  onFinalizedKrwChange,
}: Props) {
  const isEstimated = exchangeRateStatus === "estimated";
  const isFinalized = exchangeRateStatus === "finalized";

  const estimatedKrw =
    rate && Number.isFinite(foreignAmount) && foreignAmount > 0
      ? calcKrwAmount(foreignAmount, rate)
      : null;

  // 콤마 포매팅 로컬 상태
  const [display, setDisplay] = useState(() => toDisplay(finalizedKrwInput));
  const prevRawRef = useRef(finalizedKrwInput);

  useEffect(() => {
    if (prevRawRef.current !== finalizedKrwInput) {
      prevRawRef.current = finalizedKrwInput;
      setDisplay(toDisplay(finalizedKrwInput));
    }
  }, [finalizedKrwInput]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^0-9]/g, "");
    const formatted = toDisplay(cleaned);
    const raw = toRaw(formatted);
    setDisplay(formatted);
    prevRawRef.current = raw;
    onFinalizedKrwChange(raw);
  };

  return (
    <section className="border-b border-outline-variant py-5">
      {/* 헤더 + 상태 badge */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-widest text-on-surface-variant uppercase">
          환율
        </p>
        {isEstimated ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            <Clock className="w-3 h-3" />
            가환율 적용
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="w-3 h-3" />
            확정 완료
          </span>
        )}
      </div>

      {/* Estimated 상태 */}
      {isEstimated && (
        <div className="mt-4 space-y-3">
          {estimatedKrw !== null && (
            <div className="rounded-xl bg-amber-50/70 px-3 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-amber-700">예상 원화 금액</span>
                <span className="text-right text-base font-bold text-amber-800">
                  ₩{estimatedKrw.toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="text-[10px] text-amber-600/80 mt-1.5 leading-relaxed">
                카드 전표매입 전 예상 금액이에요 · 나중에 확정 금액으로 수정할 수 있어요
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => onStatusChange("finalized")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-white py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            <CheckCircle2 className="w-4 h-4" />
            전표매입 후 최종 금액 확정
          </button>
        </div>
      )}

      {/* Finalized 상태 */}
      {isFinalized && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-on-surface-variant">
              최종 청구 원화 금액
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-on-surface-variant/60 select-none pointer-events-none">
                ₩
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={display}
                onChange={handleChange}
                placeholder="0"
                className="h-12 w-full rounded-xl border border-outline-variant bg-white pl-8 pr-3 text-lg font-bold text-on-surface placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
          </div>

          {estimatedKrw !== null && (
            <div className="rounded-xl bg-emerald-50/70 px-3 py-3">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-on-surface-variant">가환율 예상 금액</span>
                <span className="text-right font-medium text-on-surface-variant">
                  ₩{estimatedKrw.toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="text-[10px] text-emerald-700/80 mt-1.5 leading-relaxed">
                최종 청구 금액이 반영되었어요 · 정산은 확정 금액 기준으로 계산돼요
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => onStatusChange("estimated")}
            className="text-[11px] font-semibold text-on-surface-variant underline-offset-2 hover:underline"
          >
            가환율 상태로 되돌리기
          </button>
        </div>
      )}
    </section>
  );
}
