"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface JoinTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCode?: string;
}

export function JoinTripDialog({ open, onOpenChange, defaultCode }: JoinTripDialogProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) setCode(defaultCode || "");
    else setCode("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, defaultCode]);

  const handleJoin = async () => {
    if (!user) return;
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      toast.error("6자리 코드를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const codeSnap = await getDoc(doc(db, "tripCodes", trimmed));
      if (!codeSnap.exists()) {
        toast.error("코드를 찾을 수 없습니다.");
        return;
      }
      const tripId = codeSnap.data().tripId;
      const tripRef = doc(db, "trips", tripId);
      const tripSnap = await getDoc(tripRef);
      if (!tripSnap.exists()) {
        toast.error("여행을 찾을 수 없습니다.");
        return;
      }
      const tripData = tripSnap.data();
      const memberUids = Array.isArray(tripData.memberUids) ? tripData.memberUids : [];
      const members = tripData.members && typeof tripData.members === "object" ? tripData.members : {};
      await updateDoc(tripRef, {
        members: {
          ...members,
          [user.uid]: user.displayName || "익명",
        },
        memberUids: memberUids.includes(user.uid) ? memberUids : [...memberUids, user.uid],
      });

      toast.success("여행에 참가했어요!");
      onOpenChange(false);
      router.push(`/trip?id=${tripId}`);
    } catch {
      toast.error("참가 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle>여행 코드로 참가</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-1 block">참가 코드 (6자리)</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="예: A1B2C3"
              maxLength={6}
              className="uppercase tracking-widest text-center text-lg"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
              취소
            </Button>
            <Button className="flex-1" onClick={handleJoin} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              참가하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
