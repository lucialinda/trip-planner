"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  match: (pathname: string) => boolean;
  // trip id가 필요한 탭인지 (홈은 false)
  needsTripId: boolean;
  // tripId가 없을 때 fallback href (placeholder 페이지)
  fallbackHref?: string;
}

const items: NavItem[] = [
  {
    label: "홈",
    href: "/",
    icon: "home",
    match: (p) => p === "/",
    needsTripId: false,
  },
  {
    label: "일정",
    href: "/trip",
    icon: "map",
    match: (p) => p.startsWith("/schedule") || p.startsWith("/trip"),
    needsTripId: true,
    fallbackHref: "/schedule",
  },
  {
    label: "정산",
    href: "/settle",
    icon: "payments",
    match: (p) => p.startsWith("/settle"),
    needsTripId: true,
    fallbackHref: "/settle",
  },
  {
    label: "스레드",
    href: "/community",
    icon: "forum",
    match: (p) => p.startsWith("/community") || p.startsWith("/threads"),
    needsTripId: true,
    fallbackHref: "/community",
  },
];

function BottomNavInner() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const tripId = searchParams?.get("id") || null;

  const buildHref = (item: NavItem) => {
    if (!item.needsTripId) return item.href;
    if (tripId) return `${item.href}?id=${tripId}`;
    return item.fallbackHref || item.href;
  };

  return (
    <>
      {items.map((item) => {
        const active = item.match(pathname);
        const href = buildHref(item);
        return (
          <Link
            key={item.label}
            href={href}
            className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-full transition-colors ${
              active
                ? "text-primary bg-sky-50"
                : "text-slate-400 hover:text-primary"
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {item.icon}
            </span>
            <span
              className={`text-[10px] font-sans ${
                active ? "font-semibold" : "font-medium"
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </>
  );
}

function BottomNavFallback() {
  // 정적 export 빌드 시 useSearchParams가 Suspense 경계를 요구하므로
  // 파라미터를 모르는 상태로도 일단 탭 자체는 보이도록 fallback 제공
  return (
    <>
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.needsTripId ? item.fallbackHref || item.href : item.href}
          className="flex flex-col items-center justify-center px-4 py-1.5 rounded-full text-slate-400"
        >
          <span className="material-symbols-outlined">{item.icon}</span>
          <span className="text-[10px] font-sans font-medium">{item.label}</span>
        </Link>
      ))}
    </>
  );
}

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-3 bg-white/90 backdrop-blur-xl border-t border-sky-100 rounded-t-2xl"
      style={{ boxShadow: "0 -4px 12px rgba(0,0,0,0.05)" }}
    >
      <Suspense fallback={<BottomNavFallback />}>
        <BottomNavInner />
      </Suspense>
    </nav>
  );
}
