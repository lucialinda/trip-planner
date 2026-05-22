"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SwipeableItem, type SwipeableItemHandle } from "@/components/ui/SwipeableItem";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import Linkify from "linkify-react";
import { Edit2, MapPin, MoreHorizontal, Trash2 } from "lucide-react";

interface Place {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  time?: string;
  placeUrl?: string;
  note?: string;
  addedBy: string;
  addedByUid: string;
  // Firestore Timestamp
  createdAt: { toMillis: () => number; toDate?: () => Date } | null;
  likes?: Record<string, boolean>;
  dislikes?: Record<string, boolean>;
}

interface ItineraryTabProps {
  tripId: string;
  trip: {
    name?: string;
    startDate?: string;
    endDate?: string;
    memberUids?: string[];
    [key: string]: unknown;
  };
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const FIVE_MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);

function dateRange(start: string, end: string) {
  const dates: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split("T")[0]);
  }
  return dates;
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function badgeMonth(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}

function badgeDay(iso: string) {
  const d = new Date(iso);
  return String(d.getDate());
}

function todayIso() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

function placeStartTime(place: Place) {
  return (place.startTime || place.time || "").trim();
}

function placeEndTime(place: Place) {
  return (place.endTime || "").trim();
}

function formatPlaceTime(place: Place) {
  const startTime = placeStartTime(place);
  const endTime = placeEndTime(place);
  if (startTime && endTime && startTime === endTime) return `출발 ${startTime}`;
  if (startTime && endTime) return `${startTime} ~ ${endTime}`;
  if (startTime) return startTime;
  if (endTime) return `종료 ${endTime}`;
  return "";
}

function isCompleteTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function parsePlaceLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const markdownMatch = trimmed.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
  if (markdownMatch) {
    const label = markdownMatch[1].trim() || "장소 링크";
    const href = normalizeExternalUrl(markdownMatch[2]);
    return href ? { href, label } : null;
  }

  const href = normalizeExternalUrl(trimmed);
  return href ? { href, label: "장소 링크" } : null;
}

function TimeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 13m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M12 10l0 3l2 0" />
      <path d="M7 4l-2.75 2" />
      <path d="M17 4l2.75 2" />
    </svg>
  );
}

function MemoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

interface TimePickerDialogProps {
  open: boolean;
  title: string;
  hour: string;
  minute: string;
  onHourChange: (hour: string) => void;
  onMinuteChange: (minute: string) => void;
  onApply: () => void;
  onClear: () => void;
  onOpenChange: (open: boolean) => void;
}

