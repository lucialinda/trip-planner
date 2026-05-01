"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, Suspense } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, getDoc, doc } from "firebase/firestore";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProfileDialog } from "@/components/ProfileDialog";
import { CreateTripDialog } from "@/components/CreateTripDialog";

function diffDays(target: string) {
  // target: YYYY-MM-DD
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(target + "T00:00:00");
  return Math.round((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function dDayLabel(startDate: string, endDate: string) {
  if (!startDate) return "";
  const dStart = diffDays(startDate);
  const dEnd = endDate ? diffDays(endDate) : dStart;
  if (dStart > 0) return `D-${dStart}`;
  if (dEnd >= 0) return "여행중";
  return "지난 여행";
}

function HomeContent() {
  const { user, loading, loginWithGoogle, loginWithEmail } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlJoinCode = searchParams.get("joinCode");

  const [trips, setTrips] = useState<any[]>([]);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [loadingTrips, setLoadingTrips] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultMode, setCreateDefaultMode] = useState<"create" | "join">("create");

  // Dev login (visible only when running against the local emulator)
  const [isEmulator, setIsEmulator] = useState(false);
  const [devEmail, setDevEmail] = useState("dev@example.com");
  const [devPassword, setDevPassword] = useState("123456");
  const [devLoggingIn, setDevLoggingIn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    setIsEmulator(host === "localhost" || host === "127.0.0.1");
  }, []);

  const handleDevLogin = async () => {
    setDevLoggingIn(true);
    try {
      await loginWithEmail(devEmail, devPassword);
      toast.success("로그인 완료");
    } catch (error: any) {
      toast.error(`로그인 실패: ${error?.message || error?.code || "unknown"}`);
    } finally {
      setDevLoggingIn(false);
    }
  };

  useEffect(() => {
    if (user) loadTrips();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProfilePhoto(null);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "userProfiles", user.uid));
        const url = snap.exists() ? snap.data()?.photoURL : null;
        setProfilePhoto(url || user.photoURL || null);
      } catch {
        setProfilePhoto(user.photoURL || null);
      }
    })();
  }, [user, profileOpen]);

  // Auto-open join dialog if URL contains joinCode
  useEffect(() => {
    if (user && urlJoinCode) {
      const key = `attemptedJoin_${urlJoinCode}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "true");
        setCreateDefaultMode("join");
        setCreateOpen(true);
      }
    }
  }, [user, urlJoinCode]);

  const loadTrips = async () => {
    if (!user) return;
    setLoadingTrips(true);
    try {
      const q = query(collection(db, "trips"), where("memberUids", "array-contains", user.uid));
      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      // Sort: upcoming first (closest startDate), then ongoing, then past
      docs.sort((a: any, b: any) => {
        const da = diffDays(a.startDate || "");
        const dEa = diffDays(a.endDate || a.startDate || "");
        const db_ = diffDays(b.startDate || "");
        const dEb = diffDays(b.endDate || b.startDate || "");
        const score = (start: number, end: number) => {
          if (start > 0) return start; // upcoming: positive small first
          if (end >= 0) return -1000 + start; // ongoing: very high priority
          return 100000 - start; // past: most recent past first (less negative)
        };
        return score(da, dEa) - score(db_, dEb);
      });
      setTrips(docs);
    } catch (error) {
      console.error(error);
      toast.error("여행 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingTrips(false);
    }
  };

  // ----------- Logged-out: Login screen -----------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">로딩중...</div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="fixed inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent"></div>
          <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-secondary/5 to-transparent"></div>
        </div>

        <main className="relative z-10 flex flex-col items-center justify-between min-h-screen px-6 py-16">
          <div className="w-full flex justify-center pt-8">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center clean-shadow rotate-3 hover:rotate-0 transition-transform duration-500">
                <span
                  className="material-symbols-outlined text-4xl text-white"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  flight_takeoff
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center text-center gap-4">
            <h1 className="font-display text-4xl font-bold tracking-tight text-primary uppercase">TRIP PLANNER</h1>
            <p className="font-body text-on-surface-variant text-base font-medium leading-relaxed whitespace-nowrap">
              {urlJoinCode
                ? "초대받은 여행에 참가하려면 먼저 로그인해주세요"
                : "친구들과 함께 여행 일정을 만들어보세요"}
            </p>
          </div>

          <div className="w-full max-w-sm flex flex-col gap-6 items-center">
            <button
              onClick={loginWithGoogle}
              className="w-full py-4 px-6 rounded-full flex items-center justify-center gap-4 bg-white/40 backdrop-blur-md border border-white/40 hover:bg-white/60 hover:border-white/60 active:scale-[0.98] transition-all duration-300 clean-shadow"
            >
              <div className="w-6 h-6 flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  ></path>
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  ></path>
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  ></path>
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  ></path>
                </svg>
              </div>
              <span className="font-label text-on-surface font-semibold tracking-tight">Google로 로그인</span>
            </button>

            {isEmulator && (
              <div className="w-full rounded-2xl border border-dashed border-primary/30 bg-white/30 backdrop-blur-sm p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-primary/80">
                  <span className="material-symbols-outlined text-sm">science</span>
                  EMULATOR DEV LOGIN
                </div>
                <input
                  type="email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  placeholder="email"
                  className="w-full px-3 py-2 rounded-md bg-white/70 border border-outline-variant text-sm focus:outline-none focus:border-primary"
                />
                <input
                  type="password"
                  value={devPassword}
                  onChange={(e) => setDevPassword(e.target.value)}
                  placeholder="password"
                  className="w-full px-3 py-2 rounded-md bg-white/70 border border-outline-variant text-sm focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handleDevLogin}
                  disabled={devLoggingIn}
                  className="w-full py-2 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {devLoggingIn ? "로그인 중..." : "Dev 로그인"}
                </button>
              </div>
            )}
          </div>
        </main>

        <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full -mr-64 -mt-64 z-0 pointer-events-none"></div>
        <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-secondary/10 blur-[100px] rounded-full -ml-48 -mb-48 z-0 pointer-events-none"></div>
      </div>
    );
  }

  // ----------- Logged-in: Home dashboard -----------
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background overflow-x-hidden">
      {/* Header */}
      <header className="flex items-center bg-white/80 backdrop-blur-md p-4 justify-between border-b border-outline-variant/30 sticky top-0 z-40">
        <h2 className="text-on-surface text-lg font-bold leading-tight tracking-tight flex-1">내 여행</h2>
        <button
          onClick={() => setProfileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full glass-card text-primary overflow-hidden"
          aria-label="프로필"
        >
          {profilePhoto ? (
            <Avatar className="h-10 w-10">
              <AvatarImage src={profilePhoto} className="object-cover" />
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {(user.displayName || "?").charAt(0)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="material-symbols-outlined">person</span>
          )}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 space-y-6 pb-28 pt-4">
        {/* Active Trip Cards */}
        {loadingTrips ? (
          <div className="text-center text-sm text-muted-foreground py-12">로딩중...</div>
        ) : trips.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center mt-2">
            <span className="material-symbols-outlined text-4xl text-primary/60 mb-2">luggage</span>
            <p className="text-on-surface font-semibold">아직 참가한 여행이 없어요</p>
            <p className="text-sm text-on-surface-variant mt-1">아래 버튼으로 여행을 만들거나 코드로 참가해보세요</p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {trips.map((t) => {
              const dLabel = dDayLabel(t.startDate, t.endDate);
              const memberCount = Object.keys(t.members || {}).length;
              const memberEntries = Object.entries(t.members || {}).slice(0, 3) as [string, string][];
              return (
                <button
                  key={t.id}
                  onClick={() => router.push(`/trip?id=${t.id}`)}
                  className="glass-card rounded-xl overflow-hidden block w-full text-left active:scale-[0.99] transition-transform"
                >
                  <div className="relative h-40 w-full bg-gradient-to-br from-primary via-primary-container to-tertiary">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <span className="material-symbols-outlined absolute top-3 right-3 text-white/60 text-3xl">
                      flight_takeoff
                    </span>
                    <div className="absolute bottom-4 left-4 right-4">
                      <span className="px-2 py-1 rounded bg-primary text-white text-[10px] font-bold uppercase tracking-wider">
                        {dLabel}
                      </span>
                      <h3 className="text-white text-xl font-bold mt-1 truncate">{t.name}</h3>
                      <p className="text-white/80 text-xs mt-0.5">
                        {t.startDate} ~ {t.endDate}
                      </p>
                    </div>
                  </div>
                  <div className="p-4 flex justify-between items-center bg-white/60">
                    <div className="flex -space-x-2">
                      {memberEntries.map(([uid, name], idx) => (
                        <div
                          key={uid}
                          className={`h-8 w-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-medium ${
                            idx === 0 ? "bg-primary/20 text-primary" : idx === 1 ? "bg-tertiary/20 text-tertiary" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {String(name).charAt(0)}
                        </div>
                      ))}
                      {memberCount > 3 && (
                        <div className="h-8 w-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] text-slate-600 font-medium">
                          +{memberCount - 3}
                        </div>
                      )}
                    </div>
                    <span className="text-primary text-sm font-semibold flex items-center gap-1">
                      상세보기
                      <span className="material-symbols-outlined text-base">chevron_right</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </main>

      {/* FAB: 새 여행 만들기 / 코드로 참가 */}
      <button
        type="button"
        onClick={() => {
          setCreateDefaultMode("create");
          setCreateOpen(true);
        }}
        aria-label="새 여행"
        className="fixed bottom-6 right-5 w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center active:scale-90 transition-transform z-30"
      >
        <span
          className="material-symbols-outlined text-[28px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          add
        </span>
      </button>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <CreateTripDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultMode={createDefaultMode}
        defaultCode={urlJoinCode || ""}
      />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">로딩중...</div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
