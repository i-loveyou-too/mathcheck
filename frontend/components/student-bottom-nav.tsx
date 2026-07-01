"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zM16.2 13h2.8v6h-2.8v-6z" />
    </svg>
  );
}

export function StudentBottomNav() {
  const pathname = usePathname();

  const isHome = pathname === "/student";
  const isSubjectArea =
    pathname.startsWith("/student/subjects") ||
    pathname.startsWith("/student/units");

  const items = [
    { href: "/student", label: "홈", Icon: HomeIcon, active: isHome },
    { href: "/student", label: "교재별 진도", Icon: BookIcon, active: isSubjectArea },
    { href: "/student", label: "내 진도", Icon: ChartIcon, active: !isHome && !isSubjectArea },
  ];

  return (
    <nav className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-2.5rem)] max-w-[390px] -translate-x-1/2">
      <div className="rounded-[1.8rem] bg-[#0F172A] px-3 py-3 shadow-nav">
        <div className="grid grid-cols-3 gap-1">
          {items.map((item, idx) => (
            <Link
              key={idx}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-[1.2rem] px-3 py-2.5 text-[11px] font-semibold transition-all",
                item.active
                  ? "bg-white text-[#0F172A]"
                  : "text-white/50 hover:text-white/75"
              )}
            >
              <item.Icon />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
