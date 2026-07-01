"use client";

import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { STUDENT_PAGE_TITLES } from "@/lib/student-page-titles";
import { cn } from "@/lib/utils";

type DailyTaskStatus = "todo" | "in_progress" | "done";

type DailyTask = {
  id: number;
  category: string | null;
  detail: string | null;
  difficulty: string | null;
  end_item_number: number | null;
  order_index: number;
  start_item_number: number | null;
  status: DailyTaskStatus;
  textbook_id: number | null;
  textbook_key: string | null;
  title: string;
};

type DailyTaskSummary = {
  total: number;
  done: number;
  todo: number;
  completion_rate: number;
};

type WeeklyTaskDay = {
  date: string;
  summary: DailyTaskSummary;
  tasks: DailyTask[];
};

type WeeklyTasksResponse = {
  student_id: number;
  week_start: string;
  days: WeeklyTaskDay[];
};

const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];

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

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return startOfLocalDay(next);
}

function getWeekDays(weekStart: Date) {
  const monday = startOfLocalDay(weekStart);

  return Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index));
}

function formatWeekLabel(weekDays: Date[]) {
  const first = weekDays[0];
  const last = weekDays[6];
  if (!first || !last) return "";

  const format = (date: Date) =>
    `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, "0")}.${`${date.getDate()}`.padStart(2, "0")}`;

  return `${format(first)} - ${format(last)}`;
}

function isSameLocalWeek(firstDate: Date, secondDate: Date) {
  return toLocalDateKey(getLocalWeekStart(firstDate)) === toLocalDateKey(getLocalWeekStart(secondDate));
}

function parseLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getStatusLabel(status: DailyTaskStatus) {
  if (status === "done") return "완료";
  if (status === "in_progress") return "진행중";
  return "예정";
}

function getStatusClass(status: DailyTaskStatus) {
  if (status === "done") return "bg-emerald-100 text-emerald-600";
  if (status === "in_progress") return "bg-sky-100 text-sky-600";
  return "bg-gray-100 text-gray-500";
}

function getTaskCardClass(status: DailyTaskStatus) {
  if (status === "done") return "bg-[#EAF6FF] text-[#17213B]";
  return "bg-white text-[#17213B] shadow-sm ring-1 ring-gray-100";
}

function formatSelectedDate(date: Date) {
  const weekday = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][
    date.getDay()
  ];
  return `${weekday} ${date.getMonth() + 1}/${date.getDate()}`;
}

