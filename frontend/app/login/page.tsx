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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#FFFFFF_0%,#F7F8FF_48%,#F4F7FB_100%)] px-5 py-9 text-[#101A38]">
      <div className="mx-auto flex min-h-[calc(100vh-4.5rem)] w-full max-w-[430px] flex-col justify-center">
        <header className="text-center">
          <Image
            src="/haenaem-logo.png"
            alt="오늘도 해냄"
            width={320}
            height={160}
            className="mx-auto"
            priority
          />
        </header>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block overflow-hidden rounded-[1.6rem] border border-[#E1E5F5] bg-white shadow-[0_16px_35px_rgba(64,70,130,0.08)]">
            <span className="sr-only">전화번호</span>
            <div className="flex items-center gap-4 px-6 py-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0EEFF] text-xl text-[#7B7FF0]">
                ☎
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent text-lg font-bold text-[#101A38] outline-none placeholder:text-[#A4ABC0]"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="전화번호를 입력하세요"
                type="tel"
                value={phone}
              />
            </div>
          </label>

          {error ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{error}</p>
          ) : null}

          <button
            className="w-full rounded-[1.6rem] bg-[#07143A] py-5 text-xl font-black text-white shadow-[0_16px_34px_rgba(7,20,58,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(7,20,58,0.28)] disabled:opacity-55"
            disabled={loading || !phone}
            type="submit"
          >
            {loading ? "확인 중..." : "시작하기"}
          </button>

          <p className="text-center text-sm font-bold text-[#8B93AA]">등록된 학생만 이용할 수 있어요.</p>
        </form>

        <section className="mt-8 rounded-[1.8rem] border border-white bg-gradient-to-r from-[#F1EFFF] to-[#F9FBFF] px-6 py-5 shadow-[0_16px_36px_rgba(64,70,130,0.08)]">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#DFDBFF] text-2xl text-[#7471F1]">
              ♥
            </div>
            <div>
              <p className="text-base font-black text-[#101A38]">작게 해도 괜찮아. 오늘도 해내면 돼.</p>
              <p className="mt-1 text-sm font-bold text-[#747D98]">너의 노력을 차곡차곡 기록할게요.</p>
            </div>
          </div>
        </section>

        <div className="mt-6 text-center">
          <Link className="text-xs font-bold text-[#9AA1B4] transition hover:text-[#101A38]" href="/admin/login">
            관리자 로그인
          </Link>
        </div>
      </div>
    </main>
  );
}
