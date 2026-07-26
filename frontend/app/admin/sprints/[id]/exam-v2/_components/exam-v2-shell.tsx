"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminBottomNav } from "@/components/admin-bottom-nav";

type Props = {
  sprintId: number;
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function ExamV2Shell({ sprintId, title, eyebrow = "SPRINT EXAM V2", description, actions, children }: Props) {
  const pathname = usePathname();
  const base = `/admin/sprints/${sprintId}/exam-v2`;
  const links = [
    { href: base, label: "시험 목록", active: pathname === base },
    { href: `${base}/new`, label: "시험 생성", active: pathname === `${base}/new` },
    { href: `${base}/results`, label: "결과 관리", active: pathname === `${base}/results` || pathname.startsWith(`${base}/results/`) },
  ];

  return (
    <main className="min-h-screen bg-[#EEF4FA] pb-32 text-[#17213B]">
      <div className="mx-auto max-w-[1240px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/admin/sprints/${sprintId}`} className="text-sm font-bold text-[#687995]">
            SPRINT 상세
          </Link>
          <nav className="flex rounded-lg border border-[#DDE6F0] bg-white p-1 shadow-sm" aria-label="시험 관리">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-xs font-black ${link.active ? "bg-[#2874E8] text-white" : "text-[#687995] hover:bg-[#F3F7FB]"}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black text-[#2874E8]">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-black text-[#10213D] sm:text-3xl">{title}</h1>
            {description && <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#687995]">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>

        <div className="mt-6">{children}</div>
      </div>
      <AdminBottomNav />
    </main>
  );
}

export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-black ${tone}`}>{label ?? status}</span>;
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4">
      <p className="text-sm font-bold text-red-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-md bg-white px-3 py-2 text-xs font-black text-red-700 ring-1 ring-red-200">
          다시 시도
        </button>
      )}
    </div>
  );
}

export function LoadingPanel({ label = "불러오는 중..." }: { label?: string }) {
  return <div className="rounded-lg border border-[#E1E8F0] bg-white px-5 py-12 text-center text-sm font-bold text-[#8290A6]">{label}</div>;
}
