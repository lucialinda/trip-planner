"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Lock, MessageCircle, ChevronRight, Pencil, Trash2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  type Thread,
  type ThreadVisibility,
  subscribeThreads,
  getThreadReadAt,
  isThreadNew,
  createThread,
  updateThreadTitle,
  deleteThread,
  formatThreadTime,
} from "@/lib/threads";

interface Props {
  tripId: string;
  onOpenThread: (thread: Thread) => void;
}

export function ThreadList({ tripId, onOpenThread }: Props) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [enriched, setEnriched] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  // New thread dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newVisibility, setNewVisibility] = useState<ThreadVisibility>("public");
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [editThread, setEditThread] = useState<Thread | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Load threads via Firestore subscription
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const unsub = subscribeThreads(
      tripId,
      user.uid,
      (rawThreads) => {
        setThreads(rawThreads);
        setLoading(false);
      },
      (e) => {
        toast.error("스레드 목록 오류: " + e.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [tripId, user]);

  // Enrich threads with read status
  useEffect(() => {
    if (!user || !threads.length) {
      setEnriched(threads);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await Promise.all(
        threads.map(async (t) => {
          const readAt = await getThreadReadAt(tripId, t.id, user.uid);
          return { ...t, readAt, isNew: isThreadNew(t, readAt) };
        })
      );
      if (!cancelled) setEnriched(result);
    })();
    return () => { cancelled = true; };
  }, [threads, tripId, user]);

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!user || !newTitle.trim()) return;
    setSaving(true);
    try {
      const id = await createThread(
        tripId,
        user.uid,
        user.displayName || "익명",
        newTitle.trim(),
        newVisibility
      );
      setShowCreate(false);
      setNewTitle("");
      setNewVisibility("public");
      // Find thread and open it (may not be in list yet; pass optimistic data)
      onOpenThread({
        id,
        title: newTitle.trim(),
        visibility: newVisibility,
        createdByUid: user.uid,
        createdByName: user.displayName || "익명",
        createdAt: null,
        updatedAt: null,
        deleted: false,
        isNew: false,
      });
    } catch (e: unknown) {
      toast.error("생성 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류"));
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────

  const openEdit = (thread: Thread) => {
    setEditThread(thread);
    setEditTitle(thread.title);
  };

  const handleEdit = async () => {
    if (!editThread || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      await updateThreadTitle(tripId, editThread.id, editTitle.trim());
      toast.success("스레드가 수정됐어요");
      setEditThread(null);
    } catch (e: unknown) {
      toast.error("수정 실패: " + (e instanceof Error ? e.message : ""));
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (thread: Thread) => {
    if (!confirm(`'${thread.title}' 스레드를 삭제할까요?`)) return;
    try {
      await deleteThread(tripId, thread.id);
      toast.success("스레드가 삭제됐어요");
    } catch (e: unknown) {
      toast.error("삭제 실패: " + (e instanceof Error ? e.message : ""));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Create button */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-semibold text-sm shadow-md shadow-primary/20 active:scale-[0.98] transition-transform"
        >
          <Plus className="w-4 h-4" />
          새 스레드 만들기
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-on-surface-variant">
            로딩중...
          </div>
        ) : enriched.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <MessageCircle className="w-12 h-12 text-on-surface-variant/30" />
            <p className="font-semibold text-on-surface">아직 스레드가 없어요</p>
            <p className="text-sm text-on-surface-variant">위 버튼으로 첫 스레드를 만들어보세요</p>
          </div>
        ) : (
          enriched.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              isMine={thread.createdByUid === user?.uid}
              onOpen={() => onOpenThread(thread)}
              onEdit={() => openEdit(thread)}
              onDelete={() => handleDelete(thread)}
            />
          ))
        )}
      </div>

      {/* Create dialog */}
      {showCreate && (
        <BottomSheet title="새 스레드" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                주제명 *
              </label>
              <input
                autoFocus
                type="text"
                maxLength={80}
                placeholder="예: 첫날 저녁 메뉴"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-white/80 text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                공개 설정
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["public", "private"] as ThreadVisibility[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setNewVisibility(v)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                      newVisibility === v
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant bg-white/60 text-on-surface-variant"
                    }`}
                  >
                    {v === "private" && <Lock className="w-3.5 h-3.5" />}
                    {v === "public" ? "모든 멤버" : "나만 보기"}
                  </button>
                ))}
              </div>
            </div>
            <button
              disabled={saving || !newTitle.trim()}
              onClick={handleCreate}
              className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {saving ? "만드는 중..." : "만들기"}
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Edit dialog */}
      {editThread && (
        <BottomSheet title="스레드 수정" onClose={() => setEditThread(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                주제명
              </label>
              <input
                autoFocus
                type="text"
                maxLength={80}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEdit()}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-white/80 text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <button
              disabled={editSaving || !editTitle.trim()}
              onClick={handleEdit}
              className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {editSaving ? "저장 중..." : "저장하기"}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ── ThreadCard ────────────────────────────────────────────────────────────────

interface CardProps {
  thread: Thread;
  isMine: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ThreadCard({ thread, isMine, onOpen, onEdit, onDelete }: CardProps) {
  const [swiped, setSwiped] = useState(false);
  const startXRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const diff = startXRef.current - e.changedTouches[0].clientX;
    if (diff > 40) setSwiped(true);
    else if (diff < -20) setSwiped(false);
    startXRef.current = null;
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action buttons revealed on swipe */}
      {isMine && (
        <div className="absolute right-0 inset-y-0 flex items-stretch">
          <button
            onClick={onEdit}
            className="w-16 flex flex-col items-center justify-center gap-0.5 bg-amber-400 text-white text-[10px] font-semibold"
          >
            <Pencil className="w-4 h-4" />
            수정
          </button>
          <button
            onClick={onDelete}
            className="w-16 flex flex-col items-center justify-center gap-0.5 bg-rose-500 text-white text-[10px] font-semibold rounded-r-xl"
          >
            <Trash2 className="w-4 h-4" />
            삭제
          </button>
        </div>
      )}

      {/* Card */}
      <div
        onClick={() => { if (!swiped) onOpen(); else setSwiped(false); }}
        onTouchStart={isMine ? handleTouchStart : undefined}
        onTouchEnd={isMine ? handleTouchEnd : undefined}
        style={{ transform: swiped ? "translateX(-128px)" : "translateX(0)", transition: "transform 0.2s ease" }}
        className="relative bg-white/80 backdrop-blur-sm border border-outline-variant/40 rounded-xl px-4 py-3.5 flex items-center gap-3 cursor-pointer active:bg-white/60"
      >
        {/* Icon */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          thread.visibility === "private" ? "bg-slate-100" : "bg-primary/10"
        }`}>
          {thread.visibility === "private" ? (
            <Lock className="w-4 h-4 text-slate-500" />
          ) : (
            <MessageCircle className="w-4 h-4 text-primary" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {thread.isNew && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500 text-white uppercase tracking-wide flex-shrink-0">
                NEW
              </span>
            )}
            <span className="font-semibold text-sm text-on-surface truncate">{thread.title}</span>
            {thread.visibility === "private" && (
              <span className="text-[10px] text-slate-400 flex-shrink-0">나만 보기</span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {thread.createdByName} · {formatThreadTime(thread.updatedAt ?? thread.createdAt)}
          </p>
        </div>

        <ChevronRight className="w-4 h-4 text-on-surface-variant/50 flex-shrink-0" />
      </div>
    </div>
  );
}

// ── BottomSheet ───────────────────────────────────────────────────────────────

function BottomSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl shadow-2xl p-5 pb-8 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-on-surface">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
