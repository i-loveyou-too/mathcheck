"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const icons = {
  home: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />,
  list: <path d="M7 7h14v2H7V7Zm0 4h14v2H7v-2Zm0 4h14v2H7v-2ZM3 7h2v2H3V7Zm0 4h2v2H3v-2Zm0 4h2v2H3v-2Z" />,
  chart: <path d="M5 9h3v10H5V9Zm5.5-4h3v14h-3V5Zm5.5 8h3v6h-3v-6Z" />,
  pen: <path d="m4 17 1 3 3-1 10-10-4-4L4 15v2Zm12-14 5 5-2 2-5-5 2-2Z" />,
  book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm16 0A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />,
};

const items = [
  { href: "/student/sprint", label: "홈", icon: "home" },
  { href: "/student/sprint/proofs", label: "인증 내역", icon: "list" },
  { href: "/student/sprint/records", label: "학습 기록", icon: "chart" },
  { href: "/student/sprint/mock-exams", label: "모의고사", icon: "pen" },
  { href: "/student/sprint/vocabulary", label: "영단어", icon: "book" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/student/sprint") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SprintBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 rounded-t-[26px] bg-white/95 px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(25,58,100,0.16)] backdrop-blur">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-bold transition",
                active ? "text-[#2874E8]" : "text-[#647084] hover:text-[#2874E8]",
              )}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">{icons[item.icon]}</svg>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
