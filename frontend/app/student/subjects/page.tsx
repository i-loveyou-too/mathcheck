"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { STUDENT_PAGE_TITLES } from "@/lib/student-page-titles";
import { StudentDashboardProgressSummary } from "@/lib/types";

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zM16.2 13h2.8v6h-2.8v-6z" />
    </svg>
  );
}

function CircularProgress({
  value,
  ringColor,
  trackColor,
}: {
  value: number;
  ringColor: string;
  trackColor: string;
}) {
  const r = 15.9;
  const circ = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, value)) / 100) * circ;

  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke={trackColor} strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth="2.5"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] font-black text-[#17213B]">{Math.round(value)}%</span>
      </div>
    </div>
  );
}

const subjectConfigs = [
  {
    title: "수1",
    description: "지수로그, 삼각함수, 수열 교재 진도를 확인해요.",
    href: "/student/subjects/su1",
    subjectKeys: ["수1"],
    iconBg: "bg-indigo-50",
    iconContent: <span className="text-sm font-black text-indigo-400">√x</span>,
    ringColor: "#6366F1",
    trackColor: "#EEF2FF",
    barColor: "bg-indigo-400",
    barTrack: "bg-indigo-50",
  },
  {
    title: "수2",
    description: "수2 교재 목록을 확인해요.",
    href: "/student/subjects/su2",
    subjectKeys: ["수2"],
    iconBg: "bg-violet-50",
    iconContent: <span className="text-sm font-black text-violet-400">x²</span>,
    ringColor: "#8B5CF6",
    trackColor: "#F5F3FF",
    barColor: "bg-violet-400",
    barTrack: "bg-violet-50",
  },
  {
    title: "확률과 통계",
    description: "경우의 수 교재 진도를 확인해요.",
    href: "/student/subjects/probability",
    subjectKeys: ["확률과 통계"],
    iconBg: "bg-emerald-50",
    iconContent: <BarChartIcon className="h-5 w-5 text-emerald-500" />,
    ringColor: "#10B981",
    trackColor: "#D1FAE5",
    barColor: "bg-emerald-400",
    barTrack: "bg-emerald-50",
  },
];

export default function StudentSubjectsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<StudentDashboardProgressSummary | null>(null);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    apiFetch<StudentDashboardProgressSummary>(
      `/student/progress-summary?student_id=${student.id}`
    )
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [router]);

  return (
    <ScreenShell withBottomNav>
      <Header
        logoutType="student"
        subtitle="수1, 수2, 확률과 통계 교재를 선택해서 진도를 확인해요."
        title={STUDENT_PAGE_TITLES.subjects}
      />

      <div className="space-y-3">
        {subjectConfigs.map((subject) => {
          const prog = summary?.subjects.find((s) => subject.subjectKeys.includes(s.subject));
          const rate = Math.round(prog?.progress_rate ?? 0);
          const done = prog?.done ?? 0;
          const total = prog?.total ?? 0;

          return (
            <Link
              className="block rounded-3xl bg-white p-5 shadow-card transition hover:-translate-y-0.5"
              href={subject.href}
              key={subject.href}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${subject.iconBg}`}
                >
                  {subject.iconContent}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-black text-[#17213B]">{subject.title}</h2>
                  <p className="mt-0.5 text-xs font-medium leading-relaxed text-gray-400">
                    {subject.description}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <CircularProgress
                    value={rate}
                    ringColor={subject.ringColor}
                    trackColor={subject.trackColor}
                  />
                  {total > 0 ? (
                    <p className="text-[10px] font-bold text-gray-400">
                      {done} / {total}문항
                    </p>
                  ) : null}
                </div>
                <span className="mt-1 shrink-0 text-xl font-bold text-gray-300">›</span>
              </div>
              <div className={`mt-4 h-1.5 overflow-hidden rounded-full ${subject.barTrack}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${subject.barColor}`}
                  style={{ width: `${rate}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl bg-indigo-50 px-4 py-3.5">
        <span className="shrink-0 text-base">ℹ️</span>
        <p className="text-xs font-medium leading-relaxed text-indigo-400">
          교재를 선택하면 문제별 진도와 정답률을 자세히 확인할 수 있어요.
        </p>
      </div>

      <StudentBottomNav />
    </ScreenShell>
  );
}
