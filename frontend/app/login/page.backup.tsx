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
    <main className="relative min-h-screen overflow-hidden bg-[#F7FBF4] px-5 py-8">
      <div className="pointer-events-none absolute -bottom-14 -left-20 h-56 w-72 rounded-[45%] bg-[#75CDBD]" />
      <div className="pointer-events-none absolute -bottom-20 left-28 h-40 w-64 rounded-[45%] bg-[#82D3C2]" />
      <div className="pointer-events-none absolute -right-16 bottom-2 h-36 w-36 rounded-full bg-[#FFF5D7]" />
      <div className="pointer-events-none absolute left-8 top-40 text-5xl text-[#FFD35B]">✦</div>
      <div className="pointer-events-none absolute right-11 top-72 text-4xl text-[#FF914D]">★</div>
      <div className="pointer-events-none absolute left-16 top-52 text-4xl text-[#8BDDD0]">✦</div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[430px] flex-col justify-center">
        <div className="text-center">
          <img
            alt="오늘도 해냄 수학 미션 체크"
            className="mx-auto w-full max-w-[430px] object-contain"
            src="/today-haenaem-hero.png"
          />
        </div>

        <section className="mt-10 rounded-[2.4rem] bg-white/95 p-7 shadow-[0_22px_55px_rgba(11,32,58,0.13)] backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚑</span>
            <h2 className="text-3xl font-black tracking-tight text-[#07143A]">오늘 미션 확인하기</h2>
          </div>
          <p className="mt-4 text-lg font-bold leading-relaxed text-[#667085]">
            전화번호만 입력하면 내 진도표로 바로 이동해요.
          </p>

          <div className="my-7 border-t-2 border-dashed border-[#CDEFE8]" />

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-3 block text-lg font-black text-[#07143A]">휴대폰 번호</label>
              <div className="flex items-center gap-3 rounded-3xl border-2 border-[#D9DEE8] bg-white px-5 py-4">
                <span className="text-2xl text-[#AEB6C4]">♧</span>
                <input
                  className="min-w-0 flex-1 bg-transparent text-xl font-bold text-[#07143A] outline-none placeholder:text-[#B7BEC9]"
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="01012345678"
                  type="tel"
                  value={phone}
                />
              </div>
            </div>

            {error ? (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{error}</p>
            ) : null}

            <button
              className="relative w-full rounded-[1.7rem] bg-[#FF7417] py-5 text-2xl font-black text-white shadow-[0_8px_0_#E85D00,0_18px_28px_rgba(255,116,23,0.28)] transition hover:translate-y-0.5 hover:shadow-[0_6px_0_#E85D00,0_14px_24px_rgba(255,116,23,0.24)] disabled:opacity-60"
              disabled={loading || !phone}
              type="submit"
            >
              {loading ? "확인 중..." : "오늘도 해내러 가기"}
              <span className="absolute right-10 top-1/2 -translate-y-1/2 text-2xl">✧</span>
            </button>
          </form>

          <div className="mt-8 flex items-center justify-center gap-3 text-lg font-bold text-[#667085]">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFE9A8] text-2xl">
              🌱
            </span>
            <span>이게 되네? 오늘도 클리어 ✨</span>
          </div>
        </section>

        <div className="relative mt-9 min-h-[120px]">
          <div className="absolute left-0 top-6 rotate-[-7deg] rounded-xl bg-[#FFF7DC] px-6 py-5 text-[#07143A] shadow-[0_8px_22px_rgba(11,32,58,0.12)]">
            <p className="text-sm font-black">오늘의 나,</p>
            <p className="mt-2 text-sm font-black">
              어제보다 <span className="text-[#FF7417]">1%</span> 성장!
            </p>
          </div>
          <div className="absolute right-0 top-0 rounded-[50%] border-4 border-[#D9DEE8] bg-white px-5 py-3 text-xl font-black text-[#07143A]">
            파이팅!
          </div>
        </div>

        <div className="pb-2 text-center">
          <Link className="text-xs font-bold text-[#8EA19A] transition hover:text-[#07143A]" href="/admin/login">
            관리자이신가요?
          </Link>
        </div>
      </div>
    </main>
  );
}
