"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { getStudent } from "@/lib/storage";

export default function StudentMyProgressPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getStudent()) {
      router.push("/login");
    }
  }, [router]);

  return (
    <ScreenShell withBottomNav>
      <Header logoutType="student" subtitle="매일 해낸 기록이 나의 루틴이 돼요." title="갓생챌린지" />

      <section className="rounded-2xl bg-white p-6 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-2xl font-black text-[#3730A3]">
          %
        </div>
        <h2 className="mt-4 text-lg font-black text-[#17213B]">아직 준비중입니다.</h2>
        <p className="mt-2 text-sm font-medium leading-relaxed text-[#98A1B3]">
          체크한 문제와 질문 표시를 모아서 더 자세한 진도 흐름을 보여줄 예정이에요.
        </p>
      </section>

      <StudentBottomNav />
    </ScreenShell>
  );
}
