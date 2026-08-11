"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAdmin } from "@/lib/storage";
import { cn } from "@/lib/utils";

const calendarIcon = "M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H5V9h14v10Z";

type AdminNavItem = {
  href: string;
  label: string;
  path: string;
  activePaths?: readonly string[];
};

const items: AdminNavItem[] = [
  { href: "/admin", label: "대시보드", path: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" },
  { href: "/admin/students", label: "학생", path: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 13c-4 0-7 2-7 5v2h14v-2c0-3-3-5-7-5Zm8 0c-.5 0-1 .1-1.5.2 1.5 1 2.5 2.6 2.5 4.8v2h6v-2c0-3-3-5-7-5Z" },
  { href: "/admin/daily-tasks", label: "숙제", path: "M19 3h-4a3 3 0 0 0-6 0H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM9 17l-3-3 1.5-1.5L9 14l4-4 1.5 1.5L9 17Z" },
  { href: "/admin/textbooks-management", label: "교재", path: "M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM6 4h5v8l-2.5-1.5L6 12V4Z" },
  { href: "/admin/curriculums", label: "진도", path: "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-6 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8.5 8l2.5 7m4.5-7L13 15" },
  {
    href: "/admin/challenges",
    label: "챌린지",
    path: "M4 5a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Zm4 4v2h8V9H8Zm0 4v2h5v-2H8Z",
    activePaths: ["/admin/challenges", "/admin/vocabulary-banks", "/admin/vocabulary-challenges", "/admin/vocabulary-review", "/admin/suteuk-challenges", "/admin/sprints", "/admin/sprint-proof-review"],
  },
  { href: "/admin/class-schedule", label: "수업 일정", path: calendarIcon },
  { href: "/admin/lesson-schedules", label: "일정 관리", path: calendarIcon },
];

function isActive(pathname: string, href: string, activePaths?: readonly string[]) {
  if (href === "/admin") {
    return pathname === href;
  }
  const paths = activePaths ?? [href];
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function AdminBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-[980px] -translate-x-1/2 px-2">
      <div className="rounded-[1.8rem] bg-[#0F172A] px-2 py-3 shadow-nav">
        <div className="grid grid-cols-9 gap-1">
          {items.map(({ href, label, path, activePaths }) => {
            const active = isActive(pathname, href, activePaths);
            return (
              <Link key={href} href={href} className={cn("flex flex-col items-center gap-1.5 rounded-[1.1rem] px-1 py-2.5 text-[9px] font-semibold", active ? "bg-white text-[#0F172A]" : "text-white/50")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d={path} /></svg>
                <span>{label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => { clearAdmin(); router.push("/admin/login"); }} className="flex flex-col items-center gap-1.5 rounded-[1.1rem] px-1 py-2.5 text-[9px] font-semibold text-white/50">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.5 1.5L18 11H8v2h10l-2.5 2.5L17 17l5-5-5-5ZM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5Z" /></svg>
            <span>로그아웃</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
