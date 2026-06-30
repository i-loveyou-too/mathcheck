"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StatCard } from "@/components/stat-card";
import { SubjectCard } from "@/components/subject-card";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { StudentSummary, SubjectWithUnits } from "@/lib/types";

export default function StudentDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [subjects, setSubjects] = useState<SubjectWithUnits[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    const load = async () => {
      try {
        const [subjectData, summaryData] = await Promise.all([
          apiFetch<SubjectWithUnits[]>("/subjects"),
          apiFetch<StudentSummary>(`/students/${student.id}/summary`),
        ]);
        setSubjects(subjectData);
        setSummary(summaryData);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const subjectCards = subjects.map((subject) => {
    const matched = summary?.subjects.find((item) => item.id === subject.id);
    return {
      id: subject.id,
      name: subject.name,
      progressPercentage: matched?.progress_percentage ?? 0,
    };
  });

  return (
    <ScreenShell withBottomNav>
      <Header
        logoutType="student"
        subtitle="오늘도 9월 모평을 향해 한 걸음씩"
        title={summary ? `${summary.name} 학생, 반가워요` : "학생 대시보드"}
      />

      <section className="rounded-[2rem] bg-brand-navy p-6 text-white shadow-card">
        <p className="text-sm text-white/70">전체 진도</p>
        <p className="mt-2 text-4xl font-bold">{summary ? Math.round(summary.progress_percentage) : 0}%</p>
        <p className="mt-3 text-sm text-white/80">
          {summary
            ? `${summary.completed_tasks}개를 완료했고 ${summary.total_tasks - summary.completed_tasks}개가 남았어요.`
            : "진도 정보를 불러오는 중입니다."}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <StatCard
          helper={summary?.grade ?? "학년 정보"}
          label="학습자"
          value={summary?.name ?? "불러오는 중"}
        />
        <StatCard
          helper="완료한 체크리스트"
          label="완료 개수"
          value={summary ? `${summary.completed_tasks}` : "0"}
        />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-deep">과목별 진도</h2>
          {loading ? <span className="text-sm text-brand-muted">불러오는 중...</span> : null}
        </div>

        {subjectCards.map((subject) => (
          <SubjectCard
            id={subject.id}
            key={subject.id}
            name={subject.name}
            progressPercentage={subject.progressPercentage}
          />
        ))}
      </section>

      <BottomNav items={[{ href: "/student", label: "홈" }, { href: "/login", label: "학생 로그인" }]} />
    </ScreenShell>
  );
}
