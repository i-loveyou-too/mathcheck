"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudentLogoutButton } from "@/components/student-logout-button";
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
    <div className="space-y-2">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 transition hover:text-gray-600"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          돌아가기
        </Link>
      ) : null}

      <div className="flex items-start justify-between gap-4 pt-0.5">
        <div className="min-w-0">
          <h1 className="text-2xl font-black leading-tight tracking-tight text-gray-900">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm leading-relaxed text-gray-500">{subtitle}</p>
          ) : null}
        </div>

        {logoutType === "student" ? <StudentLogoutButton onClick={handleLogout} /> : null}
        {logoutType === "admin" ? (
          <button
            className="shrink-0 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-200"
            onClick={handleLogout}
            type="button"
          >
            로그아웃
          </button>
        ) : null}
      </div>
    </div>
  );
}
