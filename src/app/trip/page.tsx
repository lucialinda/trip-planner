"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, Suspense } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Share2,
  Link as LinkIcon,
  Copy,
  Share,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { MembersDialog } from "@/components/MembersDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ItineraryTab } from "@/components/ItineraryTab";
import { BottomNav } from "@/components/BottomNav";

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
  const [showMembers, setShowMembers] = useState(false);

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

  const handleCopyLink = async () => {
    const code = trip?.code || "";
    const joinUrl = `${window.location.origin}/?joinCode=${code}`;
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast.success("초대 링크가 복사되었습니다!");
    } catch {
      toast.error("링크 복사에 실패했습니다.");
    }
  };

  const handleCopyCode = async () => {
    const code = trip?.code || "";
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`참가 코드(${code})가 복사되었습니다!`);
    } catch {
      toast.error("코드 복사에 실패했습니다.");
    }
  };

  const handleNativeShare = async () => {
    if (!trip) return;
    const code = trip.code || "";
    const joinUrl = `${window.location.origin}/?joinCode=${code}`;
    try {
      await navigator.share({
        title: trip.name,
        text: `여행 플래너에 초대합니다!\n초대 링크: ${joinUrl}`,
      });
    } catch {
      // ignore
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        로딩중...
      </div>
    );
  if (!trip) return null;

  const memberCount = Object.keys(trip.members || {}).length;
  const dLabel = dDayLabel(trip.startDate, trip.endDate);

  return (
    <div className="relative min-h-screen w-full max-w-3xl mx-auto bg-slate-50 pb-24 shadow-sm sm:border-x">
      {/* TopAppBar */}
      <header className="h-14 bg-white/80 backdrop-blur-md border-b border-sky-100 flex items-center justify-between px-2 sticky top-0 z-30">
        <button
          type="button"
          onClick={() => {
            // 직접 진입 등으로 history가 비어 있으면 홈으로 fallback
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          aria-label="뒤로가기"
          className="w-10 h-10 flex items-center justify-center text-primary hover:bg-sky-50 transition-colors active:scale-95 rounded-full"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-base font-bold text-on-surface tracking-tight">
          내 일정
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="공유"
            className="w-10 h-10 flex items-center justify-center text-primary hover:bg-sky-50 transition-colors active:scale-95 rounded-full"
          >
            <Share2 className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyLink}>
              <LinkIcon className="mr-2 h-4 w-4" />
              <span>초대 링크 복사</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyCode}>
              <Copy className="mr-2 h-4 w-4" />
              <span>참가 코드 복사 (6자리)</span>
            </DropdownMenuItem>
            {typeof navigator !== "undefined" && !!navigator.share && (
              <DropdownMenuItem onClick={handleNativeShare}>
                <Share className="mr-2 h-4 w-4" />
                <span>다른 앱으로 공유</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowMembers(true)}>
              <Users className="mr-2 h-4 w-4" />
              <span>멤버 보기 ({memberCount}명)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          ) : (
            <span className="material-symbols-outlined absolute top-3 right-3 text-white/60 text-3xl">
              flight_takeoff
            </span>
          )}
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

      <MembersDialog open={showMembers} onOpenChange={setShowMembers} trip={trip} />

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
