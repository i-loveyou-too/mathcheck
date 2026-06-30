"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StatCard } from "@/components/stat-card";
import { StudentCard } from "@/components/student-card";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { AdminStudentProgress, AdminStudentSummary, StudentCardSubjectProgress } from "@/lib/types";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [subjectMap, setSubjectMap] = useState<Record<number, StudentCardSubjectProgress[]>>({});

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }

    const load = async () => {
      const data = await apiFetch<AdminStudentSummary[]>("/admin/students");
      setStudents(data);

      const detailEntries = await Promise.all(
        data.map(async (student) => {
          const detail = await apiFetch<AdminStudentProgress>(`/admin/students/${student.id}/progress`);
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
    };

    void load();
  }, [router]);

  const averageProgress = useMemo(() => {
    if (students.length === 0) {
      return "0%";
    }

    const total = students.reduce((sum, student) => sum + student.progress_percentage, 0);
    return `${Math.round(total / students.length)}%`;
  }, [students]);

  return (
    <ScreenShell withBottomNav>
      <Header logoutType="admin" subtitle="학생들의 현재 학습 온도를 살펴보세요" title="관리자 대시보드" />

      <div className="grid grid-cols-2 gap-4">
        <StatCard helper="등록 학생 수" label="학생 수" value={`${students.length}명`} />
        <StatCard helper="전체 평균 진도" label="평균 진도" value={averageProgress} />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-brand-deep">학생별 진도</h2>
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
      </section>

      <BottomNav items={[{ href: "/admin", label: "관리 홈" }, { href: "/admin/login", label: "관리자 로그인" }]} />
    </ScreenShell>
  );
}
