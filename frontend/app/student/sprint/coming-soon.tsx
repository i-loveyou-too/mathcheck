"use client";

import Link from "next/link";
import { ScreenShell } from "@/components/screen-shell";

export function SprintComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href="/student/sprint" className="text-sm font-black text-[#2874E8]">← SPRINT 홈</Link>
        <section className="mt-8 rounded-[28px] bg-white/95 p-7 text-center shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF5FF] text-2xl font-black text-[#2E7BEA]">S</div>
          <h1 className="mt-5 text-2xl font-black tracking-[-0.04em] text-[#10213D]">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#6E7F99]">{description}</p>
          <Link href="/student/sprint" className="mt-6 inline-flex rounded-2xl bg-[#2874E8] px-5 py-3 text-sm font-black text-white">홈으로 돌아가기</Link>
        </section>
      </div>
    </ScreenShell>
  );
}
