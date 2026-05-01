import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface SwipeableItemHandle {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
}

interface SwipeableItemProps {
  children: React.ReactNode;
  actions: React.ReactNode;
  actionWidth?: number; // Total width of the actions container
  disabled?: boolean;
  /** Called whenever the open state changes (drag or imperative). */
  onOpenChange?: (open: boolean) => void;
}

export const SwipeableItem = forwardRef<SwipeableItemHandle, SwipeableItemProps>(function SwipeableItem(
  { children, actions, actionWidth = 128, disabled = false, onOpenChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isHorizontalDrag, setIsHorizontalDrag] = useState<boolean | null>(null);

  const setOpenState = (next: boolean) => {
    setIsOpen((prev) => {
      if (prev !== next) onOpenChange?.(next);
      return next;
    });
    setTranslateX(next ? -actionWidth : 0);
  };

  useImperativeHandle(
    ref,
    () => ({
      open: () => setOpenState(true),
      close: () => setOpenState(false),
      toggle: () => setOpenState(!isOpen),
      isOpen: () => isOpen,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, actionWidth]
  );

  // When clicking outside, close the swipe
  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentClick = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenState(false);
      }
    };

    document.addEventListener("pointerdown", handleDocumentClick);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.target as HTMLElement).closest("button, a")) return;

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

    if (isHorizontalDrag === null) {
      if (Math.abs(diffY) > Math.abs(diffX)) {
        setIsHorizontalDrag(false);
        return;
      }
      setIsHorizontalDrag(true);
    }

    if (!isHorizontalDrag) return;

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

    const threshold = actionWidth / 2;
    if (translateX < -threshold) {
      setOpenState(true);
    } else {
      setOpenState(false);
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

    setTranslateX(isOpen ? -actionWidth : 0);
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
        className="absolute top-0 right-0 bottom-0 flex transition-opacity duration-150"
        style={{
          width: actionWidth,
          opacity: translateX < 0 ? 1 : 0,
          pointerEvents: translateX < 0 ? "auto" : "none",
        }}
        aria-hidden={translateX === 0}
      >
        {actions}
      </div>
    </div>
  );
});
