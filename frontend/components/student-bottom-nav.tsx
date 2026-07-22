"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const icons = {
  home: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />,
  today: <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM9.3 16.3 6 13l1.4-1.4 1.9 1.9 4.3-4.3L15 10.6l-5.7 5.7Z" />,
  book: <path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM6 4h5v8l-2.5-1.5L6 12V4Z" />,
  path: <path d="M5 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6.5 16.4l4-7m3 0 4 7" />,
  chart: <path d="M5 9h3v10H5V9Zm5.5-4h3v14h-3V5Zm5.5 8h3v6h-3v-6Z" />,
};

export function StudentBottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/student/sprint")) return null;

  const items = [
    { href: "/student", label: "홈", icon: "home", active: pathname === "/student" },
    { href: "/student/today", label: "오늘미션", icon: "today", active: pathname === "/student/today" },
    { href: "/student/subjects", label: "교재진도", icon: "book", active: /\/(subjects|textbooks|units)/.test(pathname) },
    { href: "/student/curriculum", label: "진도맵", icon: "path", active: pathname.startsWith("/student/curriculum") },
    { href: "/student/tracker", label: "갓생", icon: "chart", active: pathname === "/student/tracker" },
  ] as const;

  return (
    <nav className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-[430px] -translate-x-1/2 px-2">
      <div className="rounded-[1.8rem] bg-[#0F172A] px-2 py-3 shadow-nav">
        <div className="grid grid-cols-5 gap-1">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={cn(
              "flex min-w-0 flex-col items-center gap-1.5 rounded-[1.15rem] px-0.5 py-2.5 text-[9px] font-semibold transition-all",
              item.active ? "bg-white text-[#0F172A]" : "text-white/50 hover:text-white/75",
            )}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">{icons[item.icon]}</svg>
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
