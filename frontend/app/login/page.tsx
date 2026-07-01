"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { saveStudent } from "@/lib/storage";
import { StudentLoginResponse } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const student = await apiFetch<StudentLoginResponse>("/auth/student-login", {
        method: "POST",
        body: { phone },
      });

      saveStudent(student);
      router.push("/student");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#EEF2F6] px-5 py-12">
      <div className="w-full max-w-[390px]">
        {/* App logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#0F172A] shadow-lg">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">MathCheck</h1>
          <p className="mt-1.5 text-sm text-gray-500">9모 대비 진도관리</p>
        </div>

        {/* Login card */}
        <div className="rounded-3xl bg-white p-7 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <h2 className="text-xl font-bold text-gray-900">시작하기</h2>
          <p className="mt-1 text-sm text-gray-500">
            전화번호만 입력하면 바로 진도표로 이동합니다.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                휴대폰 번호
              </label>
              <input
                className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-5 py-4 text-base text-gray-900 outline-none transition focus:border-[#0F172A] focus:bg-white"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01011112222"
                type="tel"
                value={phone}
              />
            </div>

            {error ? (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
            ) : null}

            <button
              className="w-full rounded-2xl bg-[#0F172A] py-4 text-base font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              disabled={loading || !phone}
              type="submit"
            >
              {loading ? "로그인 중..." : "시작하기"}
            </button>
          </form>
        </div>

        {/* Admin link - subtle */}
        <div className="mt-6 text-center">
          <Link
            className="text-xs text-gray-400 transition hover:text-gray-600"
            href="/admin/login"
          >
            관리자이신가요? →
          </Link>
        </div>
      </div>
    </div>
  );
}
