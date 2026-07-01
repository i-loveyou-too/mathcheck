"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { Header } from "@/components/header";
import { ProgressBar } from "@/components/progress-bar";
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
    if (!subject) return "과목 정보를 불러오는 중입니다.";
    return `${subject.completed_tasks} / ${subject.total_tasks} 완료`;
  }, [subject]);

  return (
    <ScreenShell withBottomNav>
      <Header backHref="/student" logoutType="student" subtitle={helper} title={subject?.name ?? "과목 상세"} />

      {/* Subject progress card */}
      <div className="rounded-3xl bg-[#EEF2FF] p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#818CF8]">과목 전체 진도</p>
        <p className="mt-2 text-4xl font-black tracking-tight text-gray-900">
          {subject ? `${Math.round(subject.progress_percentage)}%` : "0%"}
        </p>
        <p className="mt-1 text-sm text-gray-500">단원 카드를 눌러 체크리스트로 이동해요.</p>
        <div className="mt-4">
          <ProgressBar tone="blue" value={subject?.progress_percentage ?? 0} />
        </div>
      </div>

      {/* Units */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-gray-900">단원 목록</h2>
        <div className="space-y-3">
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
        </div>
      </div>

      <StudentBottomNav />
    </ScreenShell>
  );
}
