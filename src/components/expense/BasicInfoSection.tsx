"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const memberUids = Object.keys(members);
  const paidDateTimeLabel = formatPaidDateTime(paidDateLocal, paidTimeLocal);

  const openDateTimePicker = () => {
    setDraftDate(paidDateLocal);
    setDraftTime(paidTimeLocal || "00:00");
    setDateTimePickerOpen(true);
  };

  const applyDateTimePicker = () => {
    onPaidDateChange(draftDate);
    onPaidTimeChange(draftTime);
    setDateTimePickerOpen(false);
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
        <button
          type="button"
          onClick={openDateTimePicker}
          className="flex h-14 w-full items-center gap-3 overflow-hidden rounded-2xl border border-outline-variant bg-white px-4 text-left transition-colors hover:border-primary/40"
        >
          <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-on-surface">{paidDateTimeLabel}</p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-primary">변경</span>
        </button>
        <Dialog open={dateTimePickerOpen} onOpenChange={setDateTimePickerOpen}>
          <DialogContent
            showCloseButton={false}
            className="!fixed !inset-x-0 !bottom-0 !top-auto !left-0 !w-full !max-w-none !translate-x-0 !translate-y-0 !gap-0 rounded-t-2xl rounded-b-none bg-white !p-0 sm:!left-1/2 sm:!top-1/2 sm:!bottom-auto sm:!max-w-sm sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:rounded-2xl"
          >
            <DialogHeader className="border-b border-outline-variant px-5 py-4">
              <DialogTitle className="text-base font-bold">결제일시 변경</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-on-surface-variant">결제일</label>
                <Input
                  type="date"
                  value={draftDate}
                  required
                  aria-label="결제일 선택"
                  onInput={(e) => setDraftDate(e.currentTarget.value)}
                  onChange={(e) => setDraftDate(e.target.value)}
                  className="h-11 rounded-xl border-outline-variant bg-white px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-on-surface-variant">결제 시간</label>
                <Input
                  type="time"
                  value={draftTime}
                  aria-label="결제 시간 선택"
                  onInput={(e) => setDraftTime(e.currentTarget.value)}
                  onChange={(e) => setDraftTime(e.target.value)}
                  className="h-11 rounded-xl border-outline-variant bg-white px-3 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 border-t border-outline-variant px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-xl text-sm font-semibold"
                onClick={() => setDateTimePickerOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                className="h-11 flex-1 rounded-xl text-sm font-semibold"
                onClick={applyDateTimePicker}
              >
                적용
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
