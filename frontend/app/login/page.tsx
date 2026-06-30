"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
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
    <ScreenShell>
      <section className="rounded-[2rem] bg-brand-navy p-6 text-white shadow-card">
        <p className="text-sm text-white/70">9월 모평 대비</p>
        <h1 className="mt-2 text-3xl font-bold">수학체크</h1>
        <p className="mt-3 text-sm leading-6 text-white/80">
          휴대폰 번호로 로그인하고 오늘의 수학 진도를 가볍게 이어가세요.
        </p>
      </section>

      <form className="rounded-4xl border border-brand-border bg-white p-6 shadow-card" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-brand-deep">휴대폰 번호</span>
          <input
            className="mt-3 w-full rounded-2xl border border-brand-border bg-brand-bg px-4 py-4 text-base outline-none ring-0 transition focus:border-brand-yellow"
            onChange={(event) => setPhone(event.target.value)}
            placeholder="01011112222"
            value={phone}
          />
        </label>

        {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

        <button
          className="mt-6 w-full rounded-full bg-brand-yellow px-5 py-4 text-base font-bold text-brand-navy transition hover:brightness-95"
          disabled={loading}
          type="submit"
        >
          {loading ? "로그인 중..." : "학생 로그인"}
        </button>
      </form>
    </ScreenShell>
  );
}
