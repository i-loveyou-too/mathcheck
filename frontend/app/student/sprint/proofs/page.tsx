"use client";

import Link from "next/link";
import { ScreenShell } from "@/components/screen-shell";

export default function SprintProofsPage() {
  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href="/student/sprint" className="text-sm font-black text-[#2874E8]">← SPRINT 홈</Link>
        <h1 className="mt-6 text-3xl font-black tracking-[-0.05em] text-[#10213D]">인증 내역</h1>
        <div className="mt-5 grid gap-4">
          <Link href="/student/sprint/seat-check" className="rounded-[24px] bg-white/95 p-5 shadow-[0_14px_30px_rgba(49,89,130,0.14)] ring-1 ring-[#DCEBFA]">
            <p className="font-black text-[#10213D]">착석 인증</p>
            <p className="mt-1 text-sm font-semibold text-[#6E7F99]">오늘 착석 인증 제출 화면으로 이동합니다.</p>
          </Link>
          <Link href="/student/sprint/planner" className="rounded-[24px] bg-white/95 p-5 shadow-[0_14px_30px_rgba(49,89,130,0.14)] ring-1 ring-[#DCEBFA]">
            <p className="font-black text-[#10213D]">플래너 인증</p>
            <p className="mt-1 text-sm font-semibold text-[#6E7F99]">오늘 플래너 인증 제출 화면으로 이동합니다.</p>
          </Link>
          <Link href="/student/sprint/study-time" className="rounded-[24px] bg-white/95 p-5 shadow-[0_14px_30px_rgba(49,89,130,0.14)] ring-1 ring-[#DCEBFA]">
            <p className="font-black text-[#10213D]">공부시간 인증</p>
            <p className="mt-1 text-sm font-semibold text-[#6E7F99]">오늘 공부시간 인증 제출 화면으로 이동합니다.</p>
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
