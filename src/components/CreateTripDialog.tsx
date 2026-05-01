"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

interface CreateTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTripDialog({ open, onOpenChange }: CreateTripDialogProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setStart("");
      setEnd("");
    }
  }, [open]);

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

    setLoading(true);
    try {
      const code = genCode();
      const tripRef = doc(collection(db, "trips"));
      await setDoc(tripRef, {
        name,
        startDate: start,
        endDate: end,
        code,
        members: { [user.uid]: user.displayName || "익명" },
        memberUids: [user.uid],
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "tripCodes", code), {
        tripId: tripRef.id,
        createdAt: serverTimestamp(),
      });

      toast.success("여행이 만들어졌어요!");
      onOpenChange(false);
      router.push(`/trip?id=${tripRef.id}`);
    } catch (error) {
      toast.error("여행 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle>새 여행 만들기</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-1 block">여행 이름</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 파리 7박8일" />
          </div>
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-1 block">출발일</label>
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
            <label className="text-sm font-semibold text-muted-foreground mb-1 block">귀국일</label>
            <Input type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
              취소
            </Button>
            <Button className="flex-1" onClick={handleCreate} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              만들기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
