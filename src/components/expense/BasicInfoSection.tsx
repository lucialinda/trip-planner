"use client";

import { CalendarClock } from "lucide-react";
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

function formatPaidDateTime(dateValue: string, timeValue: string): string {
  if (!dateValue) return "결제일시를 선택해주세요";

  const [year, month, day] = dateValue.split("-");
  const [hourRaw = "00", minute = "00"] = (timeValue || "00:00").split(":");
  const hour = Number(hourRaw);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;

  if (!year || !month || !day) return "결제일시를 선택해주세요";
  return `${year}.${month}.${day} · ${period} ${String(displayHour).padStart(2, "0")}:${minute}`;
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
  const paidDateTimeValue = paidDateLocal
    ? `${paidDateLocal}T${paidTimeLocal || "00:00"}`
    : "";
  const paidDateTimeLabel = formatPaidDateTime(paidDateLocal, paidTimeLocal);

  const handleDateTimeChange = (value: string) => {
    const [date, time] = value.split("T");
    onPaidDateChange(date ?? "");
    onPaidTimeChange(time ?? "");
  };

  return (
    <section className="border-b border-outline-variant py-5">
      <p className="text-[11px] font-semibold tracking-widest text-on-surface-variant uppercase">
        기본 정보
      </p>

      {/* 카테고리 */}
      <div className="mt-4">
        <label className="mb-2 block text-xs font-medium text-on-surface-variant">카테고리</label>
        <div className="flex flex-wrap gap-2">
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
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all",
                  active
                    ? "border-primary bg-primary text-white shadow-sm"
                    : "border-outline-variant bg-white text-on-surface-variant hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
                ].join(" ")}
              >
                <span
                  className="material-symbols-outlined text-[18px] leading-none"
                  style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {meta.icon}
                </span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 지출 내역 */}
      <div className="mt-5">
        <label className="mb-1.5 block text-xs font-medium text-on-surface-variant">지출 내역</label>
        <Input
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="예) 루브르 입장권, 몽마르트 크레페"
          className="h-11 rounded-xl border-outline-variant bg-white text-sm"
        />
      </div>

      {/* 결제자 */}
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium text-on-surface-variant">결제자</label>
        <select
          value={paidByUid}
          onChange={(e) => onPaidByChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-outline-variant bg-white px-3 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
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
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium text-on-surface-variant">결제일</label>
        <div className="relative flex h-12 items-center gap-3 rounded-xl border border-outline-variant bg-white px-3">
          <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-on-surface">{paidDateTimeLabel}</p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-primary">변경</span>
          <input
            type="datetime-local"
            value={paidDateTimeValue}
            required
            onChange={(e) => handleDateTimeChange(e.target.value)}
            aria-label="결제일시"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
    </section>
  );
}
