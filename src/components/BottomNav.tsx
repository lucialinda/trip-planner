"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  match: (pathname: string) => boolean;
}

const items: NavItem[] = [
  { label: "홈", href: "/", icon: "home", match: (p) => p === "/" },
  {
    label: "일정",
    href: "/schedule",
    icon: "map",
    match: (p) => p.startsWith("/schedule") || p.startsWith("/trip"),
  },
  {
    label: "정산",
    href: "/settle",
    icon: "payments",
    match: (p) => p.startsWith("/settle"),
  },
  {
    label: "스레드",
    href: "/community",
    icon: "forum",
    match: (p) => p.startsWith("/community") || p.startsWith("/threads"),
  },
];

export function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-3 bg-white/90 backdrop-blur-xl border-t border-sky-100 rounded-t-2xl"
      style={{ boxShadow: "0 -4px 12px rgba(0,0,0,0.05)" }}
    >
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
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
    </nav>
  );
}
