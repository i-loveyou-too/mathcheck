"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type BottomNavProps = {
  items: {
    href: string;
    label: string;
    icon?: string;
  }[];
};

export function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[2rem] bg-brand-deep p-2.5 shadow-[0_20px_45px_rgba(15,23,42,0.28)]">
      <div className={`grid gap-2 ${items.length === 4 ? "grid-cols-4" : `grid-cols-${Math.min(items.length, 4)}`}`}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-[1.3rem] px-3 py-2 text-center text-[11px] font-semibold transition",
                active ? "bg-white text-brand-deep" : "text-white/70"
              )}
              href={item.href}
            >
              <span className="text-base leading-none">{item.icon ?? "•"}</span>
              <span className="mt-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
