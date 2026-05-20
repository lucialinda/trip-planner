"use client";

import { Input } from "@/components/ui/input";
import { CATEGORY_META, type ExpenseCategory } from "@/lib/expenses";

interface Props {
  category: ExpenseCategory | null;
  onCategoryChange: (c: ExpenseCategory) => void;
  visibleCategories: ExpenseCategory[];
  description: string;
  onDescriptionChange: (v: string) => void;
  paidByUid: string;
  onPaidByChange: (uid: string) => void;
  members: Record<string, string>;
  currentUserUid?: string;
  paidDateLocal: string;
  onPaidDateChange: (v: string) => void;
  paidTimeLocal: string;
  onPaidTimeChange: (v: string) => void;
}

export function BasicInfoSection({
  category,
  onCategoryChange,
  visibleCategories,
  description,
  onDescriptionChange,
  paidByUid,
  onPaidByChange,
  members,
  currentUserUid,
  paidDateLocal,
  onPaidDateChange,
  paidTimeLocal,
  onPaidTimeChange,
}: Props) {
  const memberUids = Object.keys(members);

  return (
    <div className="rounded-2xl border border-outline-variant bg-white/60 px-4 py-4 space-y-4">
      <p className="text-[11px] font-semibold tracking-widest text-on-surface-variant uppercase">
        기본 정보
      </p>

      {/* 카테고리 */}
      <div>
        <label className="text-xs text-on-surface-variant mb-2 block">카테고리</label>
        <div className="grid grid-cols-7 gap-1.5">
          {visibleCategories.map((c) => {
            const meta = CATEGORY_META[c];
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onCategoryChange(c)}
                aria-pressed={active}
                title={meta.label}
                className={[
                  "flex flex-col items-center justify-center gap-0.5",
                  "rounded-xl border py-2 transition-all",
                  active
                    ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
                    : "border-outline-variant bg-white/50 text-on-surface-variant hover:border-primary/40 hover:bg-primary/5",
                ].join(" ")}
              >
                <span
                  className="material-symbols-outlined text-[22px] leading-none"
                  style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {meta.icon}
                </span>
                <span className="text-[9px] font-medium leading-none truncate w-full text-center px-0.5">
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 지출 내역 */}
      <div>
        <label className="text-xs text-on-surface-variant mb-1.5 block">지출 내역</label>
        <Input
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="예) 루브르 입장권, 몽마르트 크레페"
          className="bg-white/80"
        />
      </div>

      {/* 결제자 */}
      <div>
        <label className="text-xs text-on-surface-variant mb-1.5 block">결제자</label>
        <select
          value={paidByUid}
          onChange={(e) => onPaidByChange(e.target.value)}
          className="w-full h-10 rounded-xl border border-outline-variant bg-white/80 px-3 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {memberUids.map((uid) => (
            <option key={uid} value={uid}>
              {members[uid]}
              {uid === currentUserUid ? " (나)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* 결제일/시간 */}
      <div>
        <label className="text-xs text-on-surface-variant mb-1.5 block">결제일</label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={paidDateLocal}
            required
            onChange={(e) => onPaidDateChange(e.target.value)}
            className="bg-white/80 min-w-0 px-2"
          />
          <Input
            type="time"
            value={paidTimeLocal}
            onChange={(e) => onPaidTimeChange(e.target.value)}
            className="bg-white/80 min-w-0 px-2"
          />
        </div>
      </div>
    </div>
  );
}
