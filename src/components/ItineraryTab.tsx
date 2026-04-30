"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SwipeableItem } from "@/components/ui/SwipeableItem";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  createdAt: any;
  likes?: Record<string, boolean>;
  dislikes?: Record<string, boolean>;
}

interface ItineraryTabProps {
  tripId: string;
  trip: any; // name, startDate, endDate, etc.
}

function dateRange(start: string, end: string) {
  const dates = [];
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split('T')[0]);
  }
  return dates;
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

export function ItineraryTab({ tripId, trip }: ItineraryTabProps) {
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [modalDate, setModalDate] = useState<string>("");
  const [formData, setFormData] = useState({ name: "", time: "", note: "" });

  useEffect(() => {
    if (!tripId) return;

    const q = query(
      collection(db, `trips/${tripId}/places`),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const fetchedPlaces = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Place[];

      setPlaces(fetchedPlaces);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching places:", error);
      toast.error("일정을 불러오는 데 실패했습니다.");
      setLoading(false);
    });

    return () => unsub();
  }, [tripId]);

  const placesByDate = useMemo(() => {
    const grouped: Record<string, Place[]> = {};
    places.forEach(p => {
      if (!grouped[p.date]) grouped[p.date] = [];
      grouped[p.date].push(p);
    });
    return grouped;
  }, [places]);

  const dates = useMemo(() => {
    if (!trip?.startDate || !trip?.endDate) return [];
    return dateRange(trip.startDate, trip.endDate);
  }, [trip]);

  const openAddModal = (date: string) => {
    setEditingPlace(null);
    setModalDate(date);
    setFormData({ name: "", time: "", note: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (place: Place) => {
    setEditingPlace(place);
    setModalDate(place.date);
    setFormData({ name: place.name, time: place.time || "", note: place.note || "" });
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
          note: formData.note.trim()
        });
        toast.success("일정이 수정되었습니다.");
      } else {
        await addDoc(collection(db, `trips/${tripId}/places`), {
          name: formData.name.trim(),
          date: modalDate,
          time: formData.time,
          note: formData.note.trim(),
          addedBy: user.displayName || '익명',
          addedByUid: user.uid,
          createdAt: serverTimestamp()
        });
        toast.success("일정이 추가되었습니다.");
      }
      setIsModalOpen(false);
    } catch (e: any) {
      toast.error(`실패: ${e.message}`);
    }
  };

  const handleDelete = async (placeId: string) => {
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, `trips/${tripId}/places`, placeId));
      toast.success("일정이 삭제되었습니다.");
    } catch (e: any) {
      toast.error(`삭제 실패: ${e.message}`);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div></div>;
  }

  if (dates.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">날짜 정보가 없습니다.</div>;
  }

  return (
    <div className="pb-20">
      {dates.map((date, index) => {
        const dayPlaces = placesByDate[date] || [];

        return (
          <div key={date} className="mb-8">
            <div className="text-sm font-bold text-primary mb-3 flex items-center justify-between">
              <span>Day {index + 1} &middot; {dateLabel(date)}</span>
            </div>

            {dayPlaces.map(place => {
              const canManage = place.addedByUid === user?.uid;

              const cardContent = (
                <div className="bg-white border rounded-xl p-3 mb-2 flex flex-col shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-[15px] text-slate-900">{place.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {place.time && <span>{place.time} &middot; </span>}
                        작성자: {place.addedBy}
                      </div>
                    </div>
                  </div>
                  {place.note && (
                    <div className="text-[13px] text-slate-700 mt-2 whitespace-pre-wrap">
                      <Linkify options={{ target: '_blank', rel: 'noopener noreferrer', className: 'text-blue-500 hover:underline' }}>
                        {place.note}
                      </Linkify>
                    </div>
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
                  actions={
                    <div className="flex w-full h-full mb-2 rounded-r-xl overflow-hidden ml-1 shadow-sm">
                      <button
                        onClick={() => openEditModal(place)}
                        className="flex-1 bg-primary text-white text-xs font-bold transition-colors hover:bg-primary/90"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(place.id)}
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

            <button
              onClick={() => openAddModal(date)}
              className="w-full py-2.5 border border-dashed rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1 bg-slate-50/50"
            >
              <span>+</span> 일정 추가
            </button>
          </div>
        );
      })}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>{editingPlace ? '일정 수정' : '일정 추가'} &middot; {dateLabel(modalDate)}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">일정 이름 <span className="text-red-500">*</span></label>
              <Input
                placeholder="예: 에펠탑 구경"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">시간 (선택)</label>
              <Input
                type="time"
                value={formData.time}
                onChange={e => setFormData({ ...formData, time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">메모 (선택)</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="간단한 메모 (URL 입력 시 링크로 변환됩니다)"
                value={formData.note}
                onChange={e => setFormData({ ...formData, note: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} className="w-full">{editingPlace ? '수정하기' : '추가하기'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
