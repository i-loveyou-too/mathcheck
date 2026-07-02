"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { ScreenShell } from "@/components/screen-shell";
import { StudentCard } from "@/components/student-card";
import { apiFetch } from "@/lib/api";
import { AdminStudentCardProgress, loadAdminStudentCardProgress } from "@/lib/admin-student-progress";
import { getAdmin } from "@/lib/storage";
import { AdminStudentSummary } from "@/lib/types";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [cardProgressMap, setCardProgressMap] = useState<Record<number, AdminStudentCardProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }

    const load = async () => {
      try {
        const data = await apiFetch<AdminStudentSummary[]>("/admin/students");
        const progressMap = await loadAdminStudentCardProgress(data.map((student) => student.id));

        setStudents(
          data.map((student) => ({
            ...student,
            progress_percentage: progressMap[student.id]?.progressPercentage ?? 0,
          }))
        );
        setCardProgressMap(progressMap);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const averageProgress = useMemo(() => {
    if (students.length === 0) return 0;
    const total = students.reduce((sum, student) => sum + student.progress_percentage, 0);
    return Math.round(total / students.length);
  }, [students]);

  return (
    <ScreenShell withBottomNav>
      {/* Header */}
      <div className="pt-1">
        <p className="text-sm font-medium text-gray-400">관리자</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-gray-900">학생 진도 현황</h1>
        <p className="mt-0.5 text-sm text-gray-500">학생들의 학습 흐름을 한눈에 살펴보세요.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[#0F172A] p-4 text-white">
          <p className="text-xs text-white/50">등록 학생</p>
          <p className="mt-1.5 text-2xl font-black">
            {loading ? "-" : `${students.length}명`}
          </p>
        </div>
        <div className="rounded-2xl bg-[#EEF2FF] p-4">
          <p className="text-xs text-[#818CF8]">전체 평균</p>
          <p className="mt-1.5 text-2xl font-black text-[#3730A3]">
            {loading ? "-" : `${averageProgress}%`}
          </p>
        </div>
      </div>

      <Link
        className="block rounded-2xl bg-white p-4 shadow-card transition hover:-translate-y-0.5"
        href="/admin/daily-tasks"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[#818CF8]">해냄리스트</p>
            <h2 className="mt-1 text-lg font-black text-gray-900">숙제 배정</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">
              학생별 날짜와 교재 범위를 선택해 등록해요.
            </p>
          </div>
          <span className="text-2xl font-bold text-gray-300">›</span>
        </div>
      </Link>

      <Link
        className="block rounded-2xl bg-white p-4 shadow-card transition hover:-translate-y-0.5"
        href="/admin/textbooks-management"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[#818CF8]">교재 관리</p>
            <h2 className="mt-1 text-lg font-black text-gray-900">교재 등록</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">
              교재와 문항을 등록하고 목록을 관리해요.
            </p>
          </div>
          <span className="text-2xl font-bold text-gray-300">›</span>
        </div>
      </Link>

      {/* Student list */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">학생별 진도</h2>
          {loading ? (
            <span className="text-xs text-gray-400">불러오는 중...</span>
          ) : null}
        </div>
        <div className="space-y-3">
          {students.map((student) => (
            <StudentCard
              grade={student.grade}
              id={student.id}
              key={student.id}
              name={student.name}
              progressPercentage={student.progress_percentage}
              subjects={cardProgressMap[student.id]?.subjects}
            />
          ))}
        </div>
      </div>

      <AdminBottomNav />
    </ScreenShell>
  );
}
