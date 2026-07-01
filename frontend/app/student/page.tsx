"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { SubjectCard } from "@/components/subject-card";
import { apiFetch } from "@/lib/api";
import { clearStudent, getStudent } from "@/lib/storage";
import { StudentSummary } from "@/lib/types";

const studentSubjectCards = [
  { id: 0, name: "수1", href: "/student/subjects/su1" },
  { id: 1, name: "수2", href: "/student/subjects/su2" },
  { id: 2, name: "확률과 통계", href: "/student/subjects/probability" },
];

const examMessages = [
  "9모는 너의 날이야.",
  "오늘 체크 하나가 9모 점수를 만든다.",
  "조금씩 쌓이면 진짜 달라진다.",
  "오늘도 해내면 충분해.",
  "완벽 말고 체크부터 가자.",
  "9모까지 차근차근, 결국 네가 이긴다.",
  "오늘도 해냄. 이게 진짜 실력 된다.",
  "작게 해도 괜찮아. 대신 오늘도 이어가자.",
];

function getDdayInfo(targetDateString: string) {
  const [year, month, day] = targetDateString.split("-").map(Number);
  const today = new Date();
  const target = new Date(year, month - 1, day);

  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetLocal = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  const diffMs = targetLocal.getTime() - todayLocal.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let label = "";
  if (daysRemaining > 0) label = `D-${daysRemaining}`;
  else if (daysRemaining === 0) label = "D-DAY";
  else label = "종료";

  return { daysRemaining, label };
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    const load = async () => {
      try {
        const summaryData = await apiFetch<StudentSummary>(`/students/${student.id}/summary`);
        setSummary(summaryData);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const subjectCards = studentSubjectCards.map((subject) => {
    const matched = summary?.subjects.find((item) => item.name === subject.name);
    return {
      id: subject.id,
      name: subject.name,
      href: subject.href,
      progressPercentage: matched?.progress_percentage ?? 0,
    };
  });

  const completedTasks = summary?.completed_tasks ?? 0;
  const totalTasks = summary?.total_tasks ?? 0;
  const remainingTasks = totalTasks - completedTasks;
  const progressPct = summary ? Math.round(summary.progress_percentage) : 0;
  const ddayInfo = getDdayInfo("2026-09-02");
  const examMessage = examMessages[Math.abs(ddayInfo.daysRemaining) % examMessages.length];

  const handleLogout = () => {
    clearStudent();
    router.push("/login");
  };

  return (
    <ScreenShell withBottomNav>
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          {loading ? (
            <p className="h-4 w-24 animate-pulse rounded bg-gray-200" />
          ) : (
            <p className="text-sm font-medium text-gray-400">{summary?.grade ?? ""}</p>
          )}
          <h1 className="mt-1 text-2xl font-black tracking-tight text-gray-900">
            {summary ? `안녕하세요, ${summary.name}님` : "대시보드"}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">오늘의 진도를 체크해볼까요?</p>
        </div>
        <button
          className="shrink-0 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-200"
          onClick={handleLogout}
          type="button"
        >
          로그아웃
        </button>
      </div>

      <section className="rounded-3xl bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-gray-500">9월 모의고사까지</p>
            <p className="mt-1 text-xs font-medium text-gray-400">2026년 9월 2일 시행</p>
          </div>
          <div className="rounded-2xl bg-[#0F172A] px-4 py-3 text-right text-white">
            <p className="text-xs font-semibold text-white/50">D-DAY</p>
            <p className="mt-1 text-3xl font-black tracking-tight">{ddayInfo.label}</p>
          </div>
        </div>
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-800">
          {examMessage}
        </p>
      </section>

      <div className="rounded-3xl bg-[#0F172A] p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/40">전체 진도</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-5xl font-black tracking-tight">{progressPct}%</p>
            <p className="mt-2 text-sm text-white/50">
              {completedTasks}개 완료 &middot; {remainingTasks}개 남음
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
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-xs text-gray-400">전체 문제</p>
          <p className="mt-1.5 text-2xl font-black tracking-tight text-gray-900">{totalTasks}개</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-xs text-gray-400">완료한 문제</p>
          <p className="mt-1.5 text-2xl font-black tracking-tight text-emerald-600">
            {completedTasks}개
          </p>
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">교재별 진도</h2>
          {loading ? (
            <span className="text-xs text-gray-400">불러오는 중...</span>
          ) : (
            <span className="text-xs text-gray-400">{subjectCards.length}개 과목</span>
          )}
        </div>
        <div className="space-y-4">
          {subjectCards.map((subject) => (
            <SubjectCard
              id={subject.id}
              href={subject.href}
              key={subject.id}
              name={subject.name}
              progressPercentage={subject.progressPercentage}
            />
          ))}
        </div>
      </div>

      <StudentBottomNav />
    </ScreenShell>
  );
}
