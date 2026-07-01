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
  const progressPct = summary ? Math.round(summary.progress_percentage) : 0;
  const remainingTasks = Math.max(totalTasks - completedTasks, 0);
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
          <h1 className="text-2xl font-black tracking-tight text-[#17213B]">
            {summary ? `안녕하세요, ${summary.name}님` : "안녕하세요"}
          </h1>
          <p className="mt-2 text-sm font-medium text-[#98A1B3]">오늘도 한 걸음씩 함께해요.</p>
        </div>
        <button
          aria-label="로그아웃"
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#17213B] shadow-card transition hover:bg-gray-50"
          onClick={handleLogout}
          type="button"
        >
          <span className="text-lg">⌂</span>
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
        </button>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-[#F7F8FF] p-5 shadow-card">
        <div className="pointer-events-none absolute right-4 top-4 h-24 w-24 rounded-full bg-white/60" />
        <div className="pointer-events-none absolute bottom-9 right-28 h-5 w-16 rounded-full bg-white/70" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black text-[#17213B]">9월 모의고사까지</p>
            <p className="mt-1 text-sm font-bold text-indigo-400">2026년 9월 2일 시행</p>
            <p className="mt-5 max-w-[11rem] text-sm font-bold leading-relaxed text-[#17213B]">
              {examMessage}
            </p>
          </div>

          <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-indigo-200/80 p-1.5 shadow-[0_14px_32px_rgba(79,70,229,0.22)]">
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#111A35] text-white">
              <p className="text-xs font-bold text-white/45">D-DAY</p>
              <p className="mt-1 text-4xl font-black tracking-tight">{ddayInfo.label}</p>
            </div>
          </div>
        </div>

        <div className="relative mt-5 flex items-center justify-between rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#8A94A8] shadow-sm">
          <span>목표까지 꾸준히, 우리 충분히 잘하고 있어요!</span>
          <span className="text-lg text-[#98A1B3]">›</span>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-[#17213B]">전체 학습 요약</h2>
          <span className="text-xs font-semibold text-[#98A1B3]">이번 주 기준</span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-500">
              <span className="text-lg font-black">✓</span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#98A1B3]">완료한 문제</p>
            <p className="mt-1 text-2xl font-black text-[#17213B]">{completedTasks}</p>
            <p className="text-xs font-medium text-[#98A1B3]">/ {totalTasks}문제</p>
          </div>

          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <span className="text-lg font-black">◎</span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#98A1B3]">학습 진도</p>
            <p className="mt-1 text-2xl font-black text-[#17213B]">{progressPct}%</p>
            <p className="text-xs font-medium text-[#98A1B3]">목표 70%</p>
          </div>

          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-500">
              <span className="text-lg font-black">▲</span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#98A1B3]">남은 문제</p>
            <p className="mt-1 text-2xl font-black text-[#17213B]">{remainingTasks}</p>
            <p className="text-xs font-medium text-[#98A1B3]">오늘도 하나씩</p>
          </div>
        </div>
      </section>

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
