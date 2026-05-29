"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, Suspense } from "react";
import { collection, doc, getDocs, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ItineraryTab } from "@/components/ItineraryTab";
import { BottomNav } from "@/components/BottomNav";
import { ProfileDialog } from "@/components/ProfileDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isAdminUid } from "@/lib/admin";

interface TripData {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  code?: string;
  members?: Record<string, string>;
  createdByUid?: string;
  heroPhotoURL?: string | null;
  [key: string]: unknown;
}

function dDayLabel(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return "";
  const today = new Date().toISOString().split("T")[0];
  if (today < startDate) {
    const diff = Math.round(
      (new Date(startDate).getTime() - new Date(today).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    return `D-${diff}`;
  }
  if (today > endDate) return "다녀온 여행";
  return "여행 중";
}

function TripContent() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("id");
  const { user } = useAuth();
  const router = useRouter();

  const [trip, setTrip] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [savingTrip, setSavingTrip] = useState(false);

  useEffect(() => {
    if (!user || !tripId) {
      if (!tripId && !loading) router.push("/");
      return;
    }

    const unsub = onSnapshot(doc(db, "trips", tripId), (docSnap) => {
      if (docSnap.exists()) {
        setTrip({ id: docSnap.id, ...docSnap.data() } as TripData);
      } else {
        toast.error("여행 정보를 찾을 수 없습니다.");
        router.push("/");
      }
      setLoading(false);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, user, router]);

  const isAdmin = isAdminUid(user?.uid);

  const handleOpenTripEdit = () => {
    if (!trip) return;
    setEditName(trip.name || "");
    setEditStartDate(trip.startDate || "");
    setEditEndDate(trip.endDate || "");
    setEditOpen(true);
  };

  const handleSaveTrip = async () => {
    if (!tripId || !trip || !isAdmin) return;

    const nextName = editName.trim();
    if (!nextName || !editStartDate || !editEndDate) {
      toast.error("여행 이름과 날짜를 입력해주세요.");
      return;
    }
    if (editStartDate > editEndDate) {
      toast.error("귀국일이 출발일보다 빠를 수 없습니다.");
      return;
    }

    setSavingTrip(true);
    try {
      const placesSnap = await getDocs(collection(db, "trips", tripId, "places"));
      const outsidePlace = placesSnap.docs.find((placeDoc) => {
        const date = placeDoc.data().date;
        return typeof date === "string" && (date < editStartDate || date > editEndDate);
      });

      if (
        outsidePlace &&
        !window.confirm("새 여행 기간 밖에 있는 일정이 있습니다. 여행 기간만 수정할까요?")
      ) {
        return;
      }

      await updateDoc(doc(db, "trips", tripId), {
        name: nextName,
        startDate: editStartDate,
        endDate: editEndDate,
      });

      toast.success("여행 정보가 수정되었습니다.");
      setEditOpen(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`수정 실패: ${message}`);
    } finally {
      setSavingTrip(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        로딩중...
      </div>
    );
  if (!trip) return null;

  const dLabel = dDayLabel(trip.startDate, trip.endDate);
  const profilePhoto = user?.photoURL || null;

  return (
    <div className="relative min-h-screen w-full max-w-3xl mx-auto bg-slate-50 pb-24 shadow-sm sm:border-x">
      {/* TopAppBar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-sky-100 bg-white/80 px-2 backdrop-blur-md">
        <div className="h-10 w-10" aria-hidden="true" />
        <h1 className="text-base font-bold tracking-tight text-on-surface">
          일정
        </h1>
        <button
          type="button"
          aria-label="프로필"
          onClick={() => setProfileOpen(true)}
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full glass-card text-primary"
        >
          {profilePhoto ? (
            <Avatar className="h-10 w-10">
              <AvatarImage src={profilePhoto} className="object-cover" />
              <AvatarFallback className="bg-primary/10 text-sm text-primary">
                {(user?.displayName || "?").charAt(0)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="material-symbols-outlined">person</span>
          )}
        </button>
      </header>

      {/* Hero Section */}
      <section className="px-4 mt-4 mb-6">
        <div
          className={`relative rounded-xl overflow-hidden shadow-md ${
            trip.heroPhotoURL ? "" : "bg-gradient-to-br from-primary via-primary-container to-tertiary"
          }`}
          style={{ aspectRatio: "2 / 1" }}
        >
          {trip.heroPhotoURL ? (
            <img
              src={trip.heroPhotoURL}
              alt={trip.name || "여행 대표 사진"}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : null}
          {/* 텍스트 가독용 어두운 그라디언트 */}
          <div
            className={`absolute inset-0 ${
              trip.heroPhotoURL
                ? "bg-gradient-to-t from-black/65 via-black/15 to-black/25"
                : "bg-gradient-to-t from-black/60 to-transparent"
            }`}
          />

          {/* 하단 텍스트 */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="min-w-0">
              {dLabel && (
                <span className="px-2 py-1 rounded bg-primary text-white text-[10px] font-bold uppercase tracking-wider">
                  {dLabel}
                </span>
              )}
              <h2 className="text-white text-2xl font-bold mt-1.5 truncate drop-shadow-sm">
                {trip.name}
              </h2>
              <p className="text-white/85 text-xs mt-0.5">
                {trip.startDate} ~ {trip.endDate}
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenTripEdit}
              aria-label="여행 정보 수정"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/15 text-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-white/25 active:scale-95"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>

      {/* Itinerary 본문 (탭 제거 — BottomNav로 통합) */}
      <div className="px-4">
        <ItineraryTab tripId={tripId as string} trip={trip} />
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>여행 정보 수정</DialogTitle>
            <DialogDescription>
              여행 이름과 전체 여행 기간을 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-muted-foreground">
                여행 이름
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="예: 파리 7박8일"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-muted-foreground">
                출발일
              </label>
              <Input
                type="date"
                value={editStartDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditStartDate(val);
                  if (!editEndDate || editEndDate < val) setEditEndDate(val);
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-muted-foreground">
                귀국일
              </label>
              <Input
                type="date"
                min={editStartDate}
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditOpen(false)}
                disabled={savingTrip}
              >
                취소
              </Button>
              <Button className="flex-1" onClick={handleSaveTrip} disabled={savingTrip}>
                {savingTrip && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                수정하기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 하단 네비게이션 */}
      <BottomNav />
    </div>
  );
}

export default function TripPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
          로딩중...
        </div>
      }
    >
      <TripContent />
    </Suspense>
  );
}
