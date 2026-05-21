"use client";

import { BottomNav } from "@/components/BottomNav";

export default function CommunityPage() {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background overflow-x-hidden">
      <header className="sticky top-0 z-40 flex items-center justify-center bg-white/80 backdrop-blur-md p-4 border-b border-outline-variant/30">
        <h2 className="text-on-surface text-lg font-bold leading-tight tracking-tight">스레드</h2>
      </header>

      <main className="flex-1 px-4 pb-24 pt-12 flex flex-col items-center justify-center text-center gap-3">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant/50">
          construction
        </span>
        <h3 className="text-on-surface font-semibold">점검 중</h3>
        <p className="text-sm text-on-surface-variant max-w-xs">
          Firebase 사용량 관리를 위해 커뮤니티 기능을 잠시 닫아두었어요. 일정과 정산 기능을 먼저 안정화한 뒤 다시 열 예정입니다.
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
