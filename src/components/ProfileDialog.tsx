"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, writeBatch, collection, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import { db, storage, auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Camera, Loader2, LogOut } from "lucide-react";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, logout } = useAuth();
  const [editName, setEditName] = useState("");
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentPhotoURL, setCurrentPhotoURL] = useState<string | null>(null);
  const [settlementAccountBank, setSettlementAccountBank] = useState("");
  const [settlementAccountNumber, setSettlementAccountNumber] = useState("");
  const [settlementAccountHolder, setSettlementAccountHolder] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setEditName(user.displayName || "익명");
    setEditPhoto(null);
    // Try to fetch latest photoURL from userProfiles
    (async () => {
      try {
        const snap = await getDoc(doc(db, "userProfiles", user.uid));
        const data = snap.exists() ? snap.data() : null;
        const url = data?.photoURL ?? null;
        const finalUrl = url || user.photoURL || null;
        setCurrentPhotoURL(finalUrl);
        setEditPhotoPreview(finalUrl);
        setSettlementAccountBank(typeof data?.settlementAccountBank === "string" ? data.settlementAccountBank : "");
        setSettlementAccountNumber(typeof data?.settlementAccountNumber === "string" ? data.settlementAccountNumber : "");
        setSettlementAccountHolder(typeof data?.settlementAccountHolder === "string" ? data.settlementAccountHolder : "");
      } catch {
        setCurrentPhotoURL(user.photoURL || null);
        setEditPhotoPreview(user.photoURL || null);
        setSettlementAccountBank("");
        setSettlementAccountNumber("");
        setSettlementAccountHolder("");
      }
    })();
  }, [open, user]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("이미지는 2MB 이하로 선택해주세요.");
      return;
    }
    setEditPhoto(file);
    setEditPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!user || !auth.currentUser) return;
    const newName = editName.trim();
    if (!newName) {
      toast.error("닉네임을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      let photoURL = currentPhotoURL;

      if (editPhoto) {
        const fileRef = ref(storage, `profile-photos/${user.uid}/avatar`);
        await uploadBytes(fileRef, editPhoto);
        photoURL = await getDownloadURL(fileRef);
      }

      await updateProfile(auth.currentUser, {
        displayName: newName,
        photoURL: photoURL || undefined,
      });

      await setDoc(
        doc(db, "userProfiles", user.uid),
        {
          name: newName,
          photoURL: photoURL || null,
          settlementAccountBank: settlementAccountBank.trim(),
          settlementAccountNumber: settlementAccountNumber.trim(),
          settlementAccountHolder: settlementAccountHolder.trim(),
        },
        { merge: true }
      );

      // Sync displayName across all trips
      const q = query(collection(db, "trips"), where("memberUids", "array-contains", user.uid));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach((d) => {
        batch.update(d.ref, { [`members.${user.uid}`]: newName });
      });
      await batch.commit();

      toast.success("프로필이 변경되었습니다.");
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast.error(`저장 실패: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      onOpenChange(false);
      toast.success("로그아웃 되었습니다.");
    } catch {
      toast.error("로그아웃 실패");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-sm overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>내 프로필</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative group cursor-pointer">
            <Avatar className="h-20 w-20 shadow-sm border-2 border-white">
              {editPhotoPreview ? (
                <AvatarImage src={editPhotoPreview} className="object-cover" />
              ) : (
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                  {editName.charAt(0) || "?"}
                </AvatarFallback>
              )}
            </Avatar>
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
              <Camera className="w-6 h-6" />
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">사진을 눌러 변경 (2MB 이하)</p>

          <div className="w-full space-y-2 mt-2">
            <label className="text-sm font-semibold">닉네임</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={20} />
          </div>

          <div className="w-full space-y-2">
            <label className="text-sm font-semibold">정산 계좌</label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={settlementAccountBank}
                onChange={(e) => setSettlementAccountBank(e.target.value)}
                placeholder="은행"
              />
              <Input
                value={settlementAccountHolder}
                onChange={(e) => setSettlementAccountHolder(e.target.value)}
                placeholder="예금주"
              />
            </div>
            <Input
              value={settlementAccountNumber}
              onChange={(e) => setSettlementAccountNumber(e.target.value)}
              placeholder="계좌번호"
            />
          </div>

          <div className="flex gap-2 w-full mt-4">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              저장하기
            </Button>
          </div>

          <button
            onClick={handleLogout}
            className="mt-2 text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> 로그아웃
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
