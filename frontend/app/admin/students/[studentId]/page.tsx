"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { Header } from "@/components/header";
import { ProgressBar } from "@/components/progress-bar";
import { ScreenShell } from "@/components/screen-shell";
import { StatCard } from "@/components/stat-card";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { AdminStudentProgress } from "@/lib/types";

export default function AdminStudentDetailPage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<AdminStudentProgress | null>(null);

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }

    const load = async () => {
      const data = await apiFetch<AdminStudentProgress>(`/admin/students/${params.studentId}/progress`);
      setSummary(data);
    };

    void load();
  }, [params.studentId, router]);

  return (
    <ScreenShell withBottomNav>
      <Header
        backHref="/admin"
        logoutType="admin"
        subtitle={summary ? `${summary.grade} · 총 ${summary.completed_tasks}개 완료` : "학생 상세 진도"}
        title={summary ? `${summary.name} 학생 진도` : "학생 상세"}
      />

      <div className="grid grid-cols-2 gap-4">
        <StatCard helper="전체 체크리스트 기준" label="총 진도" value={`${Math.round(summary?.progress_percentage ?? 0)}%`} />
        <StatCard helper="완료한 학습 수" label="완료 수" value={`${summary?.completed_tasks ?? 0}`} />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-brand-deep">과목별 상세 진도</h2>

        {summary?.subjects.map((subject) => (
          <article className="rounded-4xl border border-brand-border bg-white p-5 shadow-card" key={subject.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-brand-deep">{subject.name}</p>
                <p className="mt-1 text-sm text-brand-muted">
                  {subject.completed_tasks} / {subject.total_tasks} 완료
                </p>
              </div>
              <span className="rounded-full bg-brand-softYellow px-3 py-1 text-sm font-semibold text-brand-navy">
                {Math.round(subject.progress_percentage)}%
              </span>
            </div>

            <div className="mt-4">
              <ProgressBar value={subject.progress_percentage} />
            </div>

            <div className="mt-5 space-y-3">
              {subject.units.map((unit) => (
                <div className="rounded-3xl bg-brand-bg p-4" key={unit.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-brand-deep">{unit.name}</p>
                    <span className="text-sm font-medium text-brand-muted">
                      {unit.completed_tasks}/{unit.total_tasks}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {unit.tasks.map((task) => (
                      <div
                        className={`rounded-2xl border px-3 py-2 text-sm ${
                          task.is_done
                            ? "border-brand-yellow bg-brand-softYellow/60 text-brand-navy"
                            : "border-brand-border bg-white text-brand-muted"
                        }`}
                        key={task.id}
                      >
                        {task.title}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <BottomNav items={[{ href: "/admin", label: "관리 홈" }, { href: "/admin/login", label: "관리자 로그인" }]} />
    </ScreenShell>
  );
}
