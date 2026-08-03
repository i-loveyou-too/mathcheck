"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-5 py-12 text-[#1F2933]">
      <div className="w-full max-w-[390px]">
        <div className="mb-8 text-center">
          <Image
            src="/aimon-logo.png"
            alt="AIMON"
            width={220}
            height={110}
            className="mx-auto h-auto w-[190px] max-w-[68vw]"
            priority
          />
          <p className="mt-5 text-sm font-semibold text-[#667085]">관리자 전용 시스템</p>
        </div>

        <div className="rounded-[1.4rem] border border-[#EEF0F3] bg-white p-6 shadow-[0_18px_45px_rgba(31,41,51,0.07)]">
          <h2 className="text-xl font-black text-[#1F2933]">관리자 로그인</h2>
          <p className="mt-1 text-sm font-medium text-[#667085]">
            학생 진도 현황을 한눈에 확인하세요.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-bold text-[#344054]">아이디</label>
              <input
                className="w-full rounded-2xl border border-[#DDE1E7] bg-white px-4 py-4 text-base font-semibold text-[#1F2933] outline-none transition placeholder:text-[#98A2B3] focus:border-[#EF7B78] focus:ring-4 focus:ring-[#FDE8E7]"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                value={username}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#344054]">비밀번호</label>
              <input
                className="w-full rounded-2xl border border-[#DDE1E7] bg-white px-4 py-4 text-base font-semibold text-[#1F2933] outline-none transition placeholder:text-[#98A2B3] focus:border-[#EF7B78] focus:ring-4 focus:ring-[#FDE8E7]"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                type="password"
                value={password}
              />
            </div>

            {error ? (
              <p className="rounded-2xl border border-[#F8C7C5] bg-[#FFF5F4] px-4 py-3 text-sm font-bold text-[#C8433F]">{error}</p>
            ) : null}

            <button
              className="w-full rounded-2xl bg-[#E86F6B] py-4 text-base font-black text-white shadow-[0_12px_24px_rgba(232,111,107,0.22)] transition hover:bg-[#DC625E] focus:outline-none focus:ring-4 focus:ring-[#FDE8E7] disabled:cursor-not-allowed disabled:bg-[#F3B8B5] disabled:shadow-none"
              disabled={loading || !username || !password}
              type="submit"
            >
              {loading ? "로그인 중..." : "관리자 입장"}
            </button>
          </form>
        </div>

        {/* Student link */}
        <div className="mt-6 text-center">
          <Link className="text-xs font-bold text-[#8A4750] transition hover:text-[#C8433F] focus:outline-none focus:ring-4 focus:ring-[#FDE8E7]" href="/login">
            학생 로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