export default function StudentTodayPage() {
  const router = useRouter();
  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const todayKey = toLocalDateKey(today);
  const initialWeekStart = useMemo(() => getLocalWeekStart(today), [today]);
  const [currentWeekStart, setCurrentWeekStart] = useState(initialWeekStart);
  const currentWeekStartKey = toLocalDateKey(currentWeekStart);
  const fallbackWeekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart]);
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyTasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const fetchWeeklyTasks = useCallback(async (targetStudentId: number) => {
    const data = await apiFetch<WeeklyTasksResponse>(
      `/student/weekly-tasks?student_id=${targetStudentId}&week_start=${currentWeekStartKey}`,
    );
    setWeeklyData(data);
  }, [currentWeekStartKey]);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    setStudentId(student.id);

    const load = async () => {
      setLoading(true);
      setLoadError("");

      try {
        await fetchWeeklyTasks(student.id);
      } catch {
        setLoadError("오늘미션을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [fetchWeeklyTasks, router]);

  const weekDays = useMemo(() => {
    if (!weeklyData) {
      return fallbackWeekDays;
    }

    return weeklyData.days.map((day) => parseLocalDateKey(day.date));
  }, [fallbackWeekDays, weeklyData]);
  const weekLabel = formatWeekLabel(weekDays);

  const selectedDayIndex = weekDays.findIndex((date) => toLocalDateKey(date) === selectedDateKey);
  const selectedDate = weekDays[selectedDayIndex] ?? today;
  const selectedDay = weeklyData?.days.find((day) => day.date === selectedDateKey);
  const tasks = selectedDay?.tasks ?? [];
  const selectedSummary = selectedDay?.summary ?? {
    total: 0,
    done: 0,
    todo: 0,
    completion_rate: 0,
  };
  const completionRate = selectedSummary.completion_rate;
  const weeklySummary = useMemo(() => {
    const days = weeklyData?.days ?? [];
    const total = days.reduce((sum, day) => sum + day.summary.total, 0);
    const done = days.reduce((sum, day) => sum + day.summary.done, 0);
    const todayTasks = days.find((day) => day.date === todayKey)?.tasks ?? [];
    const todayRemaining = todayTasks.filter((task) => task.status !== "done").length;

    return {
      done,
      rate: total > 0 ? Math.round((done / total) * 100) : 0,
      todayRemaining,
      total,
    };
  }, [todayKey, weeklyData]);

  const updateTaskInWeek = (taskId: number, status: DailyTaskStatus) => {
    setWeeklyData((current) => {
      if (!current) return current;

      const days = current.days.map((day) => {
        const nextTasks = day.tasks.map((task) =>
          task.id === taskId ? { ...task, status } : task,
        );
        const done = nextTasks.filter((task) => task.status === "done").length;
        const total = nextTasks.length;

        return {
          ...day,
          summary: {
            total,
            done,
            todo: total - done,
            completion_rate: total > 0 ? Math.round((done / total) * 100) : 0,
          },
          tasks: nextTasks,
        };
      });

      return { ...current, days };
    });
  };

  const toggleTaskStatus = async (task: DailyTask, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (studentId === null) {
      return;
    }

    const nextStatus: DailyTaskStatus = task.status === "done" ? "todo" : "done";
    const previousStatus = task.status;

    setSaveError("");
    updateTaskInWeek(task.id, nextStatus);

    try {
      await apiFetch<DailyTask>(`/student/daily-tasks/${task.id}/status`, {
        method: "PATCH",
        body: {
          student_id: studentId,
          status: nextStatus,
        },
      });
    } catch {
      updateTaskInWeek(task.id, previousStatus);
      setSaveError("저장하지 못했습니다. 다시 시도해주세요.");

      try {
        await fetchWeeklyTasks(studentId);
      } catch {
        setLoadError("오늘미션을 불러오지 못했습니다.");
      }
    }
  };

  const openTask = (task: DailyTask) => {
    if (task.textbook_key) {
      router.push(`/student/textbooks/${task.textbook_key}`);
    }
  };

  const moveWeek = (dayOffset: number) => {
    const nextWeekStart = addLocalDays(currentWeekStart, dayOffset);
    setWeeklyData(null);
    setLoadError("");
    setSaveError("");
    setCurrentWeekStart(nextWeekStart);
    setSelectedDateKey(toLocalDateKey(nextWeekStart));
  };

  const returnToThisWeek = () => {
    setWeeklyData(null);
    setLoadError("");
    setSaveError("");
    setCurrentWeekStart(initialWeekStart);
    setSelectedDateKey(todayKey);
  };

  return (
    <ScreenShell withBottomNav>
      <Header
        logoutType="student"
        subtitle="오늘 해야 할 일을 하나씩 해내요."
        title={STUDENT_PAGE_TITLES.today}
      />

      <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-card">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-[#17213B]">이번 주 미션</h2>
            <p className="mt-1 text-xs font-semibold text-[#98A1B3]">{weekLabel}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              aria-label="이전 주"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9] text-base font-black text-[#64748B] transition hover:bg-[#E2E8F0]"
              onClick={() => moveWeek(-7)}
              type="button"
            >
              ←
            </button>
            <button
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-black transition",
                isSameLocalWeek(currentWeekStart, today)
                  ? "bg-[#EEF2FF] text-[#818CF8]"
                  : "bg-[#0F172A] text-white",
              )}
              onClick={returnToThisWeek}
              type="button"
            >
              이번 주
            </button>
            <button
              aria-label="다음 주"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9] text-base font-black text-[#64748B] transition hover:bg-[#E2E8F0]"
              onClick={() => moveWeek(7)}
              type="button"
            >
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((date, index) => {
            const dateKey = toLocalDateKey(date);
            const isSelected = dateKey === selectedDateKey;
            const isToday = dateKey === todayKey;

            return (
              <button
                className={cn(
                  "flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border px-1 text-center leading-none transition",
                  isSelected
                    ? "border-[#0F172A] bg-[#0F172A] text-white shadow-sm"
                    : "border-gray-100 bg-[#F8FAFC] text-[#17213B] hover:bg-gray-100",
                )}
                key={dateKey}
                onClick={() => setSelectedDateKey(dateKey)}
                type="button"
              >
                <span className={cn("text-xs font-bold leading-none", isSelected ? "text-white/70" : "text-[#98A1B3]")}>
                  {dayLabels[index]}
                </span>
                <span className="text-lg font-black leading-none">{date.getDate()}</span>
                <span
                  className={cn(
                    "flex h-3 items-center justify-center text-[10px] font-bold leading-none",
                    isSelected ? "text-indigo-100" : "text-indigo-500",
                  )}
                >
                  {isToday ? "오늘" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { label: "이번 주 완료율", value: `${weeklySummary.rate}%` },
            { label: "오늘 남은 할 일", value: `${weeklySummary.todayRemaining}` },
            { label: "이번 주 목표", value: `${weeklySummary.total}` },
            { label: "갓생챌린지", value: `${weeklySummary.done}` },
          ].map((item) => (
            <div className="rounded-2xl bg-[#F8FAFC] px-2 py-3 text-center" key={item.label}>
              <p className="text-[10px] font-bold leading-tight text-[#98A1B3]">{item.label}</p>
              <p className="mt-1 text-lg font-black text-[#17213B]">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black leading-none text-[#17213B]">
              {formatSelectedDate(selectedDate)}
            </h2>
            <p className="mt-2 text-sm font-bold text-[#98A1B3]">완료율 {completionRate}%</p>
          </div>

          <button
            aria-label="할일 추가"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF7FF] text-2xl font-light leading-none text-[#60A5FA]"
            type="button"
          >
            +
          </button>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#F0F2F5]">
          <div
            className="h-full rounded-full bg-[#7DBBFF] transition-all"
            style={{ width: `${completionRate}%` }}
          />
        </div>

        {loading ? <p className="mt-5 text-center text-sm font-bold text-[#98A1B3]">불러오는 중...</p> : null}
        {loadError ? <p className="mt-5 text-center text-sm font-bold text-red-500">{loadError}</p> : null}
        {saveError ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{saveError}</p> : null}

        {!loading && !loadError && tasks.length > 0 ? (
          <div className="mt-4 space-y-3">
            {tasks.map((task) => {
              const isDone = task.status === "done";

              return (
                <article
                  className={cn(
                    "flex min-h-[74px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition",
                    task.textbook_key ? "cursor-pointer" : "",
                    getTaskCardClass(task.status),
                  )}
                  key={task.id}
                  onClick={() => openTask(task)}
                >
                  <button
                    aria-label={`${task.title} 완료 상태 변경`}
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black",
                      isDone
                        ? "border-[#8CA9FF] bg-[#8CA9FF] text-white"
                        : "border-[#B9D8FF] bg-white/40 text-transparent",
                    )}
                    onClick={(event) => void toggleTaskStatus(task, event)}
                    type="button"
                  >
                    ✓
                  </button>

                  <div className="min-w-0 flex-1">
                    <h3
                      className={cn(
                        "truncate text-sm font-black leading-snug",
                        isDone ? "text-[#98A1B3] line-through" : "text-[#17213B]",
                      )}
                    >
                      {task.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-[#D9ECFF] px-2.5 py-0.5 text-xs font-bold text-[#60A5FA]">
                        {task.category ?? "할일"}
                      </span>
                      {task.detail ? (
                        <span className="rounded-full bg-[#D9ECFF] px-2.5 py-0.5 text-xs font-bold text-[#60A5FA]">
                          {task.detail}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-bold",
                          getStatusClass(task.status),
                        )}
                      >
                        {getStatusLabel(task.status)}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {!loading && !loadError && tasks.length === 0 ? (
          <div className="flex min-h-[190px] flex-col items-center justify-center px-4 py-8 text-center">
            <div className="text-5xl leading-none">😴</div>
            <p className="mt-4 text-sm font-black text-[#17213B]">오늘 배정된 미션이 없어요.</p>
            <p className="mt-1 text-xs font-bold text-[#98A1B3]">오늘 해낼 일을 추가해볼까요?</p>
          </div>
        ) : null}
      </section>

      <StudentBottomNav />
    </ScreenShell>
  );
}
