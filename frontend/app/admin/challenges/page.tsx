"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { getAdmin } from "@/lib/storage";

const sections = [
  {
    title: "영단어",
    description: "영단어 챌린지 배정, 워드뱅크, 오답 검토를 관리합니다.",
    links: [
      { href: "/admin/vocabulary-challenges", label: "영단어 관리", description: "학생별 영단어 챌린지 생성, 완료, 상세 확인" },
      { href: "/admin/vocabulary-banks", label: "워드뱅크", description: "단어장 등록과 Day별 단어 관리" },
      { href: "/admin/vocabulary-review", label: "오답 통합 검토", description: "학생별 오답 판정을 한 화면에서 처리" },
    ],
  },
  {
    title: "수능특강 / 수능완성",
    description: "수특 10일 챌린지와 관련 학습 흐름을 관리합니다.",
    links: [
      { href: "/admin/suteuk-challenges", label: "수능특강", description: "학생별 10일 챌린지 배정, 진행률, 쉬는날 관리" },
    ],
  },
  {
    title: "스프린트",
    description: "단기 집중 학습을 위한 스프린트 운영 메뉴입니다.",
    links: [
      { href: "/admin/sprints", label: "스프린트 관리", description: "스프린트 생성과 학생별 진행 관리" },
    ],
  },
] as const;

export default function AdminChallengesPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-[#F8F8F8] px-5 pb-32 pt-8 text-[#111111]">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6">
        <section className="rounded-[1.5rem] bg-white p-6 shadow-soft">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#E13D3D]">Admin</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black">챌린지 관리</h1>
              <p className="mt-2 text-sm font-bold text-slate-500">챌린지 관련 메뉴를 한 곳에서 선택합니다.</p>
            </div>
            <Link href="/admin" className="w-fit rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">
              대시보드
            </Link>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          {sections.map((section) => (
            <section key={section.title} className="rounded-[1.25rem] bg-white p-5 shadow-soft">
              <h2 className="text-xl font-black">{section.title}</h2>
              <p className="mt-2 min-h-[40px] text-sm font-bold leading-5 text-slate-500">{section.description}</p>
              <div className="mt-5 flex flex-col gap-3">
                {section.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-[#E13D3D] hover:bg-red-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-900">{link.label}</span>
                      <span className="text-lg font-black text-[#E13D3D]">→</span>
                    </div>
                    <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{link.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
