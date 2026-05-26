"use client";

import { Check } from "lucide-react";

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
    <section className="py-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-on-surface-variant uppercase">
            정산 인원
          </p>
          <p className="text-[10px] text-on-surface-variant/70 mt-0.5">
            {checkedCount}명에게 나누어 계산돼요
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            전체
          </button>
          <button
            type="button"
            onClick={onSelectOnlyPayer}
            className="rounded-full border border-outline-variant bg-white px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
          >
            결제자만
          </button>
        </div>
      </div>

      {/* 멤버 목록 */}
      <div className="mt-4 divide-y divide-outline-variant">
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
                flex w-full items-center gap-3 py-3 text-left transition-all
                active:scale-[0.98]
                ${checked ? "text-on-surface" : "text-on-surface-variant"}
                ${locked ? "cursor-default" : "cursor-pointer"}
              `}
            >
              {/* Avatar */}
              <div
                className={`
                  flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold
                  ${checked ? "bg-primary/10 text-primary" : "bg-surface-variant text-on-surface-variant"}
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
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  결제자
                </span>
              )}

              {/* 체크 표시 */}
              {!locked && (
                <div
                  className={`
                    flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all
                    ${
                      checked
                        ? "border-primary bg-primary"
                        : "border-outline-variant bg-white"
                    }
                  `}
                >
                  {checked && (
                    <Check className="h-3 w-3 text-white" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
