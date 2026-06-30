"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { Header } from "@/components/header";
import { ProgressBar } from "@/components/progress-bar";
import { ScreenShell } from "@/components/screen-shell";
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
      const data = await apiFetch<AdminStudentProgress>(
        `/admin/students/${params.studentId}/progress`
      );
      setSummary(data);
    };

    void load();
  }, [params.studentId, router]);

  const progressRounded = Math.round(summary?.progress_percentage ?? 0);

  return (
    <ScreenShell withBottomNav>
      <Header
        backHref="/admin"
        logoutType="admin"
        subtitle={summary ? `${summary.grade} · 총 ${summary.completed_tasks}개 완료` : "학생 상세 진도"}
        title={summary ? `${summary.name} 학생` : "학생 상세"}
      />

      {/* Student overview card */}
      <div className="rounded-3xl bg-[#0F172A] p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/40">전체 진도</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-5xl font-black tracking-tight">{progressRounded}%</p>
            <p className="mt-2 text-sm text-white/50">
              {summary?.completed_tasks ?? 0}개 완료 &middot; {(summary?.total_tasks ?? 0) - (summary?.completed_tasks ?? 0)}개 남음
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-center">
            <p className="text-xs text-white/40">학년</p>
            <p className="mt-1 text-lg font-bold">{summary?.grade ?? "-"}</p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#FACC15] transition-all duration-700"
            style={{ width: `${progressRounded}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-xs text-gray-400">전체 문제</p>
          <p className="mt-1.5 text-2xl font-black tracking-tight text-gray-900">
            {summary?.total_tasks ?? 0}개
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-xs text-gray-400">완료 문제</p>
          <p className="mt-1.5 text-2xl font-black tracking-tight text-emerald-600">
            {summary?.completed_tasks ?? 0}개
          </p>
        </div>
      </div>

      {/* Subject breakdown */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-gray-900">과목별 상세 진도</h2>
        <div className="space-y-4">
          {summary?.subjects.map((subject) => (
            <div className="rounded-3xl bg-white p-5 shadow-card" key={subject.id}>
              {/* Subject header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900">{subject.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {subject.completed_tasks} / {subject.total_tasks} 완료
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#FEF3C7] px-3 py-1 text-sm font-bold text-[#92400E]">
                  {Math.round(subject.progress_percentage)}%
                </span>
              </div>

              <div className="mt-3">
                <ProgressBar value={subject.progress_percentage} />
              </div>

              {/* Units */}
              <div className="mt-4 space-y-3">
                {subject.units.map((unit) => (
                  <div className="rounded-2xl bg-gray-50 p-4" key={unit.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-800">{unit.name}</p>
                      <span className="text-xs font-medium text-gray-500">
                        {unit.completed_tasks}/{unit.total_tasks}
                      </span>
                    </div>

                    {/* Tasks */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {unit.tasks.map((task) => (
                        <span
                          key={task.id}
                          className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                            task.is_done
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-white text-gray-500 ring-1 ring-gray-200"
                          }`}
                        >
                          {task.is_done ? "○ " : ""}
                          {task.title}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AdminBottomNav />
    </ScreenShell>
  );
}
