"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { Area, Point } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const HERO_ASPECT = 2; // 2:1
const OUTPUT_WIDTH = 1200; // 출력 이미지 가로 px (히어로 최대 width 기준)

interface TripHeroCropDialogProps {
  open: boolean;
  file: File | null;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
}

export function TripHeroCropDialog({
  open,
  file,
  saving = false,
  onCancel,
  onConfirm,
}: TripHeroCropDialogProps) {
  // file → object URL (파생 값)
  const imageSrc = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  // object URL revoke (외부 리소스 정리만 담당)
  useEffect(() => {
    if (!imageSrc) return;
    return () => URL.revokeObjectURL(imageSrc);
  }, [imageSrc]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onCancel()}>
      <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>대표 사진 자르기</DialogTitle>
        </DialogHeader>

        {/* imageSrc가 바뀔 때 자식이 리마운트되도록 key를 부여 → crop/zoom 자연 초기화 */}
        {imageSrc ? (
          <CropperBody
            key={imageSrc}
            src={imageSrc}
            saving={saving}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        ) : (
          <div
            className="relative w-full bg-slate-900 flex items-center justify-center text-white/60 text-sm"
            style={{ aspectRatio: "2 / 1" }}
          >
            이미지를 불러오는 중...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CropperBodyProps {
  src: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
}

function CropperBody({ src, saving, onCancel, onConfirm }: CropperBodyProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedAreaRef = useRef<Area | null>(null);

  const handleCropComplete = useCallback((_: Area, areaPixels: Area) => {
    croppedAreaRef.current = areaPixels;
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaRef.current) return;
    try {
      const blob = await cropImageToBlob(src, croppedAreaRef.current);
      if (!blob) return;
      await onConfirm(blob);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="relative w-full bg-slate-900" style={{ aspectRatio: "2 / 1" }}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={HERO_ASPECT}
          showGrid
          objectFit="contain"
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>

      <div className="px-4 py-3 border-b">
        <label className="text-xs text-on-surface-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">zoom_in</span>
          확대
        </label>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full mt-1 accent-primary"
          disabled={saving}
        />
      </div>

      <div className="flex gap-2 p-4">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button className="flex-1" onClick={handleConfirm} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          적용하기
        </Button>
      </div>
    </>
  );
}

// 캔버스로 잘라내고 JPEG Blob 반환 (용량/대역폭 절감)
async function cropImageToBlob(src: string, area: Area): Promise<Blob | null> {
  const img = await loadImage(src);
  const targetW = OUTPUT_WIDTH;
  const targetH = Math.round(OUTPUT_WIDTH / HERO_ASPECT);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    targetW,
    targetH,
  );

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
