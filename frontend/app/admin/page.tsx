"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { ScreenShell } from "@/components/screen-shell";
import { StudentCard } from "@/components/student-card";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { AdminStudentProgress, AdminStudentSummary, StudentCardSubjectProgress } from "@/lib/types";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [subjectMap, setSubjectMap] = useState<Record<number, StudentCardSubjectProgress[]>>({});
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
        setStudents(data);

        const detailEntries = await Promise.all(
          data.map(async (student) => {
            const detail = await apiFetch<AdminStudentProgress>(
              `/admin/students/${student.id}/progress`
            );
            return [
              student.id,
              detail.subjects.map((subject) => ({
                id: subject.id,
                name: subject.name,
                progressPercentage: subject.progress_percentage,
              })),
            ] as const;
          })
        );

        setSubjectMap(Object.fromEntries(detailEntries));
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
              subjects={subjectMap[student.id]}
            />
          ))}
        </div>
      </div>

      <AdminBottomNav />
    </ScreenShell>
  );
}
