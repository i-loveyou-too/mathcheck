"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { getStudent } from "@/lib/storage";
import { STUDENT_PAGE_TITLES } from "@/lib/student-page-titles";

const subjectLinks = [
  {
    title: "수1",
    description: "지수로그, 삼각함수, 수열 교재 진도를 확인해요.",
    href: "/student/subjects/su1",
  },
  {
    title: "수2",
    description: "수2 교재 목록을 확인해요.",
    href: "/student/subjects/su2",
  },
  {
    title: "확률과 통계",
    description: "경우의 수 교재 진도를 확인해요.",
    href: "/student/subjects/probability",
  },
];

export default function StudentSubjectsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getStudent()) {
      router.push("/login");
    }
  }, [router]);

  return (
    <ScreenShell withBottomNav>
      <Header
        logoutType="student"
        subtitle="수1, 수2, 확률과 통계 교재를 선택해서 진도를 확인해요."
        title={STUDENT_PAGE_TITLES.subjects}
      />

      <div className="space-y-3">
        {subjectLinks.map((subject) => (
          <Link
            className="block rounded-2xl bg-white p-4 shadow-card transition hover:-translate-y-0.5"
            href={subject.href}
            key={subject.href}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-[#17213B]">{subject.title}</h2>
                <p className="mt-1 text-sm font-medium leading-relaxed text-[#98A1B3]">
                  {subject.description}
                </p>
              </div>
              <span className="shrink-0 text-2xl font-bold text-[#98A1B3]">›</span>
            </div>
          </Link>
        ))}
      </div>

      <StudentBottomNav />
    </ScreenShell>
  );
}
