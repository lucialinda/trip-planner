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
  { label: "홈", href: "/", icon: "house", match: (p) => p === "/" },
  { label: "일정", href: "/schedule", icon: "calendar_month", match: (p) => p.startsWith("/schedule") || p.startsWith("/trip") },
  { label: "정산", href: "/settle", icon: "request_quote", match: (p) => p.startsWith("/settle") },
  { label: "커뮤니티", href: "/community", icon: "group", match: (p) => p.startsWith("/community") },
];

export function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      <div className="flex gap-2 border-t border-outline-variant/30 bg-white/95 backdrop-blur-md px-4 pb-3 pt-2">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-end gap-1 ${
                active ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              <div className="flex h-8 items-center justify-center">
                <span
                  className="material-symbols-outlined"
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
              </div>
              <p className={`text-xs leading-normal tracking-[0.015em] ${active ? "font-bold" : "font-semibold"}`}>
                {item.label}
              </p>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
