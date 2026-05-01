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

interface Place {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  time?: string;
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
    [key: string]: unknown;
  };
}

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

/**
 * 정렬 규칙:
 * 1) time이 있는 카드를 먼저, 없는 카드는 뒤
 * 2) time끼리는 "HH:MM" 사전순 (= 시간 오름차순)
 * 3) time 없는 것끼리는 createdAt 내림차순 (최신 등록순)
 */
function comparePlaces(a: Place, b: Place) {
  const aHas = !!(a.time && a.time.trim());
  const bHas = !!(b.time && b.time.trim());
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (aHas && bHas) return (a.time || "").localeCompare(b.time || "");
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
  const [formData, setFormData] = useState({ name: "", time: "", note: "" });

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

  const closeAllSwipes = (exceptId?: string) => {
    swipeRefs.current.forEach((handle, id) => {
      if (id !== exceptId) handle?.close();
    });
  };

  const openAddModal = (date: string) => {
    setEditingPlace(null);
    setModalDate(date);
    setFormData({ name: "", time: "", note: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (place: Place) => {
    setEditingPlace(place);
    setModalDate(place.date);
    setFormData({
      name: place.name,
      time: place.time || "",
      note: place.note || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("일정 이름을 입력해주세요");
      return;
    }
    if (!user) return;

    try {
      if (editingPlace) {
        await updateDoc(doc(db, `trips/${tripId}/places`, editingPlace.id), {
          name: formData.name.trim(),
          time: formData.time,
          note: formData.note.trim(),
        });
        toast.success("일정이 수정되었습니다.");
      } else {
        await addDoc(collection(db, `trips/${tripId}/places`), {
          name: formData.name.trim(),
          date: modalDate,
          time: formData.time,
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
                const canManage = place.addedByUid === user?.uid;
                const highlight = isToday && pIdx === 0;

                const cardContent = (
                  <div
                    className={`${
                      highlight ? "glass-elevated" : "glass-panel"
                    } p-4 rounded-xl flex items-start gap-3`}
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
                      {place.time && (
                        <p className="text-xs text-on-surface-variant mt-1">
                          <span className="font-medium text-on-surface">
                            {place.time}
                          </span>
                        </p>
                      )}
                      {place.note && (
                        <div className="text-[13px] text-on-surface-variant mt-1.5 flex items-start gap-1">
                          <span className="material-symbols-outlined text-[14px] mt-0.5 shrink-0">
                            location_on
                          </span>
                          <span className="whitespace-pre-wrap break-words min-w-0">
                            <Linkify
                              options={{
                                target: "_blank",
                                rel: "noopener noreferrer",
                                className: "text-primary hover:underline",
                              }}
                            >
                              {place.note}
                            </Linkify>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* more_vert (관리자만) */}
                    {canManage && (
                      <button
                        type="button"
                        aria-label="수정/삭제 메뉴"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeAllSwipes(place.id);
                          swipeRefs.current.get(place.id)?.toggle();
                        }}
                        className="shrink-0 p-1 -mr-1 text-on-surface-variant hover:text-primary transition-colors rounded-full"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          more_vert
                        </span>
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
                    actionWidth={130}
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
                      <div className="flex w-full h-full mb-2 rounded-r-xl overflow-hidden ml-1 shadow-sm">
                        <button
                          type="button"
                          onClick={() => {
                            swipeRefs.current.get(place.id)?.close();
                            openEditModal(place);
                          }}
                          className="flex-1 bg-primary text-white text-xs font-bold transition-colors hover:bg-primary/90"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            swipeRefs.current.get(place.id)?.close();
                            handleDelete(place.id);
                          }}
                          className="flex-1 bg-red-500 text-white text-xs font-bold transition-colors hover:bg-red-600"
                        >
                          삭제
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
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                시간 (선택)
              </label>
              <Input
                type="time"
                value={formData.time}
                onChange={(e) =>
                  setFormData({ ...formData, time: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                메모 (선택)
              </label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="간단한 메모 (URL 입력 시 링크로 변환됩니다)"
                value={formData.note}
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} className="w-full">
              {editingPlace ? "수정하기" : "추가하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
