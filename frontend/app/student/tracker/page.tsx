"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getStudyDate, getStudyDateObject } from "@/lib/study-date";
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
  const today = useMemo(() => getStudyDateObject(), []);
  const todayKey = useMemo(() => getStudyDate(), []);
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

  const streak = tracker?.current_streak ?? 0;
  const completionRate = tracker?.monthly_completion_rate ?? 0;

  return (
    <ScreenShell withBottomNav variant="student">

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#1F2933]">
            {STUDENT_PAGE_TITLES.tracker}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-[#667085]">
            매일 해낸 기록이 나의 루틴이 돼요.
          </p>
        </div>
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#1F2933]"
          type="button"
        >
          <span>📅</span>
          <span>챌린지 관리</span>
        </button>
      </div>

      {/* Hero 카드 */}
      <section className="relative overflow-hidden rounded-[20px] border border-[#F1D8D7] bg-[#FFF8F7] shadow-card md:mx-auto md:w-full md:max-w-[760px]">
        <div className="flex min-h-[160px] items-center">

          {/* 왼쪽 텍스트 영역 */}
          <div className="flex min-w-0 flex-1 flex-col py-5 pl-5 pr-2">

            {/* 오늘의 챌린지 pill */}
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-[#E86F6B]">
              오늘의 챌린지
            </span>

            {/* 메인 타이틀 */}
            <p className="mt-1.5 text-[1.6rem] font-black leading-[1.1] tracking-tight">
              <span className="text-[#E86F6B]">갓생</span>
              <span className="text-[#1F2933]"> 챌린지</span>
            </p>

            {/* 서브텍스트 */}
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-gray-500">
              오늘도 해내면 갓생에 한 걸음 더 가까워져요
            </p>

            {/* 연속 학습 pill */}
            <div className="mt-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-gray-700 shadow-sm">
                🔥
                <span>
                  연속 학습{" "}
                  <span className="font-black text-[#E86F6B]">{streak}</span>
                  일째
                </span>
              </span>
            </div>

            {/* 하단 소문구 */}
            <p className="mt-2 text-[10px] font-medium text-gray-400">
              꾸준함이 실력을 만들어요
            </p>
          </div>

          {/* 오른쪽 — 고양이 + DAY 배지 */}
          <div className="relative w-[42%] shrink-0 self-stretch">
            <Image
              src="/hero-cat.png"
              alt=""
              fill
              className="object-contain object-center"
              priority
            />
            {/* DAY 배지 */}
            <div className="absolute bottom-[8%] right-[5%] z-10 flex h-[54px] w-[54px] flex-col items-center justify-center rounded-full bg-white shadow-card">
              <span className="text-[22px] font-black leading-none text-[#E86F6B]">{streak}</span>
              <span className="mt-0.5 text-[9px] font-black tracking-widest text-gray-400">DAY</span>
            </div>
          </div>

        </div>
      </section>

      {/* 월간 챌린지 기록 */}
      <section className="rounded-[20px] border border-[#E5E7EB] bg-white p-5 shadow-card md:mx-auto md:w-full md:max-w-[760px]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-[#1F2933]">{month}월 챌린지 기록</h2>
            <p className="mt-0.5 text-sm font-bold text-gray-400">
              {tracker
                ? `${tracker.monthly_done_days} / ${tracker.monthly_total_task_days}일 완료`
                : "불러오는 중..."}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              aria-label="이전 달"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg font-black text-gray-500 transition hover:bg-gray-200"
              onClick={() => moveMonth(-1)}
              type="button"
            >
              ‹
            </button>
            <button
              aria-label="다음 달"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg font-black text-gray-500 transition hover:bg-gray-200"
              onClick={() => moveMonth(1)}
              type="button"
            >
              ›
            </button>
          </div>
        </div>

        {/* 완료율 바 */}
        <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-gray-500">월간 완료율</span>
            <span className="font-black text-[#E86F6B]">{completionRate}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-[#E86F6B] transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {loading ? (
          <p className="mt-6 text-center text-sm font-bold text-gray-400">불러오는 중...</p>
        ) : null}
        {error ? (
          <p className="mt-6 text-center text-sm font-bold text-red-500">{error}</p>
        ) : null}

        {!loading && !error ? (
          <>
            {/* 캘린더 */}
            <div className="mt-5 grid grid-cols-7 gap-1 text-center">
              {weekdayLabels.map((label) => (
                <div className="pb-2 text-xs font-black text-gray-400" key={label}>
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
                      !inMonth && "text-gray-200",
                      inMonth && !hasTasks && "text-gray-300",
                      inMonth && hasTasks && !isCompleted && "bg-gray-100 text-gray-500",
                      isCompleted &&
                        "bg-[#E86F6B] text-white shadow-[0_4px_12px_rgba(232,111,107,0.25)]",
                      isToday &&
                        !isCompleted &&
                        "ring-2 ring-[#E86F6B] ring-offset-1 ring-offset-white",
                      isToday && isCompleted && "ring-2 ring-[#C8433F] ring-offset-1",
                    )}
                    key={dateKey}
                  >
                    {isCompleted ? (
                      <div className="flex flex-col items-center leading-none">
                        <span className="text-sm leading-none">🔥</span>
                        <span className="mt-0.5 text-[8px] font-black">해냄 완료</span>
                      </div>
                    ) : (
                      dayNumber
                    )}
                  </div>
                );
              })}
            </div>

            {!hasTaskDays ? (
              <div className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center text-sm font-bold text-gray-400">
                이번 달에는 아직 배정된 할 일이 없습니다.
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {/* 격려 카드 */}
      <div className="flex items-center gap-4 rounded-[20px] border border-[#F1D8D7] bg-[#FFF8F7] p-4 md:mx-auto md:w-full md:max-w-[760px]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF1F0] text-lg">
          🔥
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-700">
            작은 실천이 쌓여 큰 변화를 만들어요.
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            오늘도 한 걸음, 갓생을 향해 나아가요! ✨
          </p>
        </div>
        <span className="shrink-0 text-xl font-bold text-gray-300">›</span>
      </div>

      <StudentBottomNav />
    </ScreenShell>
  );
}
