"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { ChevronLeft, Send, Lock, Pin, CornerDownRight } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  type Thread,
  type ThreadMessage,
  type ReplyRef,
  subscribeMessages,
  getReadsSnapshot,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  pinMessage,
  markThreadRead,
  formatMessageTime,
} from "@/lib/threads";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface Props {
  tripId: string;
  thread: Thread;
  memberUids: string[];
  onBack: () => void;
}

export function ThreadDetail({ tripId, thread, memberUids, onBack }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [reads, setReads] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [editingMsg, setEditingMsg] = useState<ThreadMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [menuMsg, setMenuMsg] = useState<ThreadMessage | null>(null);
  const [pinCollapsed, setPinCollapsed] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalMembers = memberUids.length || 1;

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    markThreadRead(tripId, thread.id, user.uid);
    const unsub = subscribeMessages(tripId, thread.id, (msgs) => {
      setMessages(msgs);
      setLoading(false);
      // 새 메시지 올 때마다 reads 갱신
      getReadsSnapshot(tripId, thread.id).then(setReads);
    }, (e) => { toast.error("메시지 오류: " + e.message); setLoading(false); });
    // 입장 시 reads 초기 로드
    getReadsSnapshot(tripId, thread.id).then(setReads);
    return () => unsub();
  }, [tripId, thread.id, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getUnreadCount = useCallback((msg: ThreadMessage): number => {
    if (!msg.createdAt) return 0;
    const msgMs = msg.createdAt.toMillis();
    return memberUids.filter((uid) => uid !== msg.uid && (!reads[uid] || reads[uid] < msgMs)).length;
  }, [reads, memberUids]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || sending) return;
    setSending(true);
    setText("");
    setReplyTo(null);
    try {
      await sendMessage(tripId, thread.id, user.uid, user.displayName || "익명", user.photoURL || null, trimmed, replyTo);
      // 전송 후 reads 갱신
      getReadsSnapshot(tripId, thread.id).then(setReads);
    } catch (e: unknown) {
      toast.error("전송 실패: " + (e instanceof Error ? e.message : ""));
      setText(trimmed);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const startLongPress = (msg: ThreadMessage) => {
    if (msg.deletedAt) return;
    longPressTimer.current = setTimeout(() => setMenuMsg(msg), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleEditSave = async () => {
    if (!editingMsg || !editText.trim()) return;
    try {
      await editMessage(tripId, thread.id, editingMsg.id, editText.trim());
      toast.success("수정됐어요");
      setEditingMsg(null);
    } catch { toast.error("수정 실패"); }
  };

  const handleDelete = async (msg: ThreadMessage) => {
    if (!confirm("이 메시지를 삭제할까요?")) return;
    try {
      await deleteMessage(tripId, thread.id, msg.id);
      setMenuMsg(null);
    } catch { toast.error("삭제 실패"); }
  };

  const handlePin = async (msg: ThreadMessage) => {
    const already = thread.pinnedMessage?.id === msg.id;
    try {
      await pinMessage(tripId, thread.id, already ? null : {
        id: msg.id, text: msg.text.slice(0, 60), displayName: msg.displayName,
      });
      toast.success(already ? "핀을 해제했어요" : "공지로 고정했어요 📌");
      setMenuMsg(null);
      setPinCollapsed(false);
    } catch { toast.error("핀 처리 실패"); }
  };

  const handleReact = async (msg: ThreadMessage, emoji: string) => {
    if (!user) return;
    const hasReacted = (msg.reactions?.[emoji] ?? []).includes(user.uid);
    try {
      await toggleReaction(tripId, thread.id, msg.id, emoji, user.uid, hasReacted);
    } catch { toast.error("반응 실패"); }
    setMenuMsg(null);
  };

  const pinnedMsg = thread.pinnedMessage;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur-md border-b border-outline-variant/30 flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface hover:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {thread.visibility === "private" && <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
            <h3 className="font-bold text-sm text-on-surface truncate">{thread.title}</h3>
          </div>
          <p className="text-[10px] text-slate-400">{totalMembers}명 참여</p>
        </div>
        {pinnedMsg && (
          <button onClick={() => setPinCollapsed(!pinCollapsed)} className="text-primary p-1">
            <Pin className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 핀 공지 배너 */}
      {pinnedMsg && !pinCollapsed && (
        <div className="flex-shrink-0 bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-start gap-2">
          <Pin className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-0.5">📌 공지</p>
            <p className="text-xs text-on-surface leading-snug line-clamp-2">{pinnedMsg.text}</p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">{pinnedMsg.displayName}</p>
          </div>
          <button onClick={() => setPinCollapsed(true)} className="text-slate-400 text-xs flex-shrink-0">✕</button>
        </div>
      )}

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-on-surface-variant">로딩중...</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <span className="text-4xl">💬</span>
            <p className="text-sm text-on-surface-variant">첫 번째 메시지를 남겨보세요!</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.uid === user?.uid;
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showAvatar = !isMe && (!prevMsg || prevMsg.uid !== msg.uid || !!prevMsg.deletedAt);
            const showName = !isMe && showAvatar;
            const unread = isMe ? getUnreadCount(msg) : 0;
            return (
              <MessageRow
                key={msg.id}
                msg={msg}
                isMe={isMe}
                showAvatar={showAvatar}
                showName={showName}
                unreadCount={unread}
                isPinned={pinnedMsg?.id === msg.id}
                onLongPressStart={() => startLongPress(msg)}
                onLongPressEnd={cancelLongPress}
                onOpenMenu={() => setMenuMsg(msg)}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 답장 프리뷰 */}
      {replyTo && (
        <div className="flex-shrink-0 mx-4 mb-1 px-3 py-2 bg-primary/10 rounded-xl border-l-2 border-primary flex items-start gap-2">
          <CornerDownRight className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-primary">{replyTo.displayName}에게 답장</p>
            <p className="text-xs text-on-surface-variant truncate">{replyTo.text}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-slate-400 text-xs">✕</button>
        </div>
      )}

      {/* 입력창 */}
      <div className="flex-shrink-0 px-4 py-3 bg-white/90 backdrop-blur-md border-t border-outline-variant/30">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-slate-100 rounded-2xl px-4 py-2.5">
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={500}
              placeholder="메시지 입력... (Enter 전송)"
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-sm text-on-surface placeholder:text-slate-400 resize-none focus:outline-none leading-5"
              style={{ minHeight: "20px", maxHeight: "120px" }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-90 transition-transform shadow-md shadow-primary/25"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 컨텍스트 메뉴 (롱프레스) */}
      {menuMsg && (
        <ContextMenu
          msg={menuMsg}
          isMe={menuMsg.uid === user?.uid}
          isPinned={pinnedMsg?.id === menuMsg.id}
          onClose={() => setMenuMsg(null)}
          onReply={() => {
            setReplyTo({ id: menuMsg.id, text: menuMsg.text.slice(0, 60), displayName: menuMsg.displayName });
            setMenuMsg(null);
            textareaRef.current?.focus();
          }}
          onEdit={() => {
            setEditingMsg(menuMsg);
            setEditText(menuMsg.text);
            setMenuMsg(null);
          }}
          onDelete={() => handleDelete(menuMsg)}
          onPin={() => handlePin(menuMsg)}
          onReact={(emoji) => handleReact(menuMsg, emoji)}
        />
      )}

      {/* 수정 모달 */}
      {editingMsg && (
        <EditModal
          initialText={editText}
          onChange={setEditText}
          onSave={handleEditSave}
          onCancel={() => setEditingMsg(null)}
        />
      )}
    </div>
  );
}

// ── MessageRow ────────────────────────────────────────────────────────────────

function MessageRow({
  msg, isMe, showAvatar, showName, unreadCount, isPinned,
  onLongPressStart, onLongPressEnd, onOpenMenu,
}: {
  msg: ThreadMessage; isMe: boolean; showAvatar: boolean; showName: boolean;
  unreadCount: number; isPinned: boolean;
  onLongPressStart: () => void; onLongPressEnd: () => void;
  onOpenMenu: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isDeleted = !!msg.deletedAt;
  const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const hasReactions = msg.reactions && Object.values(msg.reactions).some((arr) => arr.length > 0);

  if (isDeleted) {
    return (
      <div className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1`}>
        <span className="text-xs text-slate-400 italic px-3 py-1.5 bg-slate-100 rounded-2xl">삭제된 메시지예요</span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${isMe ? "items-end" : "items-start"} mb-1`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 답장 인용 */}
      {msg.replyTo && (
        <div className={`max-w-[75%] mb-1 px-3 py-1.5 rounded-xl text-xs bg-slate-100 border-l-2 border-slate-300 ${isMe ? "border-r-2 border-l-0 self-end" : ""}`}>
          <p className="font-semibold text-[10px] text-slate-400">{msg.replyTo.displayName}</p>
          <p className="text-slate-500 truncate">{msg.replyTo.text}</p>
        </div>
      )}

      <div className={`flex items-end gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
        {/* 아바타 */}
        <div className="w-8 flex-shrink-0">
          {showAvatar && !isMe && (
            <Avatar className="w-8 h-8">
              {msg.photoURL && <AvatarImage src={msg.photoURL} />}
              <AvatarFallback className="bg-primary/10 text-primary text-[10px]">{initials(msg.displayName || "?")}</AvatarFallback>
            </Avatar>
          )}
        </div>

        {/* 읽음 수 + 시간 */}
        {isMe && (
          <div className="flex flex-col items-end gap-0.5 mb-1">
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold text-amber-500 leading-none">{unreadCount}</span>
            )}
            <span className="text-[10px] text-slate-400">{formatMessageTime(msg.createdAt)}</span>
          </div>
        )}

        {/* 버블 + ··· 버튼 */}
        <div className={`flex items-center gap-1 ${isMe ? "flex-row-reverse" : ""}`}>
          <div
            className="max-w-[75%]"
            onTouchStart={onLongPressStart}
            onTouchEnd={onLongPressEnd}
            onMouseDown={onLongPressStart}
            onMouseUp={onLongPressEnd}
            onMouseLeave={onLongPressEnd}
          >
            {showName && (
              <p className="text-[11px] font-semibold text-on-surface-variant mb-1 ml-1">{msg.displayName}</p>
            )}
            <div className={`relative px-4 py-2.5 text-sm leading-relaxed select-none ${
              isMe
                ? "bg-primary text-white rounded-2xl rounded-tr-sm"
                : "bg-white/90 border border-outline-variant/30 rounded-2xl rounded-tl-sm shadow-sm text-on-surface"
            } ${isPinned ? "ring-2 ring-amber-400/50" : ""}`}>
              {isPinned && <span className="absolute -top-2 -right-1 text-xs">📌</span>}
              <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              {msg.editedAt && (
                <p className={`text-[9px] mt-1 ${isMe ? "text-white/60" : "text-slate-400"}`}>수정됨</p>
              )}
            </div>
          </div>

          {/* ··· 메뉴 버튼 (hover 시 표시) */}
          <button
            onClick={onOpenMenu}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all flex-shrink-0 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
            aria-label="메시지 옵션"
          >
            <span className="text-sm leading-none">•••</span>
          </button>
        </div>

        {/* 시간 (상대방) */}
        {!isMe && (
          <span className="text-[10px] text-slate-400 mb-1 flex-shrink-0">{formatMessageTime(msg.createdAt)}</span>
        )}
      </div>

      {/* 이모지 반응 */}
      {hasReactions && (
        <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end mr-10" : "ml-10"}`}>
          {Object.entries(msg.reactions ?? {}).map(([emoji, uids]) =>
            uids.length > 0 ? (
              <span key={emoji} className="text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5 shadow-sm cursor-default">
                {emoji} {uids.length}
              </span>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ── ContextMenu ───────────────────────────────────────────────────────────────

function ContextMenu({ msg, isMe, isPinned, onClose, onReply, onEdit, onDelete, onPin, onReact }: {
  msg: ThreadMessage; isMe: boolean; isPinned: boolean;
  onClose: () => void; onReply: () => void; onEdit: () => void;
  onDelete: () => void; onPin: () => void; onReact: (emoji: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl shadow-2xl p-5 pb-10">
        {/* 인용 미리보기 */}
        <div className="px-3 py-2 bg-slate-50 rounded-xl mb-4 text-xs text-slate-500 line-clamp-2">{msg.text}</div>

        {/* 이모지 반응 */}
        <div className="flex justify-around mb-4 pb-4 border-b border-slate-100">
          {EMOJIS.map((emoji) => (
            <button key={emoji} onClick={() => onReact(emoji)} className="text-2xl active:scale-125 transition-transform hover:scale-110">
              {emoji}
            </button>
          ))}
        </div>

        {/* 메뉴 */}
        <div className="flex flex-col gap-0.5">
          <MenuItem icon="reply" label="답장하기" onClick={onReply} />
          <MenuItem icon="push_pin" label={isPinned ? "📌 공지 해제" : "📌 공지로 고정"} onClick={onPin} />
          {isMe && <MenuItem icon="edit" label="수정하기" onClick={onEdit} />}
          {isMe && <MenuItem icon="delete" label="삭제하기" onClick={onDelete} danger />}
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left transition-colors ${danger ? "text-red-500 hover:bg-red-50" : "text-on-surface hover:bg-slate-50"}`}>
      <span className="material-symbols-outlined text-xl">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

// ── EditModal ─────────────────────────────────────────────────────────────────

function EditModal({ initialText, onChange, onSave, onCancel }: {
  initialText: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-t-2xl shadow-2xl p-5 pb-10">
        <h3 className="font-bold text-base mb-3">✏️ 메시지 수정</h3>
        <textarea
          autoFocus
          value={initialText}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave(); } }}
          rows={3}
          maxLength={500}
          className="w-full bg-slate-100 rounded-xl px-4 py-3 text-sm text-on-surface resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">취소</button>
          <button onClick={onSave} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">수정 완료</button>
        </div>
      </div>
    </div>
  );
}
