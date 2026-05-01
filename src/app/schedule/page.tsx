"use client";

import { BottomNav } from "@/components/BottomNav";

export default function SchedulePage() {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background overflow-x-hidden">
      <header className="sticky top-0 z-40 flex items-center bg-white/80 backdrop-blur-md p-4 border-b border-outline-variant/30">
        <h2 className="text-on-surface text-lg font-bold leading-tight tracking-tight flex-1">일정</h2>
      </header>

      <main className="flex-1 px-4 pb-24 pt-12 flex flex-col items-center justify-center text-center gap-3">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant/50">calendar_month</span>
        <h3 className="text-on-surface font-semibold">일정 페이지 준비 중</h3>
        <p className="text-sm text-on-surface-variant max-w-xs">
          여행별 일정 보기는 우선 각 여행 카드에서 들어갈 수 있어요. 통합 일정 화면은 곧 추가될 예정이에요.
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
