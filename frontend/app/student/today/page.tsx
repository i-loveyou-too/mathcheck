"use client";

import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { clearStudent, getStudent } from "@/lib/storage";
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
  if (status === "done") return "bg-emerald-100 text-emerald-700";
  if (status === "in_progress") return "bg-sky-100 text-sky-600";
  return "bg-gray-100 text-gray-500";
}

function getTaskCardClass(status: DailyTaskStatus) {
  if (status === "done") {
    return "border border-[#EEF2FF] bg-[#F8FAFF]";
  }

  if (status === "in_progress") {
    return "border border-[#E3E8FF] bg-white";
  }

  return "border border-gray-100 bg-white";
}

function formatSelectedDate(date: Date) {
  const weekday = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][date.getDay()];
  return `${weekday} ${date.getMonth() + 1}/${date.getDate()}`;
}

function getSummaryIcon(label: "rate" | "goal" | "done") {
  if (label === "rate") return "📈";
  if (label === "goal") return "📝";
  return "🔥";
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

  const fetchWeeklyTasks = useCallback(
    async (targetStudentId: number) => {
      const data = await apiFetch<WeeklyTasksResponse>(
        `/student/weekly-tasks?student_id=${targetStudentId}&week_start=${currentWeekStartKey}`,
      );
      setWeeklyData(data);
    },
    [currentWeekStartKey],
  );

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
  const selectedDate = weekDays.find((date) => toLocalDateKey(date) === selectedDateKey) ?? today;
  const selectedDay = weeklyData?.days.find((day) => day.date === selectedDateKey);
  const tasks = selectedDay?.tasks ?? [];
  const weeklySummary = useMemo(() => {
    const days = weeklyData?.days ?? [];
    const total = days.reduce((sum, day) => sum + day.summary.total, 0);
    const done = days.reduce((sum, day) => sum + day.summary.done, 0);

    return {
      done,
      rate: total > 0 ? Math.round((done / total) * 100) : 0,
      total,
    };
  }, [weeklyData]);

  const todayTaskDay = weeklyData?.days.find((day) => day.date === todayKey);
  const todayRemaining = (todayTaskDay?.tasks ?? []).filter((task) => task.status !== "done").length;
  const todayCompletionRate = todayTaskDay?.summary.completion_rate ?? 0;

  const updateTaskInWeek = (taskId: number, status: DailyTaskStatus) => {
    setWeeklyData((current) => {
      if (!current) return current;

      const days = current.days.map((day) => {
        const nextTasks = day.tasks.map((task) => (task.id === taskId ? { ...task, status } : task));
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

  const handleLogout = () => {
    clearStudent();
    router.push("/login");
  };

  return (
    <ScreenShell withBottomNav>

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="text-[1.5rem] font-black tracking-tight text-[#17213B]">
            {STUDENT_PAGE_TITLES.today}
          </h1>
          <p className="mt-1 text-sm font-medium text-[#8A94A8]">
            오늘 해야 할 일을 하나씩 해내요.
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-[#17213B] shadow-card transition hover:bg-gray-50"
          onClick={handleLogout}
          type="button"
        >
          <span className="text-base">↪</span>
          <span>로그아웃</span>
        </button>
      </div>

      {/* 오늘 진행률 컴팩트 카드 */}
      <div className="rounded-[20px] border border-[#EEF2FF] bg-white px-5 py-3.5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-[#17213B]">
            {loading
              ? "불러오는 중..."
              : todayRemaining === 0 && (todayTaskDay?.tasks.length ?? 0) > 0
              ? "오늘 미션 모두 완료 🎉"
              : `${todayRemaining}개 남았어요`}
          </p>
          <span className="shrink-0 text-sm font-black text-[#6D73FF]">
            {todayCompletionRate}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EDF7]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#6676FF_0%,#8E84FF_100%)] transition-all duration-500"
            style={{ width: `${todayCompletionRate}%` }}
          />
        </div>
      </div>

      {/* 오늘 미션 목록 */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-[1.2rem] font-black tracking-tight text-[#17213B]">
            {selectedDateKey === todayKey ? "오늘의 미션" : formatSelectedDate(selectedDate)}
          </h2>
          <button
            aria-label="직접 추가"
            className="inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-sm font-black text-[#6D73FF] shadow-card transition hover:bg-gray-50"
            type="button"
          >
            + 직접 추가
          </button>
        </div>

        {loading ? (
          <p className="text-sm font-bold text-gray-400">불러오는 중...</p>
        ) : null}
        {loadError ? (
          <p className="text-sm font-bold text-red-500">{loadError}</p>
        ) : null}
        {saveError ? (
          <p className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{saveError}</p>
        ) : null}

        {!loading && !loadError ? (
          <>
            {/* 미완료 미션 */}
            {tasks.filter((t) => t.status !== "done").length > 0 ? (
              <div className="space-y-3">
                {tasks
                  .filter((t) => t.status !== "done")
                  .map((task) => (
                    <article
                      className={cn(
                        "flex min-h-[96px] w-full items-center gap-3 rounded-[28px] px-4 py-4 text-left shadow-card transition",
                        task.textbook_key ? "cursor-pointer" : "",
                        getTaskCardClass(task.status),
                      )}
                      key={task.id}
                      onClick={() => openTask(task)}
                    >
                      <button
                        aria-label={`${task.title} 완료 상태 변경`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#B8C1FF] bg-white text-sm font-black text-transparent transition"
                        onClick={(event) => void toggleTaskStatus(task, event)}
                        type="button"
                      >
                        ✓
                      </button>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[1.05rem] font-black leading-snug text-[#17213B]">
                          {task.title}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full bg-[#F1F0FF] px-3 py-1 text-xs font-bold text-[#6D73FF]">
                            {task.category ?? "기타"}
                          </span>
                          {task.detail ? (
                            <span className="rounded-full bg-[#F1F0FF] px-3 py-1 text-xs font-bold text-[#6D73FF]">
                              {task.detail}
                            </span>
                          ) : null}
                          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", getStatusClass(task.status))}>
                            {getStatusLabel(task.status)}
                          </span>
                        </div>
                      </div>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F7F8FC] text-2xl font-black text-[#8A94A8]">
                        …
                      </div>
                    </article>
                  ))}
              </div>
            ) : null}

            {/* 완료한 미션 */}
            {tasks.filter((t) => t.status === "done").length > 0 ? (
              <>
                <p className="mb-2 mt-5 text-xs font-bold text-[#98A1B3]">✓ 완료한 미션</p>
                <div className="space-y-2">
                  {tasks
                    .filter((t) => t.status === "done")
                    .map((task) => (
                      <article
                        className="flex items-center gap-3 rounded-[22px] border border-[#EEF2FF] bg-[#F8FAFF] px-4 py-3 opacity-55"
                        key={task.id}
                      >
                        <button
                          aria-label={`${task.title} 완료 상태 변경`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#6D73FF] bg-[#6D73FF] text-sm font-black text-white shadow-[0_4px_10px_rgba(109,115,255,0.22)] transition"
                          onClick={(event) => void toggleTaskStatus(task, event)}
                          type="button"
                        >
                          ✓
                        </button>
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#9AA3B6] line-through">
                          {task.title}
                        </p>
                      </article>
                    ))}
                </div>
              </>
            ) : null}

            {/* 빈 상태 */}
            {tasks.length === 0 ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[#E4EAF6] bg-white px-4 py-6 text-center shadow-card">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F7FB] text-2xl">
                  ☁
                </div>
                <p className="text-sm font-black text-[#17213B]">오늘 배정된 미션이 없어요.</p>
                <p className="mt-1 text-xs font-semibold text-[#98A1B3]">잠깐 쉬어가도 괜찮아요.</p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {/* 이번 주 미션 */}
      <section className="rounded-[30px] border border-[#EEF2FF] bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-[#17213B]">이번 주 미션</h2>
            <p className="mt-1 text-xs font-semibold text-[#98A1B3]">{weekLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label="이전 주"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F7FB] text-lg font-black text-[#7A859F] transition hover:bg-[#EAEFF7]"
              onClick={() => moveWeek(-7)}
              type="button"
            >
              ←
            </button>
            <button
              className={cn(
                "rounded-full px-3.5 py-2 text-xs font-black transition",
                isSameLocalWeek(currentWeekStart, today)
                  ? "bg-[#EEF2FF] text-[#6C73FF]"
                  : "bg-[#0F172A] text-white",
              )}
              onClick={returnToThisWeek}
              type="button"
            >
              이번 주
            </button>
            <button
              aria-label="다음 주"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F7FB] text-lg font-black text-[#7A859F] transition hover:bg-[#EAEFF7]"
              onClick={() => moveWeek(7)}
              type="button"
            >
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((date, index) => {
            const dateKey = toLocalDateKey(date);
            const isSelected = dateKey === selectedDateKey;
            const isToday = dateKey === todayKey;

            return (
              <button
                className={cn(
                  "flex h-[92px] flex-col items-center justify-center gap-1 rounded-[22px] border px-1 text-center transition",
                  isSelected
                    ? "border-[#7C83FF] bg-[#7C83FF] text-white shadow-sm"
                    : "border-[#EEF2FF] bg-white text-[#17213B] hover:border-[#D9E1F5] hover:bg-[#F8FAFF]",
                )}
                key={dateKey}
                onClick={() => setSelectedDateKey(dateKey)}
                type="button"
              >
                <span className={cn("text-sm font-bold", isSelected ? "text-white/68" : "text-[#8A94A8]")}>
                  {dayLabels[index]}
                </span>
                <span className="text-[1.35rem] font-black leading-none">{date.getDate()}</span>
                <span
                  className={cn(
                    "text-[12px] font-black",
                    isSelected ? "text-white/78" : isToday ? "text-[#6C73FF]" : "text-transparent",
                  )}
                >
                  {isToday ? "오늘" : "오늘"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 주간 분석 */}
      <section className="rounded-[30px] border border-[#EEF2FF] bg-white p-5 shadow-card">
        <p className="mb-4 text-sm font-black text-[#17213B]">주간 분석</p>
        <div className="grid grid-cols-3 divide-x divide-[#EEF1F7]">
          {[
            { key: "rate" as const, label: "진도율", value: `${weeklySummary.rate}%` },
            { key: "goal" as const, label: "목표", value: `${weeklySummary.total}개` },
            { key: "done" as const, label: "갓생", value: `${weeklySummary.done}일` },
          ].map((item) => (
            <div className="flex items-center justify-center gap-3 px-2 text-center first:pl-0 last:pr-0" key={item.label}>
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl",
                  item.key === "done" ? "bg-orange-50 text-orange-500" : "bg-[#F3F2FF] text-[#6D73FF]",
                )}
              >
                {getSummaryIcon(item.key)}
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-tight text-[#8A94A8]">{item.label}</p>
                <p className="mt-1 text-[1.35rem] font-black leading-none tracking-tight text-[#17213B]">
                  {item.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <StudentBottomNav />
    </ScreenShell>
  );
}
