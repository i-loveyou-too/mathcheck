"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { STUDENT_PAGE_TITLES } from "@/lib/student-page-titles";
import { cn } from "@/lib/utils";

type TrackerDay = {
  date: string;
  total: number;
  done: number;
  todo: number;
  is_completed: boolean;
  has_tasks: boolean;
};

type AchievementTrackerResponse = {
  student_id: number;
  year: number;
  month: number;
  current_streak: number;
  monthly_done_days: number;
  monthly_total_task_days: number;
  monthly_completion_rate: number;
  days: TrackerDay[];
};

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonthGridDays(year: number, month: number, trackerDays: TrackerDay[]) {
  const daysByDate = Object.fromEntries(trackerDays.map((day) => [day.date, day]));
  const firstDate = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0);
  const start = new Date(firstDate);
  start.setDate(firstDate.getDate() - firstDate.getDay());
  const end = new Date(lastDate);
  end.setDate(lastDate.getDate() + (6 - lastDate.getDay()));

  const result: Array<{ date: Date; dateKey: string; day?: TrackerDay; inMonth: boolean }> = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const dateKey = toLocalDateKey(cursor);
    result.push({
      date: new Date(cursor),
      dateKey,
      day: daysByDate[dateKey],
      inMonth: cursor.getMonth() === month - 1,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export default function StudentTrackerPage() {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const todayKey = toLocalDateKey(today);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [tracker, setTracker] = useState<AchievementTrackerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<AchievementTrackerResponse>(
          `/student/achievement-tracker?student_id=${student.id}&year=${year}&month=${month}`,
        );
        setTracker(data);
      } catch {
        setError("갓생챌린지를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [month, router, year]);

  const calendarDays = useMemo(
    () => getMonthGridDays(year, month, tracker?.days ?? []),
    [month, tracker?.days, year],
  );
  const hasTaskDays = (tracker?.monthly_total_task_days ?? 0) > 0;

  const moveMonth = (direction: -1 | 1) => {
    const next = new Date(year, month - 1 + direction, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  };

  return (
    <ScreenShell withBottomNav>
      <div className="pt-1">
        <h1 className="text-2xl font-black tracking-tight text-[#17213B]">
          {STUDENT_PAGE_TITLES.tracker}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-[#98A1B3]">
          매일 해낸 기록이 나의 루틴이 돼요.
        </p>
      </div>

      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#FFF1F7] via-[#F5F3FF] to-[#ECF7FF] p-6 text-center shadow-card">
        <p className="text-lg font-black text-[#5B5CE2]">갓생 챌린지</p>
        <p className="mx-auto mt-2 max-w-[17rem] text-sm font-bold leading-relaxed text-[#8A94A8]">
          포기하지 마세요! 오늘도 해내면 갓생에 한 걸음 가까워져요.
        </p>

        <div className="mx-auto mt-7 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-[#7C7BFF] to-[#6EC6FF] p-2 shadow-[0_18px_40px_rgba(91,92,226,0.22)]">
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
            <p className="text-5xl font-black text-[#5B5CE2]">{tracker?.current_streak ?? 0}</p>
            <p className="text-xs font-black tracking-wide text-[#8A94A8]">DAYS</p>
          </div>
        </div>
        <p className="mt-4 text-sm font-black text-[#5B5CE2]">
          연속 학습 {tracker?.current_streak ?? 0}일째
        </p>
      </section>

      <section className="rounded-[2rem] bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-[#17213B]">{month}월 챌린지 기록</h2>
            <p className="mt-1 text-sm font-bold text-[#98A1B3]">
              {tracker ? `${tracker.monthly_done_days} / ${tracker.monthly_total_task_days}일 완료` : "불러오는 중..."}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              aria-label="이전 달"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3FF] text-xl font-black text-[#8A94A8]"
              onClick={() => moveMonth(-1)}
              type="button"
            >
              ‹
            </button>
            <button
              aria-label="다음 달"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3FF] text-xl font-black text-[#8A94A8]"
              onClick={() => moveMonth(1)}
              type="button"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-[#F8FAFF] px-4 py-3">
          <div className="flex items-center justify-between text-sm font-bold text-[#8A94A8]">
            <span>월간 완료율</span>
            <span className="text-[#5B5CE2]">{tracker?.monthly_completion_rate ?? 0}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FF7FA3] to-[#7C7BFF]"
              style={{ width: `${tracker?.monthly_completion_rate ?? 0}%` }}
            />
          </div>
        </div>

        {loading ? <p className="mt-6 text-center text-sm font-bold text-[#98A1B3]">불러오는 중...</p> : null}
        {error ? <p className="mt-6 text-center text-sm font-bold text-red-500">{error}</p> : null}

        {!loading && !error ? (
          <>
            <div className="mt-6 grid grid-cols-7 gap-2 text-center">
              {weekdayLabels.map((label) => (
                <div className="text-xs font-black text-[#A8AFBF]" key={label}>
                  {label}
                </div>
              ))}
              {calendarDays.map(({ date, dateKey, day, inMonth }) => {
                const isToday = dateKey === todayKey;
                const hasTasks = Boolean(day?.has_tasks);
                const isCompleted = Boolean(day?.is_completed);
                const dayNumber = date.getDate();

                return (
                  <div
                    className={cn(
                      "relative flex aspect-square min-h-[40px] items-center justify-center rounded-full text-xs font-black transition",
                      !inMonth && "text-gray-300",
                      inMonth && !hasTasks && "text-[#C3C8D5]",
                      inMonth && hasTasks && !isCompleted && "bg-[#EEF2FF] text-[#8A94A8]",
                      isCompleted && "bg-gradient-to-br from-[#FF6F91] to-[#FF9DB7] text-white shadow-[0_8px_18px_rgba(255,111,145,0.28)]",
                      isToday && "ring-2 ring-[#5B5CE2] ring-offset-2 ring-offset-white",
                    )}
                    key={dateKey}
                  >
                    {isCompleted ? (
                      <div className="flex flex-col items-center leading-none">
                        <span className="text-base">★</span>
                        <span className="mt-0.5 text-[9px]">해냄 완료</span>
                      </div>
                    ) : (
                      dayNumber
                    )}
                  </div>
                );
              })}
            </div>

            {!hasTaskDays ? (
              <div className="mt-6 rounded-2xl border border-dashed border-[#E3E7F2] bg-[#FAFBFF] p-5 text-center text-sm font-bold text-[#98A1B3]">
                이번 달에는 아직 배정된 할 일이 없습니다.
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <StudentBottomNav />
    </ScreenShell>
  );
}
