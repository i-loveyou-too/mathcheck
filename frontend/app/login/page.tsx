"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import { saveStudent } from "@/lib/storage";
import { StudentLoginResponse } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void apiFetch<StudentLoginResponse>("/student/auth/me")
      .then((student) => {
        saveStudent(student);
        router.replace("/student");
      })
      .catch(() => null);
  }, [router]);

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
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[430px] flex-col justify-center md:max-w-[460px]">
        <header className="text-center">
          <Image
            src="/aimon-logo.png"
            alt="AIMON"
            width={260}
            height={130}
            className="mx-auto h-auto w-[220px] max-w-[72vw] md:w-[250px]"
            priority
          />
          <p className="mt-5 text-sm font-semibold text-[#667085]">전화번호로 AIMON 학습 기록에 접속하세요.</p>
        </header>

        <form className="mt-10 space-y-5 rounded-[1.4rem] border border-[#EEF0F3] bg-white p-5 shadow-[0_18px_45px_rgba(31,41,51,0.07)] md:p-6" onSubmit={handleSubmit}>
          <label className="block">
            <span className="sr-only">전화번호</span>
            <span className="mb-2 block text-sm font-bold text-[#344054]">전화번호</span>
            <div className="flex items-center gap-3 rounded-2xl border border-[#DDE1E7] bg-white px-4 py-4 transition focus-within:border-[#EF7B78] focus-within:ring-4 focus-within:ring-[#FDE8E7]">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF1F0] text-base text-[#D95C58]">
                ☎
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[#1F2933] outline-none placeholder:text-[#98A2B3]"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="전화번호를 입력하세요"
                type="tel"
                value={phone}
              />
            </div>
          </label>

          {error ? (
            <p className="rounded-2xl border border-[#F8C7C5] bg-[#FFF5F4] px-4 py-3 text-sm font-bold text-[#C8433F]">{error}</p>
          ) : null}

          <button
            className="w-full rounded-2xl bg-[#E86F6B] py-4 text-base font-black text-white shadow-[0_12px_24px_rgba(232,111,107,0.24)] transition hover:bg-[#DC625E] focus:outline-none focus:ring-4 focus:ring-[#FDE8E7] disabled:cursor-not-allowed disabled:bg-[#F3B8B5] disabled:shadow-none"
            disabled={loading || !phone}
            type="submit"
          >
            {loading ? "확인 중..." : "시작하기"}
          </button>

          <p className="text-center text-sm font-semibold text-[#667085]">등록된 학생만 이용할 수 있어요.</p>
        </form>

        <section className="mt-6 rounded-2xl border border-[#F1D8D7] bg-[#FFF8F7] px-5 py-4">
          <div className="flex items-start gap-3">
            <div aria-hidden="true" className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#E86F6B]" />
            <div>
              <p className="text-sm font-bold text-[#344054]">AIMON이 학습 흐름을 차곡차곡 기록합니다.</p>
              <p className="mt-1 text-sm font-medium text-[#667085]">처음 이용한다면 등록된 전화번호인지 선생님에게 확인해 주세요.</p>
            </div>
          </div>
        </section>

        <div className="mt-6 text-center">
          <Link className="text-xs font-bold text-[#8A4750] transition hover:text-[#C8433F] focus:outline-none focus:ring-4 focus:ring-[#FDE8E7]" href="/admin/login">
            관리자 로그인
          </Link>
        </div>
      </div>
    </main>
  );
}
