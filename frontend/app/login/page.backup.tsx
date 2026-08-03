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
    <main className="min-h-screen bg-white px-5 py-8 text-[#1F2933]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[430px] flex-col justify-center">
        <div className="text-center">
          <img
            alt="AIMON"
            className="mx-auto w-[220px] max-w-[72vw] object-contain"
            src="/aimon-logo.png"
          />
          <p className="mt-5 text-sm font-semibold text-[#667085]">전화번호로 AIMON 학습 기록에 접속하세요.</p>
        </div>

        <section className="mt-10 rounded-[1.4rem] border border-[#EEF0F3] bg-white p-5 shadow-[0_18px_45px_rgba(31,41,51,0.07)]">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-bold text-[#344054]">전화번호</label>
              <div className="flex items-center gap-3 rounded-2xl border border-[#DDE1E7] bg-white px-4 py-4 transition focus-within:border-[#EF7B78] focus-within:ring-4 focus-within:ring-[#FDE8E7]">
                <input
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[#1F2933] outline-none placeholder:text-[#98A2B3]"
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="전화번호를 입력하세요"
                  type="tel"
                  value={phone}
                />
              </div>
            </div>

            {error ? (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{error}</p>
            ) : null}

            <button
              className="w-full rounded-2xl bg-[#E86F6B] py-4 text-base font-black text-white shadow-[0_12px_24px_rgba(232,111,107,0.24)] transition hover:bg-[#DC625E] focus:outline-none focus:ring-4 focus:ring-[#FDE8E7] disabled:cursor-not-allowed disabled:bg-[#F3B8B5] disabled:shadow-none"
              disabled={loading || !phone}
              type="submit"
            >
              {loading ? "확인 중..." : "시작하기"}
            </button>
          </form>
        </section>

        <div className="pb-2 text-center">
          <Link className="text-xs font-bold text-[#8A4750] transition hover:text-[#C8433F]" href="/admin/login">
            관리자이신가요?
          </Link>
        </div>
      </div>
    </main>
  );
}
