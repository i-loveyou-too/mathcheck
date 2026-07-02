"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { clearStudent, getStudent } from "@/lib/storage";
import { StoredStudent, StudentDashboardProgressSummary } from "@/lib/types";

type DailyTaskStatus = "todo" | "in_progress" | "done";

type DailyTask = {
  id: number;
  detail: string | null;
  status: DailyTaskStatus;
  textbook_key: string | null;
  title: string;
};

type DailyTaskSummary = {
  completion_rate: number;
  done: number;
  todo: number;
  total: number;
};

type WeeklyTaskDay = {
  date: string;
  summary: DailyTaskSummary;
  tasks: DailyTask[];
};

type WeeklyTasksResponse = {
  days: WeeklyTaskDay[];
  student_id: number;
  week_start: string;
};

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zM16.2 13h2.8v6h-2.8v-6z" />
    </svg>
  );
}

function CircularProgress({ ringColor, trackColor, value }: { value: number; ringColor: string; trackColor: string }) {
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

const studentSubjectCards = [
  {
    id: 0,
    name: "수1",
    href: "/student/subjects/su1",
    description: "지수로그, 삼각함수, 수열 교재 진도를 확인해요.",
    iconBg: "bg-indigo-50",
    iconContent: <span className="text-sm font-black text-indigo-400">√x</span>,
    ringColor: "#6366F1",
    trackColor: "#EEF2FF",
    barColor: "bg-indigo-400",
    barTrack: "bg-indigo-50",
  },
  {
    id: 1,
    name: "수2",
    href: "/student/subjects/su2",
    description: "수2 교재 목록을 확인해요.",
    iconBg: "bg-violet-50",
    iconContent: <span className="text-sm font-black text-violet-400">x²</span>,
    ringColor: "#8B5CF6",
    trackColor: "#F5F3FF",
    barColor: "bg-violet-400",
    barTrack: "bg-violet-50",
  },
  {
    id: 2,
    name: "확률과 통계",
    href: "/student/subjects/probability",
    description: "경우의 수 교재 진도를 확인해요.",
    iconBg: "bg-emerald-50",
    iconContent: <BarChartIcon className="h-5 w-5 text-emerald-500" />,
    ringColor: "#10B981",
    trackColor: "#D1FAE5",
    barColor: "bg-emerald-400",
    barTrack: "bg-emerald-50",
  },
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

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getLocalWeekStart(date: Date) {
  const localDate = startOfLocalDay(date);
  const day = localDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(localDate);
  monday.setDate(localDate.getDate() + mondayOffset);
  return monday;
}

function getTaskStatusText(status: DailyTaskStatus) {
  if (status === "done") return "완료";
  if (status === "in_progress") return "진행중";
  return "예정";
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StoredStudent | null>(null);
  const [summary, setSummary] = useState<StudentDashboardProgressSummary | null>(null);
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyTasksResponse | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedStudent = getStudent();
    if (!storedStudent) {
      router.push("/login");
      return;
    }

    setStudent(storedStudent);

    const load = async () => {
      const today = new Date();
      const weekStart = toLocalDateKey(getLocalWeekStart(today));

      try {
        const [summaryResult, weeklyResult] = await Promise.allSettled([
          apiFetch<StudentDashboardProgressSummary>(
            `/student/progress-summary?student_id=${storedStudent.id}`,
          ),
          apiFetch<WeeklyTasksResponse>(
            `/student/weekly-tasks?student_id=${storedStudent.id}&week_start=${weekStart}`,
          ),
        ]);

        if (summaryResult.status === "fulfilled") {
          setSummary(summaryResult.value);
          setSummaryError("");
        } else {
          setSummaryError("진도 요약을 불러오지 못했습니다.");
        }

        if (weeklyResult.status === "fulfilled") {
          setWeeklyTasks(weeklyResult.value);
        } else {
          setWeeklyTasks(null);
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const subjectCards = studentSubjectCards.map((subject) => {
    const matched = summary?.subjects.find((item) => item.subject === subject.name);
    return {
      ...subject,
      completed: matched?.done ?? 0,
      progressPercentage: matched?.progress_rate ?? 0,
      total: matched?.total ?? 0,
    };
  });

  const completedTasks = summary?.overall.done ?? 0;
  const totalTasks = summary?.overall.total ?? 0;
  const progressPct = summary?.overall.progress_rate ?? 0;
  const questionTasks = summary?.overall.partial ?? 0;
  const ddayInfo = getDdayInfo("2026-09-02");
  const examMessage = examMessages[Math.abs(ddayInfo.daysRemaining) % examMessages.length];
  const todayKey = toLocalDateKey(new Date());
  const todayTaskDay = weeklyTasks?.days.find((day) => day.date === todayKey) ?? null;
  const todayTasks = todayTaskDay?.tasks ?? [];
  const todayTaskSummary = todayTaskDay?.summary ?? {
    completion_rate: 0,
    done: 0,
    todo: 0,
    total: 0,
  };
  const todayRemaining = todayTasks.filter((task) => task.status !== "done").length;
  const remainingTasks = todayTasks.filter((task) => task.status !== "done");

  const handleLogout = () => {
    clearStudent();
    router.push("/login");
  };

  return (
    <ScreenShell withBottomNav>
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="text-[1.85rem] font-black tracking-tight text-[#17213B]">
            {student ? `안녕하세요, ${student.name}님` : "안녕하세요"}
          </h1>
          <p className="mt-2 text-sm font-medium text-[#8A94A8]">
            오늘도 한 걸음씩 함께해요.
          </p>
        </div>

        <button
          aria-label="로그아웃"
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#17213B] shadow-card transition hover:bg-gray-50"
          onClick={handleLogout}
          type="button"
        >
          <span className="text-lg">⌂</span>
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500" />
        </button>
      </div>

      <section className="relative overflow-hidden rounded-[30px] bg-[#121C3D] px-5 py-4 text-white shadow-[0_22px_52px_rgba(15,23,42,0.24)]">
        <div className="pointer-events-none absolute -right-10 top-8 h-32 w-32 rounded-full bg-[#776BFF]/18 blur-3xl" />

        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/90">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6E73FF] text-sm">
                ✓
              </span>
              <span>오늘 할 일</span>
            </div>

            <h2 className="ml-3 mt-2 text-[1.2rem] font-black leading-tight tracking-tight">
              {loading ? (
                "불러오는 중..."
              ) : todayTasks.length > 0 ? (
                <>
                  오늘미션 <span className="text-[#9B98FF]">{todayRemaining}개</span> 남았어요
                </>
              ) : (
                "오늘미션이 없어요"
              )}
            </h2>
          </div>

          <div className="relative h-[118px] w-[132px] shrink-0">
            <Image
              alt="공부하는 고양이"
              className="object-contain"
              fill
              sizes="132px"
              src="/study-cat.png.png"
            />
          </div>
        </div>

        {remainingTasks.length > 0 ? (
          <div className="mt-1.5 space-y-2">
            {remainingTasks.map((task) => (
              <Link
                className="relative flex items-center justify-between gap-3 rounded-[24px] bg-white px-4 py-3.5 text-[#17213B] shadow-[0_10px_22px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5"
                href="/student/today"
                key={task.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-black">{task.title}</p>
                </div>
                <span className="shrink-0 text-2xl font-bold text-[#A0A8BC]">›</span>
              </Link>
            ))}
          </div>
        ) : !loading && todayTasks.length > 0 ? (
          <div className="mt-1.5 rounded-[24px] bg-white/10 px-4 py-3.5">
            <p className="text-[15px] font-black text-white/80">오늘 미션 모두 완료! 🎉</p>
          </div>
        ) : null}

        <div className="relative mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <div className="flex items-end gap-2">
              <p className="text-sm font-semibold text-white/72">오늘 진행률</p>
                <p className="bg-[linear-gradient(135deg,#FFFFFF_0%,#C9C6FF_100%)] bg-clip-text text-[1.75rem] font-black tracking-tight text-transparent drop-shadow-[0_6px_16px_rgba(140,132,255,0.25)]">
                  {todayTaskSummary.completion_rate}%
                </p>
              </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/18">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#6E73FF_0%,#9B87FF_100%)] transition-all duration-500"
                style={{ width: `${todayTaskSummary.completion_rate}%` }}
              />
            </div>
          </div>

          <Link
            className="inline-flex h-11 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#6C73FF_0%,#8D84FF_100%)] px-5 text-[15px] font-black text-white shadow-[0_14px_26px_rgba(110,100,255,0.3)] transition hover:brightness-105"
            href="/student/today"
          >
            시작하기 →
          </Link>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#EEF2FF] bg-white px-6 py-5 shadow-card">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-lg text-[#6D72FF]">
            📘
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black text-[#17213B]">9월 모의고사 {ddayInfo.label}</p>
            <p className="mt-1 text-sm font-semibold text-[#7B88F8]">2026년 9월 2일 시행</p>
          </div>
        </div>

        <p className="mt-4 pl-16 text-sm font-semibold leading-relaxed text-[#7A859F]">{examMessage}</p>
      </section>

      <section className="rounded-[30px] border border-gray-100 bg-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-black text-[#17213B]">전체 학습 요약</h2>
          <span className="text-xs font-semibold text-[#98A1B3]">
            {loading ? "진도 불러오는 중..." : "이번 주 기준"}
          </span>
        </div>

        {summaryError ? (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">
            {summaryError}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-3 divide-x divide-[#EEF1F7]">
          <div className="px-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-xl text-indigo-500">
              ✓
            </div>
            <p className="mt-3 text-sm font-semibold text-[#8A94A8]">완료한 문제</p>
            <p className="mt-2 text-[1.65rem] font-black tracking-tight text-[#17213B]">
              {completedTasks}
            </p>
            <p className="text-sm font-medium text-[#98A1B3]">/ {totalTasks}문제</p>
          </div>

          <div className="px-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-600">
              ◎
            </div>
            <p className="mt-3 text-sm font-semibold text-[#8A94A8]">학습 진도</p>
            <p className="mt-2 text-[1.65rem] font-black tracking-tight text-[#17213B]">
              {progressPct}%
            </p>
            <p className="text-sm font-medium text-[#98A1B3]">목표 70%</p>
          </div>

          <div className="px-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-xl text-orange-500">
              △
            </div>
            <p className="mt-3 text-sm font-semibold text-[#8A94A8]">질문 표시</p>
            <p className="mt-2 text-[1.65rem] font-black tracking-tight text-[#17213B]">
              {questionTasks}
            </p>
            <p className="text-sm font-medium text-[#98A1B3]">다시 볼 문제</p>
          </div>
        </div>
      </section>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.4rem] font-black tracking-tight text-[#17213B]">교재진도</h2>
          {loading ? (
            <span className="text-xs font-semibold text-[#98A1B3]">불러오는 중...</span>
          ) : (
            <span className="text-sm font-semibold text-[#98A1B3]">{subjectCards.length}개 과목</span>
          )}
        </div>

        <div className="space-y-3">
          {subjectCards.map((subject) => (
            <Link
              className="block rounded-3xl bg-white p-5 shadow-card transition hover:-translate-y-0.5"
              href={subject.href}
              key={subject.id}
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${subject.iconBg}`}>
                  {subject.iconContent}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-black text-[#17213B]">{subject.name}</h2>
                  <p className="mt-0.5 text-xs font-medium leading-relaxed text-gray-400">{subject.description}</p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <CircularProgress
                    ringColor={subject.ringColor}
                    trackColor={subject.trackColor}
                    value={subject.progressPercentage}
                  />
                  {subject.total > 0 ? (
                    <p className="text-[10px] font-bold text-gray-400">
                      {subject.completed} / {subject.total}문항
                    </p>
                  ) : null}
                </div>
                <span className="mt-1 shrink-0 text-xl font-bold text-gray-300">›</span>
              </div>
              <div className={`mt-4 h-1.5 overflow-hidden rounded-full ${subject.barTrack}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${subject.barColor}`}
                  style={{ width: `${Math.round(subject.progressPercentage)}%` }}
                />
              </div>
            </Link>
          ))}
        </div>
      </div>

      <StudentBottomNav />
    </ScreenShell>
  );
}
