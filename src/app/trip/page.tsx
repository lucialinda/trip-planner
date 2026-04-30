"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, Suspense } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Share2, Users, Link as LinkIcon, Copy, Share } from "lucide-react";
import { toast } from "sonner";
import { MembersDialog } from "@/components/MembersDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItineraryTab } from "@/components/ItineraryTab";

function TripContent() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("id");
  const { user } = useAuth();
  const router = useRouter();
  
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);

  useEffect(() => {
    if (!user || !tripId) {
      if (!tripId && !loading) router.push("/");
      return;
    }
    
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

  const handleCopyLink = async () => {
    const code = trip?.code || "";
    const joinUrl = `${window.location.origin}/?joinCode=${code}`;
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast.success("초대 링크가 복사되었습니다!");
    } catch (err) {
      toast.error("링크 복사에 실패했습니다.");
    }
  };

  const handleCopyCode = async () => {
    const code = trip?.code || "";
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`참가 코드(${code})가 복사되었습니다!`);
    } catch (err) {
      toast.error("코드 복사에 실패했습니다.");
    }
  };

  const handleNativeShare = async () => {
    const code = trip?.code || "";
    const joinUrl = `${window.location.origin}/?joinCode=${code}`;
    try {
      await navigator.share({ title: trip.name, text: `여행 플래너에 초대합니다!\n초대 링크: ${joinUrl}` });
    } catch (err) {
      // ignore
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">로딩중...</div>;
  if (!trip) return null;

  const membersCount = Object.keys(trip.members || {}).length;

  return (
    <div className="flex flex-col h-screen w-full max-w-3xl mx-auto bg-slate-50 relative shadow-sm sm:border-x">
      <header className="h-14 bg-white border-b flex items-center px-4 gap-3 shrink-0 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")} className="shrink-0 -ml-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base truncate">{trip.name}</h1>
          <p className="text-xs text-muted-foreground truncate">{trip.startDate} ~ {trip.endDate}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center shrink-0 h-9 w-9 rounded-md hover:bg-slate-100 transition-colors">
            <Share2 className="h-5 w-5 text-muted-foreground" />
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
            {typeof navigator !== 'undefined' && !!navigator.share && (
              <DropdownMenuItem onClick={handleNativeShare}>
                <Share className="mr-2 h-4 w-4" />
                <span>다른 앱으로 공유</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" onClick={() => setShowMembers(true)} className="shrink-0 -mr-2">
          <Users className="h-5 w-5 text-muted-foreground" />
        </Button>
      </header>

      <Tabs defaultValue="itinerary" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full h-14 bg-white border-b rounded-none justify-between px-2 shrink-0 sticky top-14 z-10">
          <TabsTrigger value="itinerary" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">📅 일정</TabsTrigger>
          <TabsTrigger value="votes" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">🗳️ 투표</TabsTrigger>
          <TabsTrigger value="budget" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">💰 예산</TabsTrigger>
          <TabsTrigger value="threads" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">💬 채팅</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
          <TabsContent value="itinerary" className="w-full m-0 h-full">
            <ItineraryTab tripId={tripId as string} trip={trip} />
          </TabsContent>
          <TabsContent value="votes" className="w-full m-0 h-full">
            <div className="text-center text-sm text-muted-foreground py-8">투표 컴포넌트 개발 예정</div>
          </TabsContent>
          <TabsContent value="budget" className="w-full m-0 h-full">
            <div className="text-center text-sm text-muted-foreground py-8">예산 컴포넌트 개발 예정</div>
          </TabsContent>
          <TabsContent value="threads" className="w-full m-0 h-full flex flex-col">
            <div className="text-center text-sm text-muted-foreground py-8">스레드 컴포넌트 개발 예정</div>
          </TabsContent>
        </div>
      </Tabs>

      <MembersDialog open={showMembers} onOpenChange={setShowMembers} trip={trip} />
    </div>
  );
}

export default function TripPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">로딩중...</div>}>
      <TripContent />
    </Suspense>
  );
}
