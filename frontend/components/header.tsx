"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAdmin, clearStudent } from "@/lib/storage";

type HeaderProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  logoutType?: "student" | "admin";
};

export function Header({ title, subtitle, backHref, logoutType }: HeaderProps) {
  const router = useRouter();

  const handleLogout = () => {
    if (logoutType === "student") {
      clearStudent();
      router.push("/login");
      return;
    }

    if (logoutType === "admin") {
      clearAdmin();
      router.push("/admin/login");
    }
  };

  return (
    <header className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        {backHref ? (
          <Link className="text-sm font-medium text-brand-muted" href={backHref}>
            이전으로
          </Link>
        ) : null}
        <h1 className="text-2xl font-bold text-brand-deep">{title}</h1>
        {subtitle ? <p className="text-sm text-brand-muted">{subtitle}</p> : null}
      </div>

      {logoutType ? (
        <button
          className="rounded-full border border-brand-border bg-white px-4 py-2 text-sm font-semibold text-brand-navy shadow-card"
          onClick={handleLogout}
          type="button"
        >
          로그아웃
        </button>
      ) : null}
    </header>
  );
}
