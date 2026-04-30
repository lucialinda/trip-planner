"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plane, LogIn } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp, arrayUnion, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

function HomeContent() {
  const { user, loading, loginWithGoogle } = useAuth();
  const [trips, setTrips] = useState<any[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  
  const [joinCode, setJoinCode] = useState("");
  const [newTripName, setNewTripName] = useState("");
  const [newTripStart, setNewTripStart] = useState("");
  const [newTripEnd, setNewTripEnd] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const urlJoinCode = searchParams.get("joinCode");

  useEffect(() => {
    if (urlJoinCode && !joinCode) {
      setJoinCode(urlJoinCode);
    }
  }, [urlJoinCode]);

  useEffect(() => {
    if (user) {
      loadTrips();
    }
  }, [user]);

  // Auto-join if user logs in and joinCode is in URL
  useEffect(() => {
    if (user && urlJoinCode && !actionLoading) {
      // Check if already in the trip to avoid unnecessary join logic?
      // HandleJoinTrip handles it fine. Let's just run it once per urlJoinCode.
      const hasJoinedOrAttempted = sessionStorage.getItem(`attemptedJoin_${urlJoinCode}`);
      if (!hasJoinedOrAttempted) {
        sessionStorage.setItem(`attemptedJoin_${urlJoinCode}`, "true");
        handleJoinTrip(urlJoinCode);
      }
    }
  }, [user, urlJoinCode]);

  const loadTrips = async () => {
    if (!user) return;
    setLoadingTrips(true);
    try {
      const q = query(collection(db, "trips"), where("memberUids", "array-contains", user.uid));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });
      setTrips(docs);
    } catch (error) {
      toast.error("여행 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingTrips(false);
    }
  };

  const handleCreateTrip = async () => {
    if (!newTripName || !newTripStart || !newTripEnd) {
      toast.error("여행 이름과 날짜를 입력해주세요.");
      return;
    }
    if (newTripStart > newTripEnd) {
      toast.error("귀국일이 출발일보다 빠를 수 없습니다.");
      return;
    }

    setActionLoading(true);
    try {
      const code = genCode();
      const tripRef = doc(collection(db, "trips"));
      const tripData = {
        name: newTripName,
        startDate: newTripStart,
        endDate: newTripEnd,
        code,
        members: { [user!.uid]: user!.displayName || "익명" },
        memberUids: [user!.uid],
        createdAt: serverTimestamp()
      };

      await setDoc(tripRef, tripData);
      await setDoc(doc(db, "tripCodes", code), {
        tripId: tripRef.id,
        createdAt: serverTimestamp()
      });

      toast.success("여행이 만들어졌어요!");
      router.push(`/trip?id=${tripRef.id}`);
    } catch (error) {
      toast.error("여행 생성 실패");
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinTrip = async (codeOverride?: string) => {
    const codeToUse = typeof codeOverride === 'string' ? codeOverride : joinCode;
    const code = codeToUse.trim().toUpperCase();
    
    if (code.length !== 6) {
      toast.error("6자리 코드를 입력해주세요.");
      return;
    }

    setActionLoading(true);
    try {
      const codeSnap = await getDoc(doc(db, "tripCodes", code));
      if (!codeSnap.exists()) {
        toast.error("코드를 찾을 수 없습니다.");
        return;
      }
      const tripId = codeSnap.data().tripId;
      const tripRef = doc(db, "trips", tripId);
      
      await setDoc(tripRef, {
        [`members.${user!.uid}`]: user!.displayName || "익명",
        memberUids: arrayUnion(user!.uid)
      }, { merge: true });

      toast.success("여행에 참가했어요!");
      router.push(`/trip?id=${tripId}`);
    } catch (error) {
      toast.error("참가 실패");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">로딩중...</div>;

  if (!user) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-6xl animate-bounce">
          <Plane size={64} className="text-blue-500" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">여행 플래너</h1>
          {urlJoinCode ? (
            <p className="text-muted-foreground text-sm">초대받은 여행에 참가하려면 먼저 로그인해주세요.</p>
          ) : (
            <p className="text-muted-foreground">친구들과 함께 여행 일정을 만들어보세요</p>
          )}
        </div>
        <Button onClick={loginWithGoogle} size="lg" className="gap-2 mt-4">
          <LogIn size={20} />
          Google로 로그인
        </Button>
      </main>
    );
  }

  return (
    <main className="max-w-3xl w-full mx-auto p-6 space-y-8 pb-20">
      <section>
        <h2 className="text-xl font-bold mb-4">내 여행</h2>
        <div className="space-y-3">
          {loadingTrips ? (
             <div className="text-center py-8 text-muted-foreground text-sm">로딩중...</div>
          ) : trips.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-white rounded-lg border text-sm">
              아직 참가한 여행이 없어요
            </div>
          ) : (
            trips.map(t => (
              <Card key={t.id} className="cursor-pointer hover:border-primary transition-colors shadow-sm" onClick={() => router.push(`/trip?id=${t.id}`)}>
                <CardContent className="p-4">
                  <div className="font-semibold text-lg">{t.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {t.startDate} ~ {t.endDate} · 멤버 {Object.keys(t.members || {}).length}명
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-slate-50 px-2 text-muted-foreground">또는</span>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-muted-foreground mb-2 block">여행 코드로 참가</label>
          <div className="flex gap-2">
            <Input 
              value={joinCode} 
              onChange={e => setJoinCode(e.target.value)} 
              placeholder="여행 코드 입력 (6자리)" 
              maxLength={6} 
              className="uppercase"
            />
            <Button variant="outline" onClick={() => handleJoinTrip()} disabled={actionLoading}>참가</Button>
          </div>
        </div>
      </section>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-slate-50 px-2 text-muted-foreground">새 여행</span>
        </div>
      </div>

      <section className="space-y-4">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-1 block">여행 이름</label>
            <Input value={newTripName} onChange={e => setNewTripName(e.target.value)} placeholder="예: 파리 7박8일" />
          </div>
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-1 block">출발일</label>
            <Input 
              type="date" 
              value={newTripStart} 
              onChange={e => {
                const val = e.target.value;
                setNewTripStart(val);
                if (!newTripEnd || newTripEnd < val) {
                  setNewTripEnd(val);
                }
              }} 
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-1 block">귀국일</label>
            <Input 
              type="date" 
              min={newTripStart}
              value={newTripEnd} 
              onChange={e => setNewTripEnd(e.target.value)} 
            />
          </div>
          <Button className="w-full" onClick={handleCreateTrip} disabled={actionLoading}>여행 만들기</Button>
        </div>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">로딩중...</div>}>
      <HomeContent />
    </Suspense>
  );
}
