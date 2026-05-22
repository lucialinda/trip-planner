"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, Suspense } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { ItineraryTab } from "@/components/ItineraryTab";
import { BottomNav } from "@/components/BottomNav";
import { ProfileDialog } from "@/components/ProfileDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
        </div>
      </section>

      {/* Itinerary 본문 (탭 제거 — BottomNav로 통합) */}
      <div className="px-4">
        <ItineraryTab tripId={tripId as string} trip={trip} />
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />

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
