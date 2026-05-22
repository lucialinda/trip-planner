"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, Suspense, useRef } from "react";
import { db, storage } from "@/lib/firebase";
import { isAdminUid } from "@/lib/admin";
import { collection, query, where, onSnapshot, getDoc, doc, updateDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProfileDialog } from "@/components/ProfileDialog";
import { CreateTripDialog } from "@/components/CreateTripDialog";
import { TripHeroCropDialog } from "@/components/TripHeroCropDialog";
import {
  Camera,
  Copy,
  Link as LinkIcon,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TripSummary {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  code?: string;
  members?: Record<string, string>;
  memberUids?: string[];
  createdByUid?: string;
  heroPhotoURL?: string | null;
  [key: string]: unknown;
}

function diffDays(target: string) {
  // target: YYYY-MM-DD
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(target + "T00:00:00");
  return Math.round((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function dDayLabel(startDate?: string, endDate?: string) {
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
  const isAdmin = isAdminUid(user?.uid);

  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [memberPhotos, setMemberPhotos] = useState<Record<string, string | null>>({});

  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [membersTrip, setMembersTrip] = useState<TripSummary | null>(null);
  const [createDefaultMode, setCreateDefaultMode] = useState<"create" | "join">("create");
  const heroFileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingHeroTrip, setEditingHeroTrip] = useState<TripSummary | null>(null);
  const [pendingHeroFile, setPendingHeroFile] = useState<File | null>(null);
  const [savingHero, setSavingHero] = useState(false);
  const [isKakaoInAppBrowser] = useState(
    () => typeof window !== "undefined" && /KAKAOTALK/i.test(window.navigator.userAgent)
  );

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

  const handleGoogleLogin = async () => {
    if (isKakaoInAppBrowser) {
      toast.error("오른쪽 위 메뉴에서 외부 브라우저로 열기를 선택해주세요.");
      return;
    }

    await loginWithGoogle();
  };

  const handleDevLogin = async () => {
    setDevLoggingIn(true);
    try {
      await loginWithEmail(devEmail, devPassword);
      toast.success("로그인 완료");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown";
      toast.error(`로그인 실패: ${message}`);
    } finally {
      setDevLoggingIn(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setTrips([]);
      setLoadingTrips(false);
      return;
    }
    setLoadingTrips(true);
    const q = query(collection(db, "trips"), where("memberUids", "array-contains", user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripSummary));
        // Sort: upcoming first (closest startDate), then ongoing, then past
        docs.sort((a, b) => {
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
        setLoadingTrips(false);
      },
      (error) => {
        console.error(error);
        toast.error("여행 목록을 불러오지 못했습니다.");
        setLoadingTrips(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Load photoURL for every member shown in trip cards
  useEffect(() => {
    if (!trips.length) {
      setMemberPhotos({});
      return;
    }
    const uids = new Set<string>();
    trips.forEach((t) => {
      Object.keys(t.members || {}).forEach((uid) => uids.add(uid));
    });
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        Array.from(uids).map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "userProfiles", uid));
            const url = snap.exists() ? (snap.data()?.photoURL ?? null) : null;
            return [uid, url] as const;
          } catch {
            return [uid, null] as const;
          }
        })
      );
      if (cancelled) return;
      setMemberPhotos(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [trips]);

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

  // Auto-open join dialog if URL contains joinCode.
  // If the user is already a member, skip the dialog and clean up the join URL.
  useEffect(() => {
    if (!user || !urlJoinCode) return;

    const joinCode = urlJoinCode.trim().toUpperCase();
    if (!joinCode) return;

    let cancelled = false;
    const key = `attemptedJoin_${joinCode}`;

    (async () => {
      try {
        const codeSnap = await getDoc(doc(db, "tripCodes", joinCode));
        if (cancelled) return;

        if (codeSnap.exists()) {
          const tripId = codeSnap.data().tripId as string | undefined;
          if (tripId) {
            const tripSnap = await getDoc(doc(db, "trips", tripId));
            if (cancelled) return;

            const memberUids = tripSnap.exists() && Array.isArray(tripSnap.data().memberUids)
              ? tripSnap.data().memberUids
              : [];
            if (memberUids.includes(user.uid)) {
              router.replace(`/trip?id=${tripId}`);
              return;
            }
          }
        }
      } catch (error) {
        console.error("[home] joinCode preflight failed:", error);
      }

      if (cancelled || sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "true");
      setCreateDefaultMode("join");
      setCreateOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, urlJoinCode, router]);

  const handleTripCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, tripId: string) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    router.push(`/trip?id=${tripId}`);
  };

  const handleHeroPickClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    trip: TripSummary
  ) => {
    e.stopPropagation();
    setEditingHeroTrip(trip);
    heroFileInputRef.current?.click();
  };

  const handleHeroFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("원본 이미지는 8MB 이하로 선택해주세요.");
      return;
    }
    setPendingHeroFile(file);
  };

  const handleHeroCropConfirm = async (blob: Blob) => {
    if (!editingHeroTrip || !user || !isAdmin) return;
    setSavingHero(true);
    try {
      const fileRef = storageRef(storage, `trip-hero/${editingHeroTrip.id}/cover.jpg`);
      await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(fileRef);
      await updateDoc(doc(db, "trips", editingHeroTrip.id), { heroPhotoURL: url });
      toast.success("대표 사진이 변경되었어요");
      setPendingHeroFile(null);
      setEditingHeroTrip(null);
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast.error(`사진 저장 실패: ${message}`);
    } finally {
      setSavingHero(false);
    }
  };

  const handleHeroCropCancel = () => {
    if (savingHero) return;
    setPendingHeroFile(null);
    setEditingHeroTrip(null);
  };

  const handleHeroDelete = async (
    e: React.MouseEvent<HTMLButtonElement>,
    trip: TripSummary
  ) => {
    e.stopPropagation();
    if (!isAdmin) return;
    if (!confirm("대표 사진을 삭제할까요?")) return;
    try {
      await updateDoc(doc(db, "trips", trip.id), { heroPhotoURL: null });
      toast.success("대표 사진을 삭제했어요");
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast.error(`삭제 실패: ${message}`);
    }
  };

  const buildTripJoinUrl = (trip: TripSummary) => {
    const code = trip.code || "";
    return `${window.location.origin}/?joinCode=${code}`;
  };

  const handleCopyInviteLink = async (trip: TripSummary) => {
    const code = trip.code || "";
    if (!code) {
      toast.error("초대 코드가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildTripJoinUrl(trip));
      toast.success("초대 링크가 복사되었습니다!");
    } catch {
      toast.error("링크 복사에 실패했습니다.");
    }
  };

  const handleCopyInviteCode = async (trip: TripSummary) => {
    const code = trip.code || "";
    if (!code) {
      toast.error("초대 코드가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      toast.success(`참가 코드(${code})가 복사되었습니다!`);
    } catch {
      toast.error("코드 복사에 실패했습니다.");
    }
  };

  const sheetMemberEntries = Object.entries(membersTrip?.members || {}) as [string, string][];
  const sheetMemberCount = sheetMemberEntries.length;

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
            {isKakaoInAppBrowser && (
              <div className="w-full rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-left text-sm leading-6 text-amber-950 clean-shadow">
                <p className="font-semibold">Google 로그인은 카카오톡 앱 안에서는 지원되지 않습니다.</p>
                <p>오른쪽 위 메뉴에서 “외부 브라우저로 열기”를 선택해주세요.</p>
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
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
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col overflow-x-hidden bg-background shadow-sm sm:border-x">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-sky-100 bg-white/80 px-2 backdrop-blur-md">
        {/* 좌측 더미 스페이서 — 우측 프로필 버튼과 폭을 맞춰 타이틀을 정확히 가운데에 배치 */}
        <div className="h-10 w-10" aria-hidden="true" />
        <h1 className="text-base font-bold tracking-tight text-on-surface">내 여행</h1>
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
            <p className="text-sm text-on-surface-variant mt-1">
              {isAdmin ? "아래 버튼으로 여행을 만들거나 코드로 참가해보세요" : "아래 버튼으로 초대 코드로 참가해보세요"}
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {trips.map((t) => {
              const dLabel = dDayLabel(t.startDate, t.endDate);
              const memberCount = Object.keys(t.members || {}).length;
              const memberEntries = Object.entries(t.members || {}).slice(0, 3) as [string, string][];
              return (
                <div
                  key={t.id}
                  onClick={() => router.push(`/trip?id=${t.id}`)}
                  onKeyDown={(e) => handleTripCardKeyDown(e, t.id)}
                  role="button"
                  tabIndex={0}
                  className="glass-card block w-full cursor-pointer overflow-hidden rounded-xl text-left transition-transform active:scale-[0.99]"
                >
                  <div
                    className={`relative w-full ${
                      t.heroPhotoURL ? "" : "bg-gradient-to-br from-primary via-primary-container to-tertiary"
                    }`}
                    style={{ aspectRatio: "2 / 1" }}
                  >
                    {t.heroPhotoURL ? (
                      <img
                        src={t.heroPhotoURL}
                        alt={t.name || "여행 대표 사진"}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : null}
                    {/* 텍스트 가독용 어두운 그라디언트 */}
                    <div
                      className={`absolute inset-0 ${
                        t.heroPhotoURL
                          ? "bg-gradient-to-t from-black/65 via-black/15 to-black/25"
                          : "bg-gradient-to-t from-black/60 to-transparent"
                      }`}
                    />
                    <div className="absolute bottom-4 left-4 right-4">
                      <span className="px-2 py-1 rounded bg-primary text-white text-[10px] font-bold uppercase tracking-wider">
                        {dLabel}
                      </span>
                      <h3 className="text-white text-xl font-bold mt-1 truncate drop-shadow-sm">{t.name}</h3>
                      <p className="text-white/85 text-xs mt-0.5">
                        {t.startDate} ~ {t.endDate}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="absolute right-4 top-4 flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleHeroPickClick(e, t)}
                          aria-label="대표 사진 변경"
                          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/15 text-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-white/25 active:scale-95"
                        >
                          <Camera className="h-4 w-4" />
                        </button>
                        {t.heroPhotoURL && (
                          <button
                            type="button"
                            onClick={(e) => handleHeroDelete(e, t)}
                            aria-label="대표 사진 삭제"
                            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/15 text-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-rose-500/40 active:scale-95"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex justify-between items-center bg-white/60">
                    <div className="flex -space-x-2">
                      {memberEntries.map(([uid, name], idx) => {
                        const photo = memberPhotos[uid];
                        const fallbackBg =
                          idx === 0
                            ? "bg-primary/20 text-primary"
                            : idx === 1
                            ? "bg-tertiary/20 text-tertiary"
                            : "bg-slate-200 text-slate-600";
                        return (
                          <Avatar key={uid} className="h-8 w-8 border-2 border-white">
                            {photo ? (
                              <AvatarImage src={photo} className="object-cover" />
                            ) : null}
                            <AvatarFallback className={`text-[10px] font-medium ${fallbackBg}`}>
                              {String(name).charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                      {memberCount > 3 && (
                        <div className="h-8 w-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] text-slate-600 font-medium">
                          +{memberCount - 3}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`멤버 ${memberCount}명 및 초대`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMembersTrip(t);
                      }}
                      className="ml-3 mr-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100/80 text-slate-700 transition-colors hover:bg-sky-100 hover:text-primary active:bg-sky-200"
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                        className="h-5 w-5"
                      >
                        <g fill="none">
                          <path d="M24 0v24H0V0zM12.593 23.258l-.011.002-.071.035-.02.004-.014-.004-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01-.017.428.005.02.01.013.104.074.015.004.012-.004.104-.074.012-.016.004-.017-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113-.013.002-.185.093-.01.01-.003.011.018.43.005.012.008.007.201.093c.012.004.023 0 .029-.008l.004-.014-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014-.034.614c0 .012.007.02.017.024l.015-.002.201-.093.01-.008.004-.011.017-.43-.003-.012-.01-.01z" />
                          <path fill="currentColor" d="M13 13a4 4 0 0 1 4 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 2 18.5V17a4 4 0 0 1 4-4zm6 0a3 3 0 0 1 3 3v1.5a1.5 1.5 0 0 1-1.5 1.5H19v-2a4.992 4.992 0 0 0-2-4zM9.5 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9M18 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6" />
                        </g>
                      </svg>
                    </button>
                    <span className="text-primary text-sm font-semibold flex items-center gap-1">
                      상세보기
                      <span className="material-symbols-outlined text-base">chevron_right</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </main>

      {/* FAB: 새 여행 만들기 / 코드로 참가 */}
      <div className="fixed bottom-6 left-1/2 z-30 w-full max-w-3xl -translate-x-1/2 px-5 pointer-events-none">
        <button
          type="button"
          onClick={() => {
            setCreateDefaultMode(isAdmin ? "create" : "join");
            setCreateOpen(true);
          }}
          aria-label={isAdmin ? "새 여행" : "코드로 참가"}
          className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-transform active:scale-90 pointer-events-auto"
        >
          <span
            className="material-symbols-outlined text-[28px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {isAdmin ? "add" : "key"}
          </span>
        </button>
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <Dialog
        open={!!membersTrip}
        onOpenChange={(open) => {
          if (!open) setMembersTrip(null);
        }}
      >
        <DialogContent className="top-auto bottom-0 left-1/2 max-w-3xl translate-y-0 rounded-b-none rounded-t-2xl p-0 sm:top-1/2 sm:bottom-auto sm:max-w-sm sm:-translate-y-1/2 sm:rounded-xl">
          <DialogHeader className="border-b border-slate-100 px-5 pb-3 pt-5">
            <DialogTitle className="text-lg font-bold text-slate-900">여행 멤버</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-5 pb-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">멤버 {sheetMemberCount}명</h3>
              <div className="space-y-2">
                {sheetMemberEntries.map(([uid, name], idx) => {
                  const photo = memberPhotos[uid];
                  const fallbackBg =
                    idx === 0
                      ? "bg-primary/15 text-primary"
                      : idx === 1
                      ? "bg-tertiary/15 text-tertiary"
                      : "bg-slate-100 text-slate-600";
                  return (
                    <div key={uid} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                      <Avatar className="h-9 w-9 border border-white shadow-sm">
                        {photo ? <AvatarImage src={photo} className="object-cover" /> : null}
                        <AvatarFallback className={`text-xs font-medium ${fallbackBg}`}>
                          {String(name).charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                        {name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">초대</h3>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => membersTrip && handleCopyInviteLink(membersTrip)}
                  className="flex h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-sky-50 active:bg-sky-100"
                >
                  <LinkIcon className="h-4 w-4 text-primary" />
                  <span>초대 링크 복사</span>
                </button>
                <button
                  type="button"
                  onClick={() => membersTrip && handleCopyInviteCode(membersTrip)}
                  className="flex h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-sky-50 active:bg-sky-100"
                >
                  <Copy className="h-4 w-4 text-primary" />
                  <span>참가 코드 복사</span>
                </button>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
      <input
        ref={heroFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleHeroFileChange}
      />
      <TripHeroCropDialog
        open={!!pendingHeroFile}
        file={pendingHeroFile}
        saving={savingHero}
        onCancel={handleHeroCropCancel}
        onConfirm={handleHeroCropConfirm}
      />
      <CreateTripDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultMode={createDefaultMode}
        defaultCode={urlJoinCode || ""}
        canCreate={isAdmin}
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