function TimePickerDialog({
  open,
  title,
  hour,
  minute,
  onHourChange,
  onMinuteChange,
  onApply,
  onClear,
  onOpenChange,
}: TimePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="text-xs font-semibold text-on-surface-variant">시간</div>
            <div className="grid grid-cols-6 gap-1.5">
              {HOURS.map((option) => {
                const selected = option === hour;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onHourChange(option)}
                    className={`h-9 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-slate-200 bg-white/70 text-on-surface hover:border-primary/50 hover:bg-sky-50"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold text-on-surface-variant">
              분
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {FIVE_MINUTE_OPTIONS.map((option) => {
                const selected = option === minute;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onMinuteChange(option)}
                    className={`h-9 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-slate-200 bg-white/70 text-on-surface hover:border-primary/50 hover:bg-sky-50"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClear} className="flex-1">
            선택 안 함
          </Button>
          <Button onClick={onApply} className="flex-1">
            적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function splitTimeSegments(value: string) {
  const [hour = "", minute = ""] = value.split(":");
  return {
    hour: hour.replace(/\D/g, "").slice(0, 2),
    minute: minute.replace(/\D/g, "").slice(0, 2),
  };
}

function composeTimeSegments(hour: string, minute: string) {
  if (!hour && !minute) return "";
  if (hour.length === 2 || minute) return `${hour}:${minute}`;
  return hour;
}

interface TimeSegmentInputProps {
  value: string;
  onChange: (value: string) => void;
  onPickerClick: () => void;
  pickerLabel: string;
}

function TimeSegmentInput({
  value,
  onChange,
  onPickerClick,
  pickerLabel,
}: TimeSegmentInputProps) {
  const hourRef = useRef<HTMLInputElement | null>(null);
  const minuteRef = useRef<HTMLInputElement | null>(null);
  const { hour, minute } = splitTimeSegments(value);

  const selectInput = (input: HTMLInputElement) => {
    requestAnimationFrame(() => input.select());
  };

  const updateHour = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    const nextHour = digits.slice(0, 2);
    const nextMinute = digits.length > 2 ? digits.slice(2, 4) : minute;
    onChange(composeTimeSegments(nextHour, nextMinute));
    if (nextHour.length === 2) {
      requestAnimationFrame(() => {
        minuteRef.current?.focus();
        minuteRef.current?.select();
      });
    }
  };

  const updateMinute = (raw: string) => {
    const nextMinute = raw.replace(/\D/g, "").slice(0, 2);
    onChange(composeTimeSegments(hour, nextMinute));
  };

  return (
    <div className="flex h-9 items-center rounded-md border border-input bg-transparent px-2 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring hover:border-primary/50">
      <input
        ref={hourRef}
        type="text"
        inputMode="numeric"
        aria-label="시간"
        placeholder="HH"
        maxLength={2}
        value={hour}
        onFocus={(e) => selectInput(e.currentTarget)}
        onChange={(e) => updateHour(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === ":" || e.key === "ArrowRight") {
            e.preventDefault();
            minuteRef.current?.focus();
            minuteRef.current?.select();
          }
        }}
        className="h-full w-7 bg-transparent text-center font-medium text-on-surface outline-none placeholder:text-muted-foreground"
      />
      <span className="px-0.5 text-on-surface-variant">:</span>
      <input
        ref={minuteRef}
        type="text"
        inputMode="numeric"
        aria-label="분"
        placeholder="MM"
        maxLength={2}
        value={minute}
        onFocus={(e) => selectInput(e.currentTarget)}
        onChange={(e) => updateMinute(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !minute) {
            e.preventDefault();
            hourRef.current?.focus();
            hourRef.current?.select();
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            hourRef.current?.focus();
            hourRef.current?.select();
          }
        }}
        className="h-full w-7 bg-transparent text-center font-medium text-on-surface outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={onPickerClick}
        aria-label={pickerLabel}
        className="-mr-1 ml-auto flex h-full w-8 items-center justify-center text-on-surface-variant transition-colors hover:text-primary"
      >
        <TimeIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * 정렬 규칙:
 * 1) startTime이 있는 카드를 먼저, 없는 카드는 뒤
 * 2) startTime끼리는 "HH:MM" 사전순 (= 시간 오름차순)
 * 3) startTime 없는 것끼리는 createdAt 내림차순 (최신 등록순)
 * 기존 time 필드는 과거 데이터 호환용 fallback으로 사용한다.
 */
function comparePlaces(a: Place, b: Place) {
  const aTime = placeStartTime(a);
  const bTime = placeStartTime(b);
  const aHas = !!aTime;
  const bHas = !!bTime;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (aHas && bHas) return aTime.localeCompare(bTime);
  const aMs = a.createdAt?.toMillis?.() ?? 0;
  const bMs = b.createdAt?.toMillis?.() ?? 0;
  return bMs - aMs;
}

