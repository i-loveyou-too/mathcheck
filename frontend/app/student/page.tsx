"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentLogoutButton } from "@/components/student-logout-button";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getCurrentStudyWeekStart, getStudyDate } from "@/lib/study-date";
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

type SuteukChallengeAssignment = {
  id: number;
  challenge_type: string;
  challenge_title: string;
  challenge_short_title: string;
  start_date: string;
  current_day: number;
  total_days: number;
  schedule_finished: boolean;
  overall_progress_rate: number;
  today: {
    completed_tasks: number;
    total_tasks: number;
    progress_rate: number;
  };
};

type SuteukChallengeSummary = {
  assignment: SuteukChallengeAssignment | null;
  assignments?: SuteukChallengeAssignment[];
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
        <span className="text-[13px] font-black text-[#1F2933]">{Math.round(value)}%</span>
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
  "AIMON. 오늘의 기록이 진짜 실력이 됩니다.",
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
  const [suteukChallenges, setSuteukChallenges] = useState<SuteukChallengeAssignment[]>([]);
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
      const weekStart = getCurrentStudyWeekStart();

      try {
        const [summaryResult, weeklyResult, suteukResult] = await Promise.allSettled([
          apiFetch<StudentDashboardProgressSummary>(
            `/student/progress-summary?student_id=${storedStudent.id}`,
          ),
          apiFetch<WeeklyTasksResponse>(
            `/student/weekly-tasks?student_id=${storedStudent.id}&week_start=${weekStart}`,
          ),
          apiFetch<SuteukChallengeSummary>(
            `/student/suteuk-challenge/summary?student_id=${storedStudent.id}&study_date=${getStudyDate()}`,
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

        if (suteukResult.status === "fulfilled") {
          setSuteukChallenges(suteukResult.value.assignments ?? (suteukResult.value.assignment ? [suteukResult.value.assignment] : []));
        } else {
          setSuteukChallenges([]);
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
  const todayKey = getStudyDate();
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

  const handleLogout = async () => {
    await apiFetch("/student/auth/logout", { method: "POST" }).catch(() => null);
    clearStudent();
    router.push("/login");
  };

  return (
    <ScreenShell withBottomNav variant="student">
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="text-[1.85rem] font-black tracking-tight text-[#1F2933]">
            {student ? `안녕하세요, ${student.name}님` : "안녕하세요"}
          </h1>
          <p className="mt-2 text-sm font-medium text-[#667085]">
            오늘도 한 걸음씩 함께해요.
          </p>
        </div>

        <StudentLogoutButton onClick={handleLogout} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <Link
          href="/student/sprint"
          className="group relative overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white p-5 shadow-card transition hover:-translate-y-0.5 md:min-h-[210px] md:p-6"
        >
          <div className="relative grid min-h-[176px] grid-cols-[minmax(0,1fr)_136px] items-center gap-3 md:grid-cols-[1fr_1fr] md:gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black tracking-[0.18em] text-[#667085]">SPRINT</p>
              <p className="mt-3 text-[1.55rem] font-black leading-tight tracking-tight text-[#1F2933] md:text-[1.7rem]">
                집중 학습 관리
              </p>
              <p className="mt-2 text-sm font-bold leading-relaxed text-[#667085]">
                오늘의 인증과 학습을 관리해요
              </p>
              <div className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-sm font-black text-[#1F2933] transition group-hover:translate-x-0.5">
                스프린트 메인 가기
                <span className="text-lg leading-none">→</span>
              </div>
            </div>
            <div className="relative h-[144px] min-w-0 md:h-[178px]">
              <Image
                alt="SPRINT 집중 학습 관리"
                className="object-contain"
                fill
                sizes="(min-width: 768px) 250px, 136px"
                src="/sprint.png"
              />
            </div>
          </div>
        </Link>
        <Link
          href="/student/lessons"
          className="group relative overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white p-5 shadow-card transition hover:-translate-y-0.5 md:min-h-[210px] md:p-6"
        >
          <div className="relative grid min-h-[176px] grid-cols-[minmax(0,1fr)_112px] items-center gap-3 md:grid-cols-[1fr_0.78fr] md:gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black tracking-[0.18em] text-[#E86F6B]">LESSONS</p>
              <p className="mt-3 text-[1.5rem] font-black leading-tight tracking-tight text-[#1F2933] md:text-[1.65rem]">
                수업 일정
              </p>
              <p className="mt-2 text-sm font-bold leading-relaxed text-[#667085]">
                다음 수업을 확인하고 준비해요
              </p>
              <div className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#E86F6B] px-4 text-sm font-black text-white shadow-[0_12px_24px_rgba(232,111,107,0.22)] transition group-hover:translate-x-0.5">
                수업 일정 확인하기
                <span className="text-lg leading-none">→</span>
              </div>
            </div>
            <div className="relative h-[126px] min-w-0 md:h-[154px]">
              <Image
                alt="수업 일정"
                className="object-contain drop-shadow-[0_16px_24px_rgba(71,104,143,0.18)]"
                fill
                sizes="(min-width: 768px) 190px, 112px"
                src="/calander.png"
              />
            </div>
          </div>
        </Link>
      </div>

      {suteukChallenges.map((suteukChallenge) => (
        <Link
          key={suteukChallenge.id}
          href={`/student/suteuk-challenge?assignment_id=${suteukChallenge.id}`}
          className="group relative block min-w-0 overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#E13D3D_0%,#FF5A5F_52%,#FF8A5C_100%)] p-5 text-white shadow-[0_18px_38px_rgba(225,61,61,0.24)] transition hover:-translate-y-0.5"
        >
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/18 blur-3xl" />
          <div className="relative grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)] sm:items-end">
            <div className="min-w-0">
              <p className="text-xs font-black tracking-[0.18em] text-white/78">{suteukChallenge.challenge_type.toUpperCase()}</p>
              <h2 className="mt-2 break-words text-[1.55rem] font-black leading-tight tracking-tight">
                {suteukChallenge.challenge_title}
              </h2>
              <p className="mt-2 break-words text-sm font-bold text-white/78">
                {suteukChallenge.schedule_finished ? "챌린지 기간 종료" : `DAY ${suteukChallenge.current_day} / ${suteukChallenge.total_days}`} · {suteukChallenge.start_date} 시작
              </p>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/22">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500"
                  style={{ width: `${suteukChallenge.overall_progress_rate}%` }}
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-3 sm:items-end">
              <div className="min-w-0 text-left sm:text-right">
                <p className="text-sm font-bold text-white/75">전체 진행률</p>
                <p className="text-3xl font-black">{suteukChallenge.overall_progress_rate}%</p>
              </div>
              <span className="inline-flex min-h-11 max-w-full items-center justify-center rounded-full bg-white px-4 py-2 text-center text-sm font-black leading-tight text-[#E13D3D] shadow-[0_12px_26px_rgba(16,33,61,0.16)] sm:max-w-[180px]">
                {suteukChallenge.today.completed_tasks > 0 ? "오늘 분량 이어하기" : "오늘 분량 시작"}
              </span>
            </div>
          </div>
        </Link>
      ))}

      <section className="relative overflow-hidden rounded-[20px] border border-[#E5E7EB] bg-white px-5 py-4 shadow-card">
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF1F0] px-3 py-1.5 text-sm font-semibold text-[#E86F6B]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E86F6B] text-sm text-white">
                ✓
              </span>
              <span>오늘 할 일</span>
            </div>

            <h2 className="ml-3 mt-2 text-[1.2rem] font-black leading-tight tracking-tight text-[#1F2933]">
              {loading ? (
                "불러오는 중..."
              ) : todayTasks.length > 0 ? (
                <>
                  오늘미션 <span className="text-[#E86F6B]">{todayRemaining}개</span> 남았어요
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
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] px-4 py-3.5 text-[#1F2933] transition hover:border-[#F1D8D7] hover:bg-[#FFF8F7]"
                href="/student/today"
                key={task.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-black">{task.title}</p>
                </div>
                <span className="shrink-0 text-2xl font-bold text-[#98A2B3]">›</span>
              </Link>
            ))}
          </div>
        ) : !loading && todayTasks.length > 0 ? (
          <div className="mt-1.5 rounded-2xl bg-emerald-50 px-4 py-3.5">
            <p className="text-[15px] font-black text-emerald-700">오늘 미션 모두 완료! 🎉</p>
          </div>
        ) : null}

        <div className="relative mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <div className="flex items-end gap-2">
              <p className="text-sm font-semibold text-[#667085]">오늘 진행률</p>
                <p className="text-[1.75rem] font-black tracking-tight text-[#1F2933]">
                  {todayTaskSummary.completion_rate}%
                </p>
              </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#FFF1F0]">
              <div
                className="h-full rounded-full bg-[#E86F6B] transition-all duration-500"
                style={{ width: `${todayTaskSummary.completion_rate}%` }}
              />
            </div>
          </div>

          <Link
            className="inline-flex h-11 items-center justify-center rounded-[20px] bg-[#E86F6B] px-5 text-[15px] font-black text-white transition hover:bg-[#DC625E]"
            href="/student/today"
          >
            시작하기 →
          </Link>
        </div>
      </section>

      <section className="rounded-[20px] border border-[#E5E7EB] bg-white px-6 py-5 shadow-card">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF1F0] text-lg text-[#E86F6B]">
            📘
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black text-[#1F2933]">9월 모의고사 {ddayInfo.label}</p>
            <p className="mt-1 text-sm font-semibold text-[#E86F6B]">2026년 9월 2일 시행</p>
          </div>
        </div>

        <p className="mt-4 pl-16 text-sm font-semibold leading-relaxed text-[#667085]">{examMessage}</p>
      </section>

      <section className="rounded-[20px] border border-[#E5E7EB] bg-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-black text-[#1F2933]">전체 학습 요약</h2>
          <span className="text-xs font-semibold text-[#98A2B3]">
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
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF1F0] text-xl text-[#E86F6B]">
              ✓
            </div>
            <p className="mt-3 text-sm font-semibold text-[#667085]">완료한 문제</p>
            <p className="mt-2 text-[1.65rem] font-black tracking-tight text-[#1F2933]">
              {completedTasks}
            </p>
            <p className="text-sm font-medium text-[#98A2B3]">/ {totalTasks}문제</p>
          </div>

          <div className="px-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-600">
              ◎
            </div>
            <p className="mt-3 text-sm font-semibold text-[#667085]">학습 진도</p>
            <p className="mt-2 text-[1.65rem] font-black tracking-tight text-[#1F2933]">
              {progressPct}%
            </p>
            <p className="text-sm font-medium text-[#98A2B3]">목표 70%</p>
          </div>

          <div className="px-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-xl text-orange-500">
              △
            </div>
            <p className="mt-3 text-sm font-semibold text-[#667085]">질문 표시</p>
            <p className="mt-2 text-[1.65rem] font-black tracking-tight text-[#1F2933]">
              {questionTasks}
            </p>
            <p className="text-sm font-medium text-[#98A2B3]">다시 볼 문제</p>
          </div>
        </div>
      </section>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.4rem] font-black tracking-tight text-[#1F2933]">교재진도</h2>
          {loading ? (
            <span className="text-xs font-semibold text-[#98A2B3]">불러오는 중...</span>
          ) : (
            <span className="text-sm font-semibold text-[#98A2B3]">{subjectCards.length}개 과목</span>
          )}
        </div>

        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-2">
          {subjectCards.map((subject) => (
            <Link
              className="block rounded-[20px] border border-[#E5E7EB] bg-white p-5 shadow-card transition hover:-translate-y-0.5"
              href={subject.href}
              key={subject.id}
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${subject.iconBg}`}>
                  {subject.iconContent}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-black text-[#1F2933]">{subject.name}</h2>
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
