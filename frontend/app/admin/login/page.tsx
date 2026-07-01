"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { saveAdmin } from "@/lib/storage";
import { AdminLoginResponse } from "@/lib/types";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const admin = await apiFetch<AdminLoginResponse>("/auth/admin-login", {
        method: "POST",
        body: { username, password },
      });

      saveAdmin({ ...admin, isLoggedIn: true });
      router.push("/admin");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0F172A] px-5 py-12">
      <div className="w-full max-w-[390px]">
        {/* Admin logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="white">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white">MathCheck</h1>
          <p className="mt-1.5 text-sm text-white/50">관리자 전용 시스템</p>
        </div>

        {/* Login card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur">
          <h2 className="text-xl font-bold text-white">관리자 로그인</h2>
          <p className="mt-1 text-sm text-white/50">
            학생 진도 현황을 한눈에 확인하세요.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-white/70">아이디</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white outline-none transition placeholder:text-white/25 focus:border-white/30 focus:bg-white/10"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                value={username}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-white/70">비밀번호</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white outline-none transition placeholder:text-white/25 focus:border-white/30 focus:bg-white/10"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                type="password"
                value={password}
              />
            </div>

            {error ? (
              <p className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-400">{error}</p>
            ) : null}

            <button
              className="w-full rounded-2xl bg-white py-4 text-base font-bold text-[#0F172A] transition hover:opacity-90 disabled:opacity-50"
              disabled={loading || !username || !password}
              type="submit"
            >
              {loading ? "로그인 중..." : "관리자 입장"}
            </button>
          </form>
        </div>

        {/* Student link */}
        <div className="mt-6 text-center">
          <Link
            className="text-xs text-white/30 transition hover:text-white/50"
            href="/login"
          >
            학생 로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
