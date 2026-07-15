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

function CheckListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9.3 16.3 6 13l1.4-1.4 1.9 1.9 4.3-4.3L15 10.6l-5.7 5.7zm8.7-.8h-2v-2h2v2zm0-4h-2v-2h2v2z" />
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

function CurriculumPathIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="5" cy="18" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="18" r="2.2" fill="currentColor" stroke="none" />
      <path d="M6.8 16.6 10.3 9M13.7 9l3.5 7.6" />
    </svg>
  );
}

export function StudentBottomNav() {
  const pathname = usePathname();

  const isHome = pathname === "/student";
  const isToday = pathname === "/student/today";
  const isSubjectArea =
    pathname.startsWith("/student/subjects") ||
    pathname.startsWith("/student/textbooks") ||
    pathname.startsWith("/student/units");
  const isCurriculum = pathname.startsWith("/student/curriculum");
  const isTracker = pathname === "/student/tracker";

  const items = [
    { href: "/student", label: "홈", Icon: HomeIcon, active: isHome },
    { href: "/student/today", label: "오늘미션", Icon: CheckListIcon, active: isToday },
    { href: "/student/subjects", label: "교재진도", Icon: BookIcon, active: isSubjectArea },
    { href: "/student/curriculum", label: "진도표", Icon: CurriculumPathIcon, active: isCurriculum },
    { href: "/student/tracker", label: "갓생챌린지", Icon: ChartIcon, active: isTracker },
  ];

  return (
    <nav className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-2.5rem)] max-w-[430px] -translate-x-1/2">
      <div className="rounded-[1.8rem] bg-[#0F172A] px-3 py-3 shadow-nav">
        <div className="grid grid-cols-5 gap-1">
          {items.map((item, idx) => (
            <Link
              key={idx}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-[1.2rem] px-1.5 py-2.5 text-[10px] font-semibold transition-all",
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
