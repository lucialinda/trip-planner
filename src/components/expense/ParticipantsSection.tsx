"use client";

interface Props {
  memberUids: string[];
  members: Record<string, string>;
  participants: Record<string, true>;
  paidByUid: string;
  currentUserUid?: string;
  onToggle: (uid: string) => void;
  onSelectAll: () => void;
  onSelectOnlyPayer: () => void;
}

export function ParticipantsSection({
  memberUids,
  members,
  participants,
  paidByUid,
  currentUserUid,
  onToggle,
  onSelectAll,
  onSelectOnlyPayer,
}: Props) {
  const checkedCount = Object.keys(participants).length;

  return (
    <div className="rounded-2xl border border-outline-variant bg-white/60 px-4 py-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-on-surface-variant uppercase">
            정산 인원
          </p>
          <p className="text-[10px] text-on-surface-variant/70 mt-0.5">
            {checkedCount}명 선택됨
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-[11px] font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors"
          >
            전체
          </button>
          <button
            type="button"
            onClick={onSelectOnlyPayer}
            className="text-[11px] font-semibold text-on-surface-variant bg-white/60 border border-outline-variant px-3 py-1.5 rounded-full hover:border-primary/40 hover:text-primary transition-colors"
          >
            결제자만
          </button>
        </div>
      </div>

      {/* 멤버 목록 */}
      <div className="space-y-2">
        {memberUids.map((uid) => {
          const checked = !!participants[uid] || uid === paidByUid;
          const locked = uid === paidByUid;
          const name = members[uid] ?? "(이름 없음)";
          const isMe = uid === currentUserUid;
          const initial = name.charAt(0).toUpperCase();

          return (
            <button
              key={uid}
              type="button"
              disabled={locked}
              onClick={() => onToggle(uid)}
              className={`
                w-full flex items-center gap-3 rounded-xl border px-3 py-3 transition-all text-left
                active:scale-[0.98]
                ${
                  checked
                    ? "border-primary/40 bg-primary/5"
                    : "border-outline-variant bg-white/50 hover:border-primary/30 hover:bg-primary/5"
                }
                ${locked ? "cursor-default" : "cursor-pointer"}
              `}
            >
              {/* Avatar */}
              <div
                className={`
                  flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold
                  ${checked ? "bg-primary/20 text-primary" : "bg-outline-variant/30 text-on-surface-variant"}
                `}
              >
                {initial}
              </div>

              {/* 이름 */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-on-surface">
                  {name}
                </span>
                {isMe && (
                  <span className="text-xs text-on-surface-variant ml-1">(나)</span>
                )}
              </div>

              {/* 결제자 badge */}
              {locked && (
                <span className="shrink-0 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                  결제자
                </span>
              )}

              {/* 체크 표시 */}
              {!locked && (
                <div
                  className={`
                    shrink-0 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all
                    ${
                      checked
                        ? "border-primary bg-primary"
                        : "border-outline-variant bg-white"
                    }
                  `}
                >
                  {checked && (
                    <svg
                      className="w-3 h-3 text-white"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2.5 6l2.5 2.5 4.5-5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
