"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, use } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ItineraryTab } from "@/components/ItineraryTab";

export default function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);

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
    const code = trip?.code || "";
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
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 relative shadow-sm">
      {/* Header */}
      <header className="h-14 bg-white border-b flex items-center px-4 gap-3 shrink-0 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")} className="shrink-0 -ml-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base truncate">{trip.name}</h1>
          <p className="text-xs text-muted-foreground truncate">{trip.startDate} ~ {trip.endDate}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleShare} className="shrink-0">
          <Share2 className="h-5 w-5 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setShowMembers(true)} className="shrink-0 -mr-2">
          <Users className="h-5 w-5 text-muted-foreground" />
        </Button>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="itinerary" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full h-14 bg-white border-b rounded-none justify-between px-2 shrink-0 sticky top-14 z-10">
          <TabsTrigger value="itinerary" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">📅 일정</TabsTrigger>
          <TabsTrigger value="votes" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">🗳️ 투표</TabsTrigger>
          <TabsTrigger value="budget" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">💰 예산</TabsTrigger>
          <TabsTrigger value="threads" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">💬 채팅</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="itinerary" className="m-0 h-full">
            <ItineraryTab tripId={tripId} trip={trip} />
          </TabsContent>
          <TabsContent value="votes" className="m-0 h-full">
            <div className="text-center text-sm text-muted-foreground py-8">투표 컴포넌트 개발 예정</div>
          </TabsContent>
          <TabsContent value="budget" className="m-0 h-full">
            <div className="text-center text-sm text-muted-foreground py-8">예산 컴포넌트 개발 예정</div>
          </TabsContent>
          <TabsContent value="threads" className="m-0 h-full flex flex-col">
            <div className="text-center text-sm text-muted-foreground py-8">스레드 컴포넌트 개발 예정</div>
          </TabsContent>
        </div>
      </Tabs>

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
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">{String(name).charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{name as React.ReactNode} {uid === user?.uid && "(나)"}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
