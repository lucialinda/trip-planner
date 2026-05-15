"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { ThreadList } from "@/components/threads/ThreadList";
import { ThreadDetail } from "@/components/threads/ThreadDetail";
import type { Thread } from "@/lib/threads";

function CommunityContent() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("id");
  const { user } = useAuth();
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [memberUids, setMemberUids] = useState<string[]>([]);

  // 여행 멤버 목록 로드 (읽음 카운트에 필요)
  useEffect(() => {
    if (!tripId) return;
    const unsub = onSnapshot(doc(db, "trips", tripId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMemberUids(data.memberUids ?? Object.keys(data.members ?? {}));
        // 핀 변경 시 activeThread 업데이트
        if (activeThread && data) {
          setActiveThread((prev) => prev ? { ...prev, pinnedMessage: data.pinnedMessage ?? null } : prev);
        }
      }
    });
    return () => unsub();
  }, [tripId]);

  // 스레드 문서 실시간 구독 (핀 공지 반영)
  useEffect(() => {
    if (!tripId || !activeThread) return;
    const unsub = onSnapshot(doc(db, "trips", tripId, "threads", activeThread.id), (snap) => {
      if (snap.exists()) {
        setActiveThread((prev) => prev ? { ...prev, ...snap.data(), id: snap.id } as Thread : prev);
      }
    });
    return () => unsub();
  }, [tripId, activeThread?.id]);

  if (!tripId || !user) {
    return (
      <div className="relative flex min-h-screen w-full flex-col bg-background overflow-x-hidden">
        <header className="sticky top-0 z-40 flex items-center bg-white/80 backdrop-blur-md p-4 border-b border-outline-variant/30">
          <h2 className="text-on-surface text-lg font-bold leading-tight tracking-tight flex-1">스레드</h2>
        </header>
        <main className="flex-1 px-4 pb-24 pt-12 flex flex-col items-center justify-center text-center gap-3">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/50">forum</span>
          <h3 className="text-on-surface font-semibold">여행을 선택해주세요</h3>
          <p className="text-sm text-on-surface-variant max-w-xs">홈에서 여행을 선택하면 스레드를 볼 수 있어요.</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col overflow-x-hidden bg-background shadow-sm sm:border-x">
      {!activeThread && (
        <header className="sticky top-0 z-40 flex items-center bg-white/80 backdrop-blur-md p-4 border-b border-outline-variant/30">
          <h2 className="text-on-surface text-lg font-bold leading-tight tracking-tight flex-1">스레드</h2>
          <span className="text-xs text-on-surface-variant/60 bg-slate-100 px-2 py-1 rounded-full font-medium">여행 멤버 전용</span>
        </header>
      )}
      <main className="flex-1 overflow-hidden flex flex-col pb-20">
        {activeThread ? (
          <ThreadDetail
            tripId={tripId}
            thread={activeThread}
            memberUids={memberUids}
            onBack={() => setActiveThread(null)}
          />
        ) : (
          <ThreadList tripId={tripId} onOpenThread={(thread) => setActiveThread(thread)} />
        )}
      </main>
      <BottomNav />
    </div>
  );
}

export default function CommunityPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">로딩중...</div>}>
      <CommunityContent />
    </Suspense>
  );
}
