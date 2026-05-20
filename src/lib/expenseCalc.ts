/**
 * expenseCalc.ts
 * 지출 금액 계산 및 환율 관련 유틸리티.
 * UI 컴포넌트에서 직접 계산 로직을 갖지 않도록 분리.
 */

import type { ExchangeRateStatus } from "@/lib/expenses";

// ────────────────────────────────────────────────────────────
// 원화 환산
// ────────────────────────────────────────────────────────────

/**
 * 외화 금액 × 환율 → 원화 환산 금액 (반올림).
 * 입력값이 유효하지 않으면 0 반환.
 */
export function calcKrwAmount(foreignAmount: number, rate: number): number {
  if (!Number.isFinite(foreignAmount) || foreignAmount <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(foreignAmount * rate);
}

/**
 * 원화 금액 ÷ 외화 금액 → 역산 환율.
 * 입력값이 유효하지 않으면 0 반환.
 */
export function calcRateFromKrw(foreignAmount: number, krwAmount: number): number {
  if (!Number.isFinite(foreignAmount) || foreignAmount <= 0) return 0;
  if (!Number.isFinite(krwAmount) || krwAmount <= 0) return 0;
  return krwAmount / foreignAmount;
}

// ────────────────────────────────────────────────────────────
// 저장 payload 빌더
// ────────────────────────────────────────────────────────────

export interface ExpenseAmountPayload {
  /** 결제 통화 ("KRW", "USD", ...) */
  paymentCurrency: string;
  /** 하위 호환 */
  localCurrency: string;

  /** 외화 결제 금액 */
  foreignAmount: number;
  /** 하위 호환 */
  localAmount: number;

  /** 적용 환율 */
  exchangeRate: number;
  /** 하위 호환 */
  rate: number;

  /** 환율 상태 (KRW면 undefined) */
  exchangeRateStatus?: ExchangeRateStatus;

  /**
   * 정산 기준 원화 금액.
   * KRW: 결제 금액 그대로.
   * 외화 estimated: 가환율 예상 금액.
   * 외화 finalized: 최종 청구 금액.
   */
  krwAmount: number;

  /** 가환율 예상 원화 금액 (외화 estimated 시 설정) */
  estimatedKrwAmount?: number;

  /** 최종 청구 원화 금액 (외화 finalized 시 설정) */
  finalizedKrwAmount?: number;

  /** 전표매입 확정 여부 */
  cardSettlementConfirmed?: boolean;
}

/**
 * KRW 결제 payload 조각을 빌드한다.
 */
export function buildKrwPayload(krwAmount: number): ExpenseAmountPayload {
  const amount = Math.round(krwAmount);
  return {
    paymentCurrency: "KRW",
    localCurrency: "KRW",
    foreignAmount: amount,
    localAmount: amount,
    exchangeRate: 1,
    rate: 1,
    exchangeRateStatus: undefined,
    krwAmount: amount,
    estimatedKrwAmount: undefined,
    finalizedKrwAmount: undefined,
    cardSettlementConfirmed: undefined,
  };
}

/**
 * 외화 결제 estimated(가환율) payload 조각을 빌드한다.
 */
export function buildFxEstimatedPayload(
  currency: string,
  foreignAmount: number,
  rate: number,
): ExpenseAmountPayload {
  const estimated = calcKrwAmount(foreignAmount, rate);
  return {
    paymentCurrency: currency,
    localCurrency: currency,
    foreignAmount,
    localAmount: foreignAmount,
    exchangeRate: rate,
    rate,
    exchangeRateStatus: "estimated",
    krwAmount: estimated,
    estimatedKrwAmount: estimated,
    finalizedKrwAmount: undefined,
    cardSettlementConfirmed: false,
  };
}

/**
 * 외화 결제 finalized(확정) payload 조각을 빌드한다.
 * finalKrw: 전표매입 후 실제 청구 원화 금액.
 */
export function buildFxFinalizedPayload(
  currency: string,
  foreignAmount: number,
  estimatedRate: number,
  finalKrw: number,
): ExpenseAmountPayload {
  const estimated = calcKrwAmount(foreignAmount, estimatedRate);
  const final = Math.round(finalKrw);
  return {
    paymentCurrency: currency,
    localCurrency: currency,
    foreignAmount,
    localAmount: foreignAmount,
    exchangeRate: estimatedRate,
    rate: estimatedRate,
    exchangeRateStatus: "finalized",
    krwAmount: final,
    estimatedKrwAmount: estimated,
    finalizedKrwAmount: final,
    cardSettlementConfirmed: true,
  };
}