export function ItineraryTab({ tripId, trip }: ItineraryTabProps) {
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [modalDate, setModalDate] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    startTime: "",
    endTime: "",
    placeUrl: "",
    note: "",
  });
  const [timePickerTarget, setTimePickerTarget] = useState<"startTime" | "endTime" | null>(null);
  const [timePickerHour, setTimePickerHour] = useState("09");
  const [timePickerMinute, setTimePickerMinute] = useState("00");

  // Swipe refs (placeId → handle)
  const swipeRefs = useRef<Map<string, SwipeableItemHandle | null>>(new Map());

  useEffect(() => {
    if (!tripId) return;

    const q = query(
      collection(db, `trips/${tripId}/places`),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const fetched = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Place[];
        setPlaces(fetched);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching places:", error);
        toast.error("일정을 불러오는 데 실패했습니다.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [tripId]);

  const placesByDate = useMemo(() => {
    const grouped: Record<string, Place[]> = {};
    places.forEach((p) => {
      if (!grouped[p.date]) grouped[p.date] = [];
      grouped[p.date].push(p);
    });
    Object.keys(grouped).forEach((d) => grouped[d].sort(comparePlaces));
    return grouped;
  }, [places]);

  const dates = useMemo(() => {
    if (!trip?.startDate || !trip?.endDate) return [];
    return dateRange(trip.startDate, trip.endDate);
  }, [trip]);

  const today = todayIso();
  const todayInTrip = trip?.startDate && trip?.endDate
    ? today >= trip.startDate && today <= trip.endDate
      ? today
      : null
    : null;
  const canManagePlaces = !!user && (trip.memberUids || []).includes(user.uid);

  const nextPlace = useMemo(() => {
    const nowTime = new Date().toTimeString().slice(0, 5);
    const todayUpcoming = (placesByDate[today] || []).find((place) => {
      const startTime = placeStartTime(place);
      return !startTime || startTime > nowTime;
    });
    if (todayUpcoming) return { place: todayUpcoming, isToday: true };

    const futureDate = Object.keys(placesByDate)
      .filter((date) => date > today)
      .sort()
      .find((date) => (placesByDate[date] || []).length > 0);

    if (!futureDate) return null;
    return { place: placesByDate[futureDate][0], isToday: false };
  }, [placesByDate, today]);

  const closeAllSwipes = (exceptId?: string) => {
    swipeRefs.current.forEach((handle, id) => {
      if (id !== exceptId) handle?.close();
    });
  };

  const openTimePicker = (target: "startTime" | "endTime") => {
    const current = formData[target];
    const [hour, minute] = isCompleteTime(current) ? current.split(":") : ["09", "00"];
    setTimePickerHour(hour || "09");
    setTimePickerMinute(minute || "00");
    setTimePickerTarget(target);
  };

  const closeTimePicker = () => {
    setTimePickerTarget(null);
  };

  const applyTimePicker = () => {
    if (!timePickerTarget) return;
    setFormData({
      ...formData,
      [timePickerTarget]: `${timePickerHour}:${timePickerMinute}`,
    });
    closeTimePicker();
  };

  const clearTimePicker = () => {
    if (!timePickerTarget) return;
    setFormData({ ...formData, [timePickerTarget]: "" });
    closeTimePicker();
  };

  const openAddModal = (date: string) => {
    setEditingPlace(null);
    setModalDate(date);
    setFormData({ name: "", startTime: "", endTime: "", placeUrl: "", note: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (place: Place) => {
    setEditingPlace(place);
    setModalDate(place.date);
    setFormData({
      name: place.name,
      startTime: place.startTime || place.time || "",
      endTime: place.endTime || "",
      placeUrl: place.placeUrl || "",
      note: place.note || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("일정 이름을 입력해주세요");
      return;
    }
    if (formData.startTime && !isCompleteTime(formData.startTime)) {
      toast.error("시작 시간을 HH:MM 형식으로 입력해주세요");
      return;
    }
    if (formData.endTime && !isCompleteTime(formData.endTime)) {
      toast.error("종료 시간을 HH:MM 형식으로 입력해주세요");
      return;
    }
    if (!user) return;

    const rawPlaceUrl = formData.placeUrl.trim();
    const placeLink = parsePlaceLink(rawPlaceUrl);
    if (rawPlaceUrl && !placeLink) {
      toast.error("올바른 장소 링크를 입력해주세요");
      return;
    }

    try {
      if (editingPlace) {
        await updateDoc(doc(db, `trips/${tripId}/places`, editingPlace.id), {
          name: formData.name.trim(),
          time: "",
          startTime: formData.startTime,
          endTime: formData.endTime,
          placeUrl: rawPlaceUrl,
          note: formData.note.trim(),
        });
        toast.success("일정이 수정되었습니다.");
      } else {
        await addDoc(collection(db, `trips/${tripId}/places`), {
          name: formData.name.trim(),
          date: modalDate,
          time: "",
          startTime: formData.startTime,
          endTime: formData.endTime,
          placeUrl: rawPlaceUrl,
          note: formData.note.trim(),
          addedBy: user.displayName || "익명",
          addedByUid: user.uid,
          createdAt: serverTimestamp(),
        });
        toast.success("일정이 추가되었습니다.");
      }
      setIsModalOpen(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`실패: ${message}`);
    }
  };

  const handleDelete = async (placeId: string) => {
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, `trips/${tripId}/places`, placeId));
      toast.success("일정이 삭제되었습니다.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`삭제 실패: ${message}`);
    }
  };

  const handleCopyNote = async (note: string) => {
    const copyWithFallback = () => {
      const textarea = document.createElement("textarea");
      textarea.value = note;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      return copied;
    };

    try {
      if (!copyWithFallback()) {
        if (!navigator.clipboard?.writeText) {
          throw new Error("copy fallback failed");
        }
        await navigator.clipboard.writeText(note);
      }
      toast.success("메모가 복사되었습니다.");
    } catch {
      toast.error("메모 복사에 실패했습니다.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        날짜 정보가 없습니다.
      </div>
    );
  }

  return (
    <div className="pb-32 relative">
      {nextPlace && (() => {
        const { place, isToday } = nextPlace;
        const diffDays = Math.round(
          (new Date(place.date).getTime() - new Date(today).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        const dayLabel = diffDays === 0 ? "D-Day" : `D-${diffDays}`;
        const timeLabel = formatPlaceTime(place);

        return (
          <div className="mb-5">
            <div className="mb-2 text-sm font-bold text-on-surface">
              다가오는 일정
            </div>
            <div className="relative overflow-hidden rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-[0_3px_12px_rgba(15,23,42,0.10)]">
              <div className="absolute inset-y-0 left-0 w-1 bg-sky-400" />
              <div className="flex items-center gap-3">
                <div className="w-11 shrink-0 text-center">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                    {badgeMonth(place.date)}
                  </div>
                  <div className="mt-0.5 text-lg font-extrabold leading-none text-slate-800">
                    {badgeDay(place.date)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-on-surface">
                    {place.name}
                  </div>
                  {timeLabel && (
                    <div className="mt-0.5 truncate text-xs text-on-surface-variant">
                      {timeLabel}
                    </div>
                  )}
                </div>
                <div className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-600">
                  {dayLabel}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Day 섹션들 */}
      {dates.map((date, index) => {
        const dayPlaces = placesByDate[date] || [];
        const isToday = date === todayInTrip;

        return (
          <section key={date} className="mb-8">
            <div className="text-sm font-bold mb-3 flex items-center justify-between">
              <span className={isToday ? "text-tertiary" : "text-primary"}>
                {isToday && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse mr-1.5 align-middle" />
                )}
                Day {index + 1} · {dateLabel(date)}
              </span>
              {dayPlaces.length > 0 && (
                <span className="text-[11px] font-medium text-on-surface-variant">
                  {dayPlaces.length}개
                </span>
              )}
            </div>

            <div className="space-y-2">
              {dayPlaces.map((place, pIdx) => {
                const canManage = canManagePlaces;
                const highlight = isToday && pIdx === 0;
                const timeLabel = formatPlaceTime(place);
                const placeLink = parsePlaceLink(place.placeUrl || "");

                const cardContent = (
                  <div
                    className={`${
                      highlight ? "glass-elevated" : "glass-panel"
                    } relative p-4 rounded-xl flex items-start gap-3`}
                  >
                    {/* 날짜 배지 */}
                    <div
                      className={`flex-shrink-0 w-12 h-12 flex flex-col items-center justify-center rounded-lg border ${
                        highlight
                          ? "bg-violet-50 text-violet-700 border-violet-200"
                          : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      <span className="text-[9px] font-bold uppercase leading-none">
                        {badgeMonth(place.date)}
                      </span>
                      <span className="text-lg font-extrabold leading-none mt-0.5">
                        {badgeDay(place.date)}
                      </span>
                    </div>

                    {/* 본문 */}
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-on-surface leading-tight truncate">
                          {place.name}
                        </h3>
                      </div>
                      {timeLabel && (
                        <div className="mt-1.5 flex items-start gap-1 text-[13px] leading-5 text-on-surface-variant">
                          <TimeIcon className="mt-1 h-3 w-3 shrink-0" />
                          <span className="min-w-0 break-words">{timeLabel}</span>
                        </div>
                      )}
                      {place.note && (
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label="메모 복사"
                          title="메모 복사"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyNote(place.note || "");
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            e.stopPropagation();
                            handleCopyNote(place.note || "");
                          }}
                          className="mt-1.5 flex max-w-full items-start gap-1 text-left text-[13px] leading-5 text-on-surface-variant transition-colors hover:text-primary"
                        >
                          <MemoIcon className="mt-1 h-3 w-3 shrink-0" />
                          <span className="min-w-0 max-w-[16rem] truncate">
                            <Linkify
                              options={{
                                target: "_blank",
                                rel: "noopener noreferrer",
                                className: "text-primary hover:underline",
                                attributes: {
                                  onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
                                    e.stopPropagation();
                                  },
                                },
                              }}
                            >
                              {place.note}
                            </Linkify>
                          </span>
                        </div>
                      )}
                      {placeLink && (
                        <a
                          href={placeLink.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1.5 flex items-start gap-1 text-[13px] leading-5 text-on-surface-variant hover:underline"
                        >
                          <MapPin className="mt-1 h-3 w-3 shrink-0" strokeWidth={2} />
                          <span className="min-w-0 break-words">{placeLink.label}</span>
                        </a>
                      )}
                    </div>

                    {/* 액션 메뉴 (여행 멤버만) */}
                    {canManage && (
                      <button
                        type="button"
                        aria-label="일정 관리 메뉴"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeAllSwipes(place.id);
                          swipeRefs.current.get(place.id)?.toggle();
                        }}
                        className="absolute right-1.5 top-1 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                );

                if (!canManage) {
                  return <div key={place.id}>{cardContent}</div>;
                }

                return (
                  <SwipeableItem
                    key={place.id}
                    actionWidth={120}
                    ref={(handle) => {
                      if (handle) {
                        swipeRefs.current.set(place.id, handle);
                      } else {
                        swipeRefs.current.delete(place.id);
                      }
                    }}
                    onOpenChange={(open) => {
                      if (open) closeAllSwipes(place.id);
                    }}
                    actions={
                      <div className="flex h-full w-full items-center justify-center gap-1.5 pl-2 pr-1">
                        <button
                          type="button"
                          aria-label="수정"
                          onClick={() => {
                            swipeRefs.current.get(place.id)?.close();
                            openEditModal(place);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/15 text-slate-700 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-white/25 active:scale-95"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="삭제"
                          onClick={() => {
                            swipeRefs.current.get(place.id)?.close();
                            handleDelete(place.id);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/15 text-slate-700 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-rose-500/40 hover:text-white active:scale-95"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    }
                  >
                    {cardContent}
                  </SwipeableItem>
                );
              })}
            </div>

            <button
              onClick={() => openAddModal(date)}
              className="mt-2 w-full py-2.5 border border-dashed border-sky-200 rounded-xl text-sm text-on-surface-variant hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1 bg-white/40"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              일정 추가
            </button>
          </section>
        );
      })}

      {/* 일정 추가/수정 모달 */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {editingPlace ? "일정 수정" : "일정 추가"} · {dateLabel(modalDate)}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <section className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  일정 이름 <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="예: 에펠탑 구경"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">
                    시작 시간 <span className="font-normal text-slate-400">(선택)</span>
                  </label>
                  <TimeSegmentInput
                    value={formData.startTime}
                    onChange={(value) =>
                      setFormData({ ...formData, startTime: value })
                    }
                    onPickerClick={() => openTimePicker("startTime")}
                    pickerLabel="시작 시간 선택"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">
                    종료 시간 <span className="font-normal text-slate-400">(선택)</span>
                  </label>
                  <TimeSegmentInput
                    value={formData.endTime}
                    onChange={(value) =>
                      setFormData({ ...formData, endTime: value })
                    }
                    onPickerClick={() => openTimePicker("endTime")}
                    pickerLabel="종료 시간 선택"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-2 border-t border-slate-100 pt-4">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <span className="material-symbols-outlined text-[17px] text-primary">
                  location_on
                </span>
                장소 <span className="font-normal text-slate-400">(선택)</span>
              </label>
              <Input
                type="text"
                inputMode="url"
                placeholder="[에펠탑](https://maps.app.goo.gl/...) 또는 URL"
                value={formData.placeUrl}
                onChange={(e) =>
                  setFormData({ ...formData, placeUrl: e.target.value })
                }
              />
            </section>

            <section className="space-y-2 border-t border-slate-100 pt-4">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <span className="material-symbols-outlined text-[17px] text-primary">
                  notes
                </span>
                메모 <span className="font-normal text-slate-400">(선택)</span>
              </label>
              <textarea
                className="flex min-h-[80px] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="간단한 메모"
                value={formData.note}
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
                rows={3}
              />
            </section>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} className="w-full">
              {editingPlace ? "수정하기" : "추가하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TimePickerDialog
        open={!!timePickerTarget}
        title={timePickerTarget === "endTime" ? "종료 시간 선택" : "시작 시간 선택"}
        hour={timePickerHour}
        minute={timePickerMinute}
        onHourChange={setTimePickerHour}
        onMinuteChange={setTimePickerMinute}
        onApply={applyTimePicker}
        onClear={clearTimePicker}
        onOpenChange={(open) => {
          if (!open) closeTimePicker();
        }}
      />
    </div>
  );
}
