"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { ScreenShell } from "@/components/screen-shell";
import { StudentCard } from "@/components/student-card";
import { apiFetch } from "@/lib/api";
import { AdminStudentCardProgress, loadAdminStudentCardProgress } from "@/lib/admin-student-progress";
import { getAdmin } from "@/lib/storage";
import { AdminStudentSummary } from "@/lib/types";

export default function AdminStudentsPage() {
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

    void apiFetch<AdminStudentSummary[]>("/admin/students")
      .then(async (data) => {
        const progressMap = await loadAdminStudentCardProgress(data.map((student) => student.id));
        setStudents(
          data.map((student) => ({
            ...student,
            progress_percentage: progressMap[student.id]?.progressPercentage ?? 0,
          }))
        );
        setCardProgressMap(progressMap);
      })
      .catch(() => {
        setStudents([]);
        setCardProgressMap({});
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <ScreenShell withBottomNav>
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">관리자</p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-gray-900">학생 목록</h1>
          <p className="mt-1 text-sm text-gray-500">학생을 선택하면 상세 현황을 볼 수 있어요.</p>
        </div>
        {!loading && students.length > 0 ? (
          <span className="mt-1 shrink-0 rounded-full bg-[#0F172A] px-3 py-1.5 text-sm font-black text-white">
            {students.length}명
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div className="h-24 animate-pulse rounded-3xl bg-gray-100" key={i} />
          ))}
        </div>
      ) : students.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm font-bold text-gray-300">등록된 학생이 없습니다.</p>
        </div>
      ) : (
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
      )}

      <AdminBottomNav />
    </ScreenShell>
  );
}
