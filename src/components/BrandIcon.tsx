import { CSSProperties } from "react";

type Size = "sm" | "md" | "lg" | "xl";
type Variant = "badge" | "plain";

interface BrandIconProps {
  /**
   * - `badge` (default): navy rounded-square with the white flight_takeoff symbol.
   *   Strong brand presence — used on the login hero, splash screens, etc.
   * - `plain`: just the primary-colored flight_takeoff symbol, no background.
   *   Lightweight accent — used inline next to titles, in small hero blocks.
   */
  variant?: Variant;
  size?: Size;
  /** Slight 3deg tilt that straightens on hover (only for `badge` variant) */
  animated?: boolean;
  /** Drop shadow via .clean-shadow (only for `badge` variant) */
  shadow?: boolean;
  className?: string;
  style?: CSSProperties;
}

const BADGE_SIZE_MAP: Record<Size, { box: string; icon: string }> = {
  sm: { box: "w-10 h-10 rounded-xl", icon: "text-lg" },
  md: { box: "w-14 h-14 rounded-2xl", icon: "text-2xl" },
  lg: { box: "w-20 h-20 rounded-2xl", icon: "text-4xl" },
  xl: { box: "w-28 h-28 rounded-3xl", icon: "text-5xl" },
};

const PLAIN_SIZE_MAP: Record<Size, string> = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-5xl",
};

/**
 * BrandIcon — the app's main mark (flight_takeoff).
 * Two visual variants:
 *   <BrandIcon variant="badge" size="lg" animated shadow />  // login hero
 *   <BrandIcon variant="plain" size="lg" />                  // inline hero accent
 */
export function BrandIcon({
  variant = "badge",
  size = "lg",
  animated = false,
  shadow = false,
  className = "",
  style,
}: BrandIconProps) {
  if (variant === "plain") {
    return (
      <span
        className={`material-symbols-outlined text-primary ${PLAIN_SIZE_MAP[size]} ${className}`}
        style={{ fontVariationSettings: "'FILL' 1", ...style }}
      >
        flight_takeoff
      </span>
    );
  }

  const s = BADGE_SIZE_MAP[size];
  return (
    <div
      className={[
        s.box,
        "bg-primary flex items-center justify-center",
        shadow ? "clean-shadow" : "",
        animated ? "rotate-3 hover:rotate-0 transition-transform duration-500" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <span
        className={`material-symbols-outlined text-white ${s.icon}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        flight_takeoff
      </span>
    </div>
  );
}
