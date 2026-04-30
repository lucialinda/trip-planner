import React, { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface SwipeableItemProps {
  children: React.ReactNode;
  actions: React.ReactNode;
  actionWidth?: number; // Total width of the actions container
  disabled?: boolean;
}

export function SwipeableItem({
  children,
  actions,
  actionWidth = 128,
  disabled = false,
}: SwipeableItemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isHorizontalDrag, setIsHorizontalDrag] = useState<boolean | null>(null);

  // When clicking outside, close the swipe
  useEffect(() => {
    if (!isOpen) return;
    
    const handleDocumentClick = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setTranslateX(0);
      }
    };

    document.addEventListener("pointerdown", handleDocumentClick);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentClick);
    };
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.target as HTMLElement).closest("button, a")) return;
    
    // Support mouse drag and touch
    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }
    
    setDragStartX(e.clientX);
    setDragStartY(e.clientY);
    setIsDragging(true);
    setIsHorizontalDrag(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || dragStartX === null || dragStartY === null) return;

    const currentX = e.clientX;
    const currentY = e.clientY;
    const diffX = currentX - dragStartX;
    const diffY = currentY - dragStartY;

    // Determine if it's a horizontal drag or vertical scroll
    if (isHorizontalDrag === null) {
      if (Math.abs(diffY) > Math.abs(diffX)) {
        setIsHorizontalDrag(false);
        return;
      }
      setIsHorizontalDrag(true);
    }

    if (!isHorizontalDrag) return;

    // Calculate new translation
    const base = isOpen ? -actionWidth : 0;
    const newTranslate = Math.max(-actionWidth, Math.min(0, base + diffX));
    setTranslateX(newTranslate);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    if (containerRef.current) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }

    setIsDragging(false);
    setDragStartX(null);
    setDragStartY(null);

    // Snap to open or closed based on threshold
    const threshold = actionWidth / 2;
    if (translateX < -threshold) {
      setIsOpen(true);
      setTranslateX(-actionWidth);
    } else {
      setIsOpen(false);
      setTranslateX(0);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (containerRef.current) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
    setDragStartX(null);
    setDragStartY(null);
    
    if (isOpen) {
      setTranslateX(-actionWidth);
    } else {
      setTranslateX(0);
    }
  };

  return (
    <div 
      className="relative overflow-hidden rounded-xl touch-pan-y mb-2"
      ref={containerRef}
    >
      <div 
        className={cn(
          "relative z-10 w-full bg-transparent transition-transform duration-200 ease-out",
          isDragging && "transition-none"
        )}
        style={{ transform: `translateX(${translateX}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {children}
      </div>
      <div 
        className="absolute top-0 right-0 bottom-0 flex"
        style={{ width: actionWidth }}
      >
        {actions}
      </div>
    </div>
  );
}
