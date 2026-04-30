"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc, writeBatch, collection, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import { db, storage, auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Edit2, Camera, Loader2 } from "lucide-react";

interface MembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: any;
}

export function MembersDialog({ open, onOpenChange, trip }: MembersDialogProps) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && trip?.members) {
      loadProfiles();
    } else {
      setIsEditing(false);
    }
  }, [open, trip]);

  const loadProfiles = async () => {
    setLoading(true);
    const uids = Object.keys(trip.members || {});
    const newProfiles: Record<string, any> = {};
    
    await Promise.all(uids.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, "userProfiles", uid));
        if (snap.exists()) {
          newProfiles[uid] = snap.data();
        }
      } catch (e) {
        console.error("Failed to load profile for", uid);
      }
    }));
    
    setProfiles(newProfiles);
    setLoading(false);
  };

  const handleEditClick = () => {
    if (!user) return;
    setEditName(user.displayName || "익명");
    setEditPhoto(null);
    setEditPhotoPreview(profiles[user.uid]?.photoURL || user.photoURL || null);
    setIsEditing(true);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드 가능합니다.");
      return;
    }
    // simple size check 2MB
    if (file.size > 2 * 1024 * 1024) {
      toast.error("이미지는 2MB 이하로 선택해주세요.");
      return;
    }
    setEditPhoto(file);
    setEditPhotoPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    if (!user || !auth.currentUser) return;
    const newName = editName.trim();
    if (!newName) {
      toast.error("닉네임을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      let photoURL = profiles[user.uid]?.photoURL || user.photoURL;

      if (editPhoto) {
        const fileRef = ref(storage, `profile-photos/${user.uid}/avatar`);
        await uploadBytes(fileRef, editPhoto);
        photoURL = await getDownloadURL(fileRef);
      }

      await updateProfile(auth.currentUser, {
        displayName: newName,
        photoURL: photoURL
      });

      // Update userProfiles
      await setDoc(doc(db, "userProfiles", user.uid), {
        name: newName,
        photoURL: photoURL
      }, { merge: true });

      // Update all trips the user is in
      const q = query(collection(db, "trips"), where("memberUids", "array-contains", user.uid));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(d => {
        batch.update(d.ref, {
          [`members.${user.uid}`]: newName
        });
      });
      await batch.commit();

      toast.success("프로필이 변경되었습니다.");
      setIsEditing(false);
      loadProfiles(); // reload to get new avatar
    } catch (error: any) {
      console.error(error);
      toast.error(`저장 실패: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const membersCount = Object.keys(trip?.members || {}).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl">
        {isEditing ? (
          <>
            <DialogHeader>
              <DialogTitle>프로필 수정</DialogTitle>
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
                <Input value={editName} onChange={e => setEditName(e.target.value)} maxLength={20} />
              </div>

              <div className="flex gap-2 w-full mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setIsEditing(false)} disabled={saving}>취소</Button>
                <Button className="flex-1" onClick={handleSaveProfile} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  저장하기
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>여행 멤버 ({membersCount}명)</DialogTitle>
            </DialogHeader>
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="flex flex-col gap-3 mt-4">
                {Object.entries(trip?.members || {}).map(([uid, name]) => {
                  const isMe = uid === user?.uid;
                  const photoUrl = profiles[uid]?.photoURL;
                  return (
                    <div key={uid} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border shadow-sm">
                          {photoUrl ? (
                            <AvatarImage src={photoUrl} className="object-cover" />
                          ) : (
                            <AvatarFallback className="bg-primary/10 text-primary font-medium">
                              {String(name).charAt(0)}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{name as string}</p>
                          {isMe && <p className="text-xs text-primary font-semibold">나</p>}
                        </div>
                      </div>
                      {isMe && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleEditClick}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
