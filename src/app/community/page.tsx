"use client";

import { BottomNav } from "@/components/BottomNav";

export default function CommunityPage() {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background overflow-x-hidden">
      <header className="sticky top-0 z-40 flex items-center bg-white/80 backdrop-blur-md p-4 border-b border-outline-variant/30">
        <h2 className="text-on-surface text-lg font-bold leading-tight tracking-tight flex-1">커뮤니티</h2>
      </header>

      <main className="flex-1 px-4 pb-24 pt-12 flex flex-col items-center justify-center text-center gap-3">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant/50">group</span>
        <h3 className="text-on-surface font-semibold">커뮤니티 준비 중</h3>
        <p className="text-sm text-on-surface-variant max-w-xs">
          여행 멤버끼리 채팅·스레드 기능은 기존 코드(old_src)에 있어요. 새 화면으로 옮겨서 곧 연결할게요.
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
