"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, use } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Compass, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ItineraryTab } from "@/components/ItineraryTab";
import { BottomNav } from "@/components/BottomNav";

export default function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const [trip, setTrip] = useState<{
    id: string;
    name?: string;
    startDate?: string;
    endDate?: string;
    code?: string;
    members?: Record<string, string>;
    [key: string]: unknown;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");

  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(doc(db, "trips", tripId), (docSnap) => {
      if (docSnap.exists()) {
        setTrip({ id: docSnap.id, ...docSnap.data() });
      } else {
        toast.error("여행 정보를 찾을 수 없습니다.");
        router.push("/");
      }
      setLoading(false);
    });

    return () => unsub();
  }, [tripId, user, router]);

  const handleShare = () => {
    if (!trip) return;
    const code = trip.code || "";
    if (navigator.share) {
      navigator.share({ title: trip.name, text: `여행 코드: ${code}` });
    } else {
      navigator.clipboard.writeText(code).then(() => toast.success(`코드 복사됨: ${code}`));
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">로딩중...</div>;
  if (!trip) return null;

  const membersCount = Object.keys(trip.members || {}).length;

  return (
    <div className="relative min-h-screen max-w-md mx-auto bg-slate-50 pb-20 shadow-sm">
      {/* Hero 섹션 (헤더 역할 겸용) */}
      <section className="relative h-52 overflow-hidden">
        {/* 그라디언트 배경 */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-sky-500 to-sky-400" />
        {/* 장식: 동심원 라이트 효과 */}
        <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-12 w-56 h-56 rounded-full bg-cyan-200/20 blur-2xl" />
        {/* 텍스트 가독용 하단 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* 상단 액션 바 */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="뒤로가기"
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowPlaceSearch(true)}
              aria-label="장소 검색"
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:scale-95"
            >
              <Compass className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="공유"
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:scale-95"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowMembers(true)}
              aria-label="멤버"
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:scale-95"
            >
              <Users className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 하단 텍스트 */}
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <span className="text-[11px] font-semibold text-sky-100 uppercase tracking-widest mb-1 block">
            Current Trip
          </span>
          <h1 className="text-2xl font-bold text-white truncate drop-shadow-sm">
            {trip.name}
          </h1>
          <p className="text-xs text-white/85 mt-1">
            {trip.startDate} ~ {trip.endDate}
          </p>
        </div>
      </section>

      {/* 내부 탭 */}
      <Tabs defaultValue="itinerary" className="flex flex-col">
        <TabsList className="w-full h-12 bg-white border-b rounded-none justify-between px-2 sticky top-0 z-20 shadow-sm">
          <TabsTrigger
            value="itinerary"
            className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none text-sm"
          >
            📅 일정
          </TabsTrigger>
          <TabsTrigger
            value="votes"
            className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none text-sm"
          >
            🗳️ 투표
          </TabsTrigger>
          <TabsTrigger
            value="budget"
            className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none text-sm"
          >
            💰 예산
          </TabsTrigger>
          <TabsTrigger
            value="threads"
            className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none text-sm"
          >
            💬 채팅
          </TabsTrigger>
        </TabsList>

        <div className="px-4 pt-4">
          <TabsContent value="itinerary" className="m-0">
            <ItineraryTab tripId={tripId} trip={trip} />
          </TabsContent>
          <TabsContent value="votes" className="m-0">
            <div className="text-center text-sm text-muted-foreground py-8">
              투표 컴포넌트 개발 예정
            </div>
          </TabsContent>
          <TabsContent value="budget" className="m-0">
            <div className="text-center text-sm text-muted-foreground py-8">
              예산 컴포넌트 개발 예정
            </div>
          </TabsContent>
          <TabsContent value="threads" className="m-0">
            <div className="text-center text-sm text-muted-foreground py-8">
              스레드 컴포넌트 개발 예정
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Place Search Modal (stub - Google Maps 연동 예정) */}
      <Dialog open={showPlaceSearch} onOpenChange={setShowPlaceSearch}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>장소 검색</DialogTitle>
            <DialogDescription>
              여행에 추가할 장소를 검색해보세요. (Google Maps 연동 예정)
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input
              placeholder="예: 제주 신라 호텔, 우도 등대..."
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              autoFocus
            />
            <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-4 text-center text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-2xl text-primary/60 block mb-1">
                map
              </span>
              곧 Google Maps 검색 결과가 여기에 표시됩니다.
              <br />
              지금은 일정 카드의 메모 칸에 장소명을 직접 입력해 주세요.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Members Modal */}
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>여행 멤버 ({membersCount}명)</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(trip.members || {}).map(([uid, name]) => (
              <div key={uid} className="flex items-center gap-2 bg-slate-100 rounded-full py-1.5 px-3">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                    {String(name).charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">
                  {name as React.ReactNode} {uid === user?.uid && "(나)"}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 하단 네비게이션 */}
      <BottomNav />
    </div>
  );
}
