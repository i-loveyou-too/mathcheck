"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAdmin } from "@/lib/storage";
import { cn } from "@/lib/utils";

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C14 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-3.67-3.5-7-3.5z" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1S9.6 1.84 9.18 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9.3 16.3 6.7 13.7l1.4-1.4 1.2 1.2 3.6-3.6 1.4 1.4-5 5zM18 15h-4v-2h4v2zm0-4h-4V9h4v2z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  );
}

export function AdminBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearAdmin();
    router.push("/admin/login");
  };

  const isDashboard = pathname === "/admin";
  const isStudents = pathname.startsWith("/admin/students");
  const isDailyTasks = pathname.startsWith("/admin/daily-tasks");

  return (
    <nav className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-2.5rem)] max-w-[720px] -translate-x-1/2">
      <div className="rounded-[1.8rem] bg-[#0F172A] px-3 py-3 shadow-nav">
        <div className="grid grid-cols-4 gap-1">
          <Link
            href="/admin"
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[1.2rem] px-1.5 py-2.5 text-[10px] font-semibold transition-all",
              isDashboard ? "bg-white text-[#0F172A]" : "text-white/50 hover:text-white/75"
            )}
          >
            <GridIcon />
            <span>대시보드</span>
          </Link>

          <Link
            href="/admin"
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[1.2rem] px-1.5 py-2.5 text-[10px] font-semibold transition-all",
              isStudents ? "bg-white text-[#0F172A]" : "text-white/50 hover:text-white/75"
            )}
          >
            <PeopleIcon />
            <span>학생 목록</span>
          </Link>

          <Link
            href="/admin/daily-tasks"
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[1.2rem] px-1.5 py-2.5 text-[10px] font-semibold transition-all",
              isDailyTasks ? "bg-white text-[#0F172A]" : "text-white/50 hover:text-white/75"
            )}
          >
            <TaskIcon />
            <span>숙제</span>
          </Link>

          <button
            onClick={handleLogout}
            type="button"
            className="flex flex-col items-center gap-1.5 rounded-[1.2rem] px-1.5 py-2.5 text-[10px] font-semibold text-white/50 transition-all hover:text-white/75"
          >
            <LogoutIcon />
            <span>나가기</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
