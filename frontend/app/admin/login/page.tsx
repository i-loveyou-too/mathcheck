"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
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
    <ScreenShell>
      <section className="rounded-[2rem] bg-brand-deep p-6 text-white shadow-card">
        <p className="text-sm text-white/70">선생님 전용</p>
        <h1 className="mt-2 text-3xl font-bold">관리자 로그인</h1>
        <p className="mt-3 text-sm leading-6 text-white/80">학생 진도 현황을 한눈에 확인해 보세요.</p>
      </section>

      <form className="space-y-4 rounded-4xl border border-brand-border bg-white p-6 shadow-card" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-brand-deep">아이디</span>
          <input
            className="mt-3 w-full rounded-2xl border border-brand-border bg-brand-bg px-4 py-4 text-base outline-none transition focus:border-brand-yellow"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin"
            value={username}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-brand-deep">비밀번호</span>
          <input
            className="mt-3 w-full rounded-2xl border border-brand-border bg-brand-bg px-4 py-4 text-base outline-none transition focus:border-brand-yellow"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="1234"
            type="password"
            value={password}
          />
        </label>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          className="w-full rounded-full bg-brand-yellow px-5 py-4 text-base font-bold text-brand-navy transition hover:brightness-95"
          disabled={loading}
          type="submit"
        >
          {loading ? "로그인 중..." : "관리자 로그인"}
        </button>
      </form>
    </ScreenShell>
  );
}
