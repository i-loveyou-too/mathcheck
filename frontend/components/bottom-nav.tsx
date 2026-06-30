"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type BottomNavProps = {
  items: {
    href: string;
    label: string;
  }[];
};

export function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-full border border-brand-border bg-white/95 p-2 shadow-card backdrop-blur">
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              className={cn(
                "rounded-full px-4 py-3 text-center text-sm font-semibold transition",
                active ? "bg-brand-navy text-white" : "text-brand-muted"
              )}
              href={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
