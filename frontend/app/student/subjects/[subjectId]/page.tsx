"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { UnitCard } from "@/components/unit-card";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { StudentSummary, SubjectStatus } from "@/lib/types";

export default function SubjectDetailPage() {
  const params = useParams<{ subjectId: string }>();
  const router = useRouter();
  const [subject, setSubject] = useState<SubjectStatus | null>(null);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    const load = async () => {
      const summary = await apiFetch<StudentSummary>(`/students/${student.id}/summary`);
      const selected = summary.subjects.find((item) => item.id === Number(params.subjectId)) ?? null;
      setSubject(selected);
    };

    void load();
  }, [params.subjectId, router]);

  const helper = useMemo(() => {
    if (!subject) {
      return "과목 정보를 불러오는 중입니다.";
    }

    return `${subject.completed_tasks} / ${subject.total_tasks} 완료`;
  }, [subject]);

  return (
    <ScreenShell withBottomNav>
      <Header backHref="/student" logoutType="student" subtitle={helper} title={subject?.name ?? "과목 상세"} />

      <section className="rounded-[2rem] bg-white p-5 shadow-card">
        <p className="text-sm text-brand-muted">과목 전체 진도</p>
        <p className="mt-2 text-3xl font-bold text-brand-deep">
          {subject ? `${Math.round(subject.progress_percentage)}%` : "0%"}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-brand-deep">단원 체크</h2>
        {subject?.units.map((unit) => (
          <UnitCard
            completedTasks={unit.completed_tasks}
            id={unit.id}
            key={unit.id}
            name={unit.name}
            progressPercentage={unit.progress_percentage}
            totalTasks={unit.total_tasks}
          />
        ))}
      </section>

      <BottomNav items={[{ href: "/student", label: "홈" }, { href: "/login", label: "학생 로그인" }]} />
    </ScreenShell>
  );
}
