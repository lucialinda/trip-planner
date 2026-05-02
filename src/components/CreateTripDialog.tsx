"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

type Mode = "create" | "join";

interface CreateTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: Mode;
  defaultCode?: string;
}

export function CreateTripDialog({
  open,
  onOpenChange,
  defaultMode = "create",
  defaultCode,
}: CreateTripDialogProps) {
  const { user } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>(defaultMode);

  // create form
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [creating, setCreating] = useState(false);

  // join form
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Reset on open / close
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      setMode(defaultCode ? "join" : defaultMode);
      setCode(defaultCode || "");
    } else {
      setName("");
      setStart("");
      setEnd("");
      setCode("");
      setMode(defaultMode);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, defaultMode, defaultCode]);

  const handleCreate = async () => {
    if (!user) return;
    if (!name || !start || !end) {
      toast.error("여행 이름과 날짜를 입력해주세요.");
      return;
    }
    if (start > end) {
      toast.error("귀국일이 출발일보다 빠를 수 없습니다.");
      return;
    }

    setCreating(true);
    try {
      const newCode = genCode();
      const tripRef = doc(collection(db, "trips"));
      await setDoc(tripRef, {
        name,
        startDate: start,
        endDate: end,
        code: newCode,
        members: { [user.uid]: user.displayName || "익명" },
        memberUids: [user.uid],
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "tripCodes", newCode), {
        tripId: tripRef.id,
        createdAt: serverTimestamp(),
      });

      toast.success("여행이 만들어졌어요!");
      onOpenChange(false);
      router.push(`/trip?id=${tripRef.id}`);
    } catch {
      toast.error("여행 생성 실패");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!user) return;
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      toast.error("6자리 코드를 입력해주세요.");
      return;
    }

    setJoining(true);
    try {
      const codeSnap = await getDoc(doc(db, "tripCodes", trimmed));
      if (!codeSnap.exists()) {
        toast.error("코드를 찾을 수 없습니다.");
        return;
      }
      const tripId = codeSnap.data().tripId;
      const tripRef = doc(db, "trips", tripId);
      await setDoc(
        tripRef,
        {
          [`members.${user.uid}`]: user.displayName || "익명",
          memberUids: arrayUnion(user.uid),
        },
        { merge: true }
      );

      toast.success("여행에 참가했어요!");
      onOpenChange(false);
      router.push(`/trip?id=${tripId}`);
    } catch {
      toast.error("참가 실패");
    } finally {
      setJoining(false);
    }
  };

  const loading = creating || joining;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle>새 여행</DialogTitle>
          <DialogDescription>
            새로운 여행을 만들거나, 친구가 공유한 코드로 참가할 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1">
              새로 만들기
            </TabsTrigger>
            <TabsTrigger value="join" className="flex-1">
              코드로 참가
            </TabsTrigger>
          </TabsList>

          {/* Create */}
          <TabsContent value="create" className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-1 block">
                여행 이름
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 파리 7박8일"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-1 block">
                출발일
              </label>
              <Input
                type="date"
                value={start}
                onChange={(e) => {
                  const val = e.target.value;
                  setStart(val);
                  if (!end || end < val) setEnd(val);
                }}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-1 block">
                귀국일
              </label>
              <Input
                type="date"
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                취소
              </Button>
              <Button className="flex-1" onClick={handleCreate} disabled={loading}>
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                만들기
              </Button>
            </div>
          </TabsContent>

          {/* Join */}
          <TabsContent value="join" className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-1 block">
                참가 코드 (6자리)
              </label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="예: A1B2C3"
                maxLength={6}
                className="uppercase tracking-widest text-center text-lg"
              />
              <p className="text-xs text-muted-foreground mt-2">
                여행에 참여하고 있는 친구에게 6자리 코드를 받아 입력해주세요.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                취소
              </Button>
              <Button className="flex-1" onClick={handleJoin} disabled={loading}>
                {joining && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                참가하기
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
