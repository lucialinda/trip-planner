"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";

// ---------- Phase 1 더미 데이터 (Phase 2에서 Firestore 구독으로 교체) ----------
type DummyExpense = {
  id: string;
  category: "food" | "cafe" | "transit" | "lodging" | "activity" | "shopping" | "etc";
  description: string;
  krwAmount: number;
  paidAt: string; // "2026.05.04 • 12:30"
  status: "tentative" | "confirmed";
};

const DUMMY_EXPENSES: DummyExpense[] = [
  {
    id: "d1",
    category: "food",
    description: "몽마르트르 비스트로 저녁",
    krwAmount: 92000,
    paidAt: "2026.05.04 • 19:30",
    status: "confirmed",
  },
  {
    id: "d2",
    category: "transit",
    description: "파리 메트로 카르네 10매",
    krwAmount: 28000,
    paidAt: "2026.05.04 • 09:15",
    status: "tentative",
  },
  {
    id: "d3",
    category: "lodging",
    description: "르 마레 부티크 호텔 숙박",
    krwAmount: 385000,
    paidAt: "2026.05.03 • 15:00",
    status: "confirmed",
  },
  {
    id: "d4",
    category: "shopping",
    description: "갤러리 라파예트 기념품",
    krwAmount: 64500,
    paidAt: "2026.05.03 • 17:45",
    status: "tentative",
  },
];

// ---------- 카테고리 톤 매핑 (overview 표 + 네이비 치환 규칙) ----------
type CategoryMeta = {
  label: string;
  icon: string;
  iconBoxClass: string; // 좌측 12x12 아이콘 박스
};

const CATEGORY_META: Record<DummyExpense["category"], CategoryMeta> = {
  food: {
    label: "식비",
    icon: "restaurant",
    iconBoxClass: "bg-primary/10 border-primary/15 text-primary",
  },
  cafe: {
    label: "카페·간식",
    icon: "local_cafe",
    iconBoxClass: "bg-amber-50 border-amber-100 text-amber-600",
  },
  transit: {
    label: "교통",
    icon: "directions_transit",
    iconBoxClass: "bg-slate-50 border-slate-100 text-on-surface-variant",
  },
  lodging: {
    label: "숙박",
    icon: "hotel",
    iconBoxClass: "bg-tertiary/10 border-tertiary/20 text-tertiary",
  },
  activity: {
    label: "관광·입장료",
    icon: "confirmation_number",
    iconBoxClass: "bg-rose-50 border-rose-100 text-rose-500",
  },
  shopping: {
    label: "쇼핑",
    icon: "shopping_bag",
    iconBoxClass: "bg-emerald-50 border-emerald-100 text-emerald-600",
  },
  etc: {
    label: "기타",
    icon: "category",
    iconBoxClass: "bg-slate-50 border-slate-100 text-on-surface-variant",
  },
};

function formatKrw(amount: number) {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

// Phase 1: 더미 합계 / 카테고리 비율 / 1인당 (계산 로직은 Phase 2~6에서 교체)
const DUMMY_TOTAL = DUMMY_EXPENSES.reduce((sum, e) => sum + e.krwAmount, 0);
const DUMMY_TOP_CATEGORY = { label: "식비", percent: 42 };
const DUMMY_PER_PERSON = Math.round(DUMMY_TOTAL / 4); // 4명 기준 임시

// 필터 옵션 (Phase 1: 더미 데이터 기준 — Phase 2에서 Firestore 쿼리/메모이제이션으로 교체)
type FilterKey = "all" | "tentative" | "confirmed";
const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "모두보기" },
  { key: "tentative", label: "미정산" },
  { key: "confirmed", label: "정산완료" },
];

export default function SettlePage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");

  const filteredExpenses =
    filter === "all"
      ? DUMMY_EXPENSES
      : DUMMY_EXPENSES.filter((e) => e.status === filter);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col overflow-x-hidden bg-background shadow-sm sm:border-x">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-white/80 backdrop-blur-md p-4 border-b border-outline-variant/30">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="p-2 -ml-2 text-primary hover:bg-primary/10 active:scale-95 transition-all rounded-full"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-on-surface text-lg font-bold leading-tight tracking-tight">정산</h2>
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
        {/* Hero: 총 지출 */}
        <section className="relative overflow-hidden glass-elevated rounded-xl p-8 text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-tertiary/5 pointer-events-none" />
          <p className="text-on-surface-variant text-xs font-medium mb-1 tracking-wide uppercase">
            총 지출
          </p>
          <h2 className="text-4xl font-extrabold text-primary tracking-tight mb-3">
            {formatKrw(DUMMY_TOTAL)}
          </h2>
          <div className="inline-flex items-center gap-1.5 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
            <span
              className="material-symbols-outlined text-sm text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              trending_up
            </span>
            <span className="text-[12px] text-primary font-bold">예산 내 지출 중</span>
          </div>
        </section>

        {/* Bento 2열: 가장 많이 쓴 곳 / 1인당 정산 금액 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-panel p-4 rounded-xl flex flex-col justify-between h-32">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              restaurant
            </span>
            <div>
              <p className="text-on-surface-variant text-xs mb-0.5">가장 많이 쓴 곳</p>
              <p className="font-bold text-on-surface">
                {DUMMY_TOP_CATEGORY.label} ({DUMMY_TOP_CATEGORY.percent}%)
              </p>
            </div>
          </div>
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
              <p className="text-on-surface-variant text-xs mb-0.5">1인당 정산 금액</p>
              {/* TODO(Phase 6): 임시 계산값 — 실제 정산 방식 반영 필요 */}
              <p className="font-bold text-on-surface">{formatKrw(DUMMY_PER_PERSON)}</p>
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

        {/* Expense 리스트 */}
        {filteredExpenses.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/50 mb-1">
              filter_list_off
            </span>
            <p className="text-sm text-on-surface-variant">해당하는 항목이 없어요</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredExpenses.map((exp) => {
              const meta = CATEGORY_META[exp.category];
              const isConfirmed = exp.status === "confirmed";
              return (
                <div
                  key={exp.id}
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
                      {exp.description}
                    </h4>
                    <p className="text-on-surface-variant text-xs mt-0.5">{exp.paidAt}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-on-surface font-bold">{formatKrw(exp.krwAmount)}</p>
                    <p
                      className={`text-[10px] font-semibold mt-0.5 ${
                        isConfirmed ? "text-tertiary" : "text-primary"
                      }`}
                    >
                      {isConfirmed ? "정산 완료" : "정산 예정"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* FAB: 홈과 동일한 스타일/위치 (max-w-3xl 컨테이너 안에서 ml-auto 정렬) */}
      <div className="fixed bottom-24 left-1/2 z-30 w-full max-w-3xl -translate-x-1/2 px-5 pointer-events-none">
        <button
          type="button"
          aria-label="지출 추가"
          // Phase 3에서 AddExpenseDialog 연결
          onClick={() => {}}
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

      <BottomNav />
    </div>
  );
}
