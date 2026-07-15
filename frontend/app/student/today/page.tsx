"use client";

import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentLogoutButton } from "@/components/student-logout-button";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { clearStudent, getStudent } from "@/lib/storage";
import { STUDENT_PAGE_TITLES } from "@/lib/student-page-titles";
import { cn } from "@/lib/utils";

type DailyTaskStatus = "todo" | "in_progress" | "done";

type LectureTaskItemProgress = {
  lecture_number: number;
  title: string;
  is_done: boolean;
  updated_at?: string | null;
};

type DailyTask = {
  id: number;
  category: string | null;
  completion_mode?: "item_progress" | "manual";
  completed_at?: string | null;
  detail: string | null;
  difficulty: string | null;
  due_date?: string | null;
  end_item_number: number | null;
  order_index: number;
  progress_rate?: number;
  range_type?: "item" | "page" | "section" | "custom" | null;
  start_item_number: number | null;
  status: DailyTaskStatus;
  textbook?: {
    id: number;
    subject: string | null;
    title: string;
    full_title: string;
  } | null;
  textbook_id: number | null;
  textbook_key: string | null;
  title: string;
  lecture_items?: LectureTaskItemProgress[];
  source_type?: "manual" | "homework" | "lecture";
  lecture_assignment_id?: number | null;
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

type ItemRangeTaskCard = {
  id: number;
  title: string;
  detail: string | null;
  task_date: string;
  due_date: string | null;
  textbook_id: number | null;
  textbook_key: string | null;
  textbook_title: string | null;
  range_label: string | null;
  status: DailyTaskStatus;
  progress_rate: number;
  is_overdue: boolean;
};

type LectureTaskDisplay = {
  courseTitle: string;
  memo: string | null;
  subject: string | null;
  rangeLabel: string;
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
  if (label === "rate") return "◎";
  if (label === "goal") return "◇";
  return "●";
}

function formatCardDate(dateKey: string) {
  const date = parseLocalDateKey(dateKey);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function isProblemRangeTask(task: DailyTask) {
  return (
    task.range_type === "item" ||
    task.completion_mode === "item_progress" ||
    (task.start_item_number !== null && task.end_item_number !== null)
  );
}

function buildItemRangeLabel(task: DailyTask) {
  if (task.start_item_number !== null && task.end_item_number !== null) {
    return `${task.start_item_number}~${task.end_item_number}번`;
  }
  return task.title;
}

function toItemRangeTaskCard(task: DailyTask, taskDate: string, todayKey: string): ItemRangeTaskCard {
  return {
    id: task.id,
    title: task.title,
    detail: task.detail,
    task_date: taskDate,
    due_date: task.due_date ?? null,
    textbook_id: task.textbook_id,
    textbook_key: task.textbook_key,
    textbook_title: task.textbook?.full_title ?? null,
    range_label: buildItemRangeLabel(task),
    status: task.status,
    progress_rate: task.progress_rate ?? (task.status === "done" ? 100 : 0),
    is_overdue: taskDate < todayKey && task.status !== "done",
  };
}

function buildLectureTaskDisplay(task: DailyTask): LectureTaskDisplay {
  const detailParts = task.detail?.split(" / ").map((part) => part.trim()).filter(Boolean) ?? [];
  const subject = detailParts[0] ?? null;
  const memo = detailParts.slice(1).join(" / ") || null;
  const titleMatch = task.title.match(/^(.*?)(\d+)\s*~\s*(\d+)강$/);

  if (titleMatch) {
    return {
      courseTitle: titleMatch[1]?.trim() || task.title,
      memo,
      subject,
      rangeLabel: `${titleMatch[2]}~${titleMatch[3]}강`,
    };
  }

  return {
    courseTitle: task.title,
    memo,
    subject,
    rangeLabel: "강의 범위 확인",
  };
}

function isLectureTaskDone(task: DailyTask) {
  if (task.source_type !== "lecture") {
    return task.status === "done";
  }

  if ((task.lecture_items?.length ?? 0) > 0) {
    return task.lecture_items?.every((item) => item.is_done) ?? false;
  }

  return task.status === "done";
}

function summarizeTasks(tasks: DailyTask[]) {
  const total = tasks.length;
  const done = tasks.filter(isLectureTaskDone).length;

  return {
    total,
    done,
    todo: total - done,
    completion_rate: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

function containsMathKeyword(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return value.toLowerCase().includes("수학") || value.toLowerCase().includes("math");
}

function isMathPriorityTask(task: DailyTask) {
  return (
    containsMathKeyword(task.category) ||
    containsMathKeyword(task.title) ||
    containsMathKeyword(task.detail) ||
    containsMathKeyword(task.textbook?.subject) ||
    containsMathKeyword(task.textbook?.title) ||
    containsMathKeyword(task.textbook?.full_title)
  );
}

function HomeworkTaskCardItem({
  card,
  onOpenTextbook,
}: {
  card: ItemRangeTaskCard;
  onOpenTextbook: (card: ItemRangeTaskCard) => void;
}) {
  const isDone = card.status === "done";

  return (
    <article
      className={cn(
        "rounded-[24px] px-4 py-4 shadow-card transition",
        isDone ? "border border-[#EEF2FF] bg-[#F8FAFF]" : "border border-gray-100 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {card.textbook_title ? (
            <p className="truncate text-xs font-bold text-[#6D73FF]">{card.textbook_title}</p>
          ) : null}
          <h3
            className={cn(
              "mt-0.5 truncate text-[1rem] font-black leading-snug text-[#17213B]",
              isDone ? "text-[#9AA3B6] line-through" : "",
            )}
          >
            {card.range_label ?? card.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#98A1B3]">
            <span>{formatCardDate(card.task_date)}</span>
            {card.due_date ? <span>· 마감 {formatCardDate(card.due_date)}</span> : null}
            {card.is_overdue ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-500">밀림</span>
            ) : null}
          </div>
          {card.detail ? (
            <p className="mt-1.5 truncate text-xs font-medium text-[#98A1B3]">메모 {card.detail}</p>
          ) : null}

          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-indigo-50">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#6676FF_0%,#8E84FF_100%)] transition-all duration-500"
                style={{ width: `${card.progress_rate}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs font-bold text-indigo-400">{card.progress_rate}%</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            className="rounded-full bg-[#0F172A] px-3.5 py-2 text-xs font-black text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!card.textbook_key}
            onClick={() => onOpenTextbook(card)}
            type="button"
          >
            교재로 이동
          </button>
        </div>
      </div>
    </article>
  );
}

function StandardTaskItem({
  task,
  onOpenTask,
  onToggleTaskStatus,
}: {
  task: DailyTask;
  onOpenTask: (task: DailyTask) => void;
  onToggleTaskStatus: (task: DailyTask, event: MouseEvent<HTMLButtonElement>) => Promise<void>;
}) {
  return (
    <article
      className={cn(
        "flex min-h-[96px] w-full items-center gap-3 rounded-[28px] px-4 py-4 text-left shadow-card transition",
        task.textbook_key ? "cursor-pointer" : "",
        getTaskCardClass(task.status),
      )}
      onClick={() => onOpenTask(task)}
    >
      <button
        aria-label={`${task.title} 완료 상태 변경`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#B8C1FF] bg-white text-sm font-black text-transparent transition"
        onClick={(event) => void onToggleTaskStatus(task, event)}
        type="button"
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[1.05rem] font-black leading-snug text-[#17213B]">{task.title}</h3>
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
        ·
      </div>
    </article>
  );
}

function LectureTaskItem({
  task,
  taskDate,
  onToggleLectureItem,
}: {
  task: DailyTask;
  taskDate: string;
  onToggleLectureItem: (
    task: DailyTask,
    lectureItem: LectureTaskItemProgress,
    event: MouseEvent<HTMLButtonElement>,
  ) => Promise<void>;
}) {
  const display = buildLectureTaskDisplay(task);
  const isDone = task.status === "done";
  const lectureItems = task.lecture_items ?? [];

  return (
    <article
      className={cn(
        "flex min-h-[108px] w-full items-center gap-3 rounded-[24px] border px-4 py-4 shadow-card transition",
        isDone ? "border-[#DCFCE7] bg-[#F8FAFC]" : "border-[#C7D2FE] bg-white",
      )}
    >
      <button
        aria-label={`${task.title} 완료 상태 변경`}
        className={cn(
          "hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black transition",
          isDone ? "border-[#22C55E] bg-[#22C55E] text-white" : "border-[#C7D2FE] bg-white text-transparent",
        )}
        onClick={() => {}}
        type="button"
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        {display.subject ? (
          <p className="truncate text-[11px] font-bold text-[#4F46E5]">{display.subject}</p>
        ) : null}
        <h3
          className={cn(
            "mt-0.5 truncate text-[15px] font-bold leading-snug text-[#17213B]",
            isDone ? "text-[#9AA3B6] line-through" : "",
          )}
        >
          {display.courseTitle}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-bold text-[#4F46E5]">
            {display.rangeLabel}
          </span>
          <span className="text-xs font-medium text-[#98A1B3]">
            {formatCardDate(taskDate)}
          </span>
          {task.due_date ? (
            <span className="text-xs font-medium text-[#98A1B3]">
              마감 {formatCardDate(task.due_date)}
            </span>
          ) : null}
        </div>
        {display.memo ? (
          <p className="mt-2 truncate text-xs font-medium text-[#98A1B3]">{display.memo}</p>
        ) : null}
        {(task.lecture_items ?? []).length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(task.lecture_items ?? []).map((lectureItem) => (
              <button
                key={`${task.id}-${lectureItem.lecture_number}`}
                aria-label={`${display.courseTitle} ${lectureItem.title} 완료 상태 변경`}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border px-3 py-2 text-left transition",
                  lectureItem.is_done
                    ? "border-[#BBF7D0] bg-[#F0FDF4]"
                    : "border-[#E5E7EB] bg-white hover:border-[#C7D2FE]",
                )}
                onClick={(event) => void onToggleLectureItem(task, lectureItem, event)}
                type="button"
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black transition",
                    lectureItem.is_done
                      ? "border-[#22C55E] bg-[#22C55E] text-white"
                      : "border-[#D0D5DD] bg-white text-transparent",
                  )}
                >
                  ✓
                </span>
                <span
                  className={cn(
                    "text-sm font-bold",
                    lectureItem.is_done ? "text-[#16A34A]" : "text-[#344054]",
                  )}
                >
                  {lectureItem.title}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {isDone ? (
        <span className="shrink-0 rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-bold text-[#16A34A]">
          {getStatusLabel(task.status)}
        </span>
      ) : (
        <button
          className="hidden shrink-0 rounded-full bg-[#0F172A] px-3.5 py-2 text-xs font-black text-white transition hover:bg-[#1E293B]"
          onClick={() => {}}
          type="button"
        >
          완료하기
        </button>
      )}
      <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F7F8FC] text-2xl">
        🎬
      </div>
    </article>
  );
}

function CompletedStandardTaskItem({
  task,
  onToggleTaskStatus,
}: {
  task: DailyTask;
  onToggleTaskStatus: (task: DailyTask, event: MouseEvent<HTMLButtonElement>) => Promise<void>;
}) {
  return (
    <article className="flex items-center gap-3 rounded-[22px] border border-[#EEF2FF] bg-[#F8FAFF] px-4 py-3 opacity-55">
      <button
        aria-label={`${task.title} 완료 상태 변경`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#6D73FF] bg-[#6D73FF] text-sm font-black text-white shadow-[0_4px_10px_rgba(109,115,255,0.22)] transition"
        onClick={(event) => void onToggleTaskStatus(task, event)}
        type="button"
      >
        ✓
      </button>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#9AA3B6] line-through">{task.title}</p>
    </article>
  );
}

function LectureTaskCard({
  task,
  taskDate,
  onOpenLecture,
  onToggleLectureItem,
}: {
  task: DailyTask;
  taskDate: string;
  onOpenLecture: (task: DailyTask) => void;
  onToggleLectureItem: (
    task: DailyTask,
    lectureItem: LectureTaskItemProgress,
    event: MouseEvent<HTMLButtonElement>,
  ) => Promise<void>;
}) {
  const display = buildLectureTaskDisplay(task);
  const lectureItems = task.lecture_items ?? [];
  const doneCount = lectureItems.filter((item) => item.is_done).length;
  const totalCount = lectureItems.length;
  const progressRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const isDone = task.status === "done";

  return (
    <article
      className={cn(
        "rounded-[24px] border border-[#D9D6FF] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(109,115,255,0.08)] transition",
        task.lecture_assignment_id ? "cursor-pointer hover:border-[#C4B5FD]" : "",
      )}
      onClick={() => onOpenLecture(task)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {display.subject ? (
            <span className="inline-flex rounded-2xl bg-[#F1EDFF] px-4 py-2 text-sm font-black text-[#635BFF]">
              {display.subject}
            </span>
          ) : null}
          <h3 className="mt-4 truncate text-[16px] font-black leading-snug text-[#17213B]">
            {display.courseTitle}
          </h3>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#F3F0FF] px-4 py-2 text-[13px] font-black text-[#635BFF]">
              {display.rangeLabel}
            </span>
            <span className="text-[13px] font-bold text-[#98A1B3]">{formatCardDate(taskDate)}</span>
            {task.due_date ? (
              <span className="text-[13px] font-bold text-[#8C82FF]">마감 {formatCardDate(task.due_date)}</span>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-black",
            isDone ? "bg-[#E8F8EC] text-[#2BA24C]" : "bg-[#F1EDFF] text-[#635BFF]",
          )}
        >
          {isDone ? "완료" : "진행 중"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {lectureItems.map((lectureItem) => (
          <button
            key={`${task.id}-${lectureItem.lecture_number}`}
            aria-label={`${display.courseTitle} ${lectureItem.title} 완료 상태 변경`}
            className={cn(
              "flex min-h-[40px] items-center gap-1.5 rounded-[14px] border px-2.5 py-2 text-left transition",
              lectureItem.is_done
                ? "border-[#E5E7EB] bg-[#F8FAFC] text-[#98A2B3] opacity-65"
                : "border-[#DDD6FE] bg-white text-[#17213B] shadow-[0_4px_14px_rgba(109,115,255,0.08)] hover:border-[#C4B5FD]",
            )}
            onClick={(event) => void onToggleLectureItem(task, lectureItem, event)}
            type="button"
          >
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-black transition",
                lectureItem.is_done
                  ? "border-[#D1D5DB] bg-[#E5E7EB] text-[#6B7280]"
                  : "border-[#B8BFCC] bg-white text-transparent",
              )}
            >
              ✓
            </span>
            <span
              className={cn(
                "truncate text-[11px] font-black",
                lectureItem.is_done ? "text-[#98A2B3]" : "text-[#17213B]",
              )}
            >
              {lectureItem.title}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <p className="shrink-0 text-sm font-black text-[#635BFF]">
          {doneCount}/{totalCount}강 완료
        </p>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#F1EEFF]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#635BFF_0%,#7C71FF_100%)] transition-all duration-500"
            style={{ width: `${progressRate}%` }}
          />
        </div>
        <p className="shrink-0 text-sm font-black text-[#635BFF]">{progressRate}%</p>
      </div>
    </article>
  );
}

function CompletedMissionTaskCard({
  task,
  taskDate,
  onOpenTask,
}: {
  task: DailyTask;
  taskDate: string;
  onOpenTask: (task: DailyTask) => void;
}) {
  return (
    <article className="rounded-[24px] border border-[#D9D6FF] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(109,115,255,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-2xl bg-[#F1EDFF] px-4 py-2 text-sm font-black text-[#635BFF]">
            {task.category ?? "완료"}
          </span>
          <h3 className="mt-4 truncate text-[16px] font-black leading-snug text-[#17213B]">
            {task.title}
          </h3>
          {task.detail ? (
            <p className="mt-2 truncate text-sm font-bold text-[#A0A7B8] line-through">{task.detail}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-bold text-[#98A1B3]">{formatCardDate(taskDate)}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#E8F8EC] px-4 py-2 text-sm font-black text-[#2BA24C]">
          완료
        </span>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#F1EEFF]">
          <div className="h-full w-full rounded-full bg-[linear-gradient(90deg,#635BFF_0%,#7C71FF_100%)]" />
        </div>
        <p className="shrink-0 text-sm font-black text-[#635BFF]">100%</p>
      </div>
      {task.textbook_key ? (
        <div className="mt-5 flex justify-end">
          <button
            className="rounded-full border border-[#6D73FF] bg-white px-4 py-2 text-sm font-black text-[#6D73FF] transition hover:bg-[#F8FAFF]"
            onClick={() => onOpenTask(task)}
            type="button"
          >
            교재로 이동
          </button>
        </div>
      ) : null}
    </article>
  );
}

function CompletedHomeworkTaskCard({
  card,
  onOpenTextbook,
}: {
  card: ItemRangeTaskCard;
  onOpenTextbook: (card: ItemRangeTaskCard) => void;
}) {
  return (
    <article className="rounded-[24px] border border-[#D9D6FF] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(109,115,255,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {card.textbook_title ? (
            <span className="inline-flex rounded-2xl bg-[#F1EDFF] px-4 py-2 text-sm font-black text-[#635BFF]">
              {card.textbook_title}
            </span>
          ) : null}
          <h3 className="mt-4 truncate text-[16px] font-black leading-snug text-[#17213B]">
            {card.title}
          </h3>
          <p className="mt-2 truncate text-sm font-bold text-[#A0A7B8] line-through">
            {card.range_label ?? "-"}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-bold text-[#98A1B3]">{formatCardDate(card.task_date)}</span>
            {card.due_date ? (
              <span className="text-[13px] font-bold text-[#8C82FF]">마감 {formatCardDate(card.due_date)}</span>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#E8F8EC] px-4 py-2 text-sm font-black text-[#2BA24C]">
          완료
        </span>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#F1EEFF]">
          <div className="h-full w-full rounded-full bg-[linear-gradient(90deg,#635BFF_0%,#7C71FF_100%)]" />
        </div>
        <p className="shrink-0 text-sm font-black text-[#635BFF]">100%</p>
      </div>
      {card.textbook_key ? (
        <div className="mt-5 flex justify-end">
          <button
            className="rounded-full border border-[#6D73FF] bg-white px-4 py-2 text-sm font-black text-[#6D73FF] transition hover:bg-[#F8FAFF]"
            onClick={() => onOpenTextbook(card)}
            type="button"
          >
            교재로 이동
          </button>
        </div>
      ) : null}
    </article>
  );
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
        setLoadError("오늘의 미션을 불러오지 못했습니다.");
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
  const selectedTasks = selectedDay?.tasks ?? [];

  const itemRangeCards = useMemo(
    () =>
      selectedTasks
        .filter((task) => task.source_type !== "lecture")
        .filter(isProblemRangeTask)
        .map((task) => toItemRangeTaskCard(task, selectedDateKey, todayKey)),
    [selectedDateKey, selectedTasks, todayKey],
  );
  const lectureTasks = useMemo(
    () => selectedTasks.filter((task) => task.source_type === "lecture"),
    [selectedTasks],
  );
  const regularTasks = useMemo(
    () =>
      selectedTasks.filter(
        (task) => task.source_type !== "lecture" && !isProblemRangeTask(task),
      ),
    [selectedTasks],
  );

  const pendingItemRangeCards = itemRangeCards.filter((card) => card.status !== "done");
  const completedItemRangeCards = itemRangeCards.filter((card) => card.status === "done");
  const pendingRegularTasks = regularTasks.filter((task) => task.status !== "done");
  const completedRegularTasks = regularTasks.filter((task) => task.status === "done");
  const pendingNonLectureTasks = useMemo(
    () =>
      selectedTasks
        .filter((task) => task.source_type !== "lecture" && task.status !== "done")
        .sort((left, right) => {
          const leftPriority = isMathPriorityTask(left) ? 0 : 1;
          const rightPriority = isMathPriorityTask(right) ? 0 : 1;

          return leftPriority - rightPriority;
        }),
    [selectedTasks],
  );

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

  const progressSummary = useMemo(() => {
    const tasks = selectedTasks.filter((task) => {
      if (task.source_type !== "lecture") {
        return true;
      }

      return (task.lecture_items?.length ?? 0) > 0;
    });
    const summary = summarizeTasks(tasks);

    return {
      total: summary.total,
      done: summary.done,
      remaining: summary.todo,
      completionRate: summary.completion_rate,
    };
  }, [selectedTasks]);
  const progressRemaining = progressSummary.remaining;
  const progressCompletionRate = progressSummary.completionRate;

  const updateTaskInWeek = (taskId: number, status: DailyTaskStatus) => {
    setWeeklyData((current) => {
      if (!current) return current;

      const days = current.days.map((day) => {
        const nextTasks = day.tasks.map((task) => {
          if (task.id !== taskId) return task;
          return {
            ...task,
            status,
            progress_rate:
              task.completion_mode === "item_progress"
                ? task.progress_rate
              : status === "done"
                  ? 100
                  : 0,
          };
        });
        const summary = summarizeTasks(nextTasks);

        return {
          ...day,
          summary,
          tasks: nextTasks,
        };
      });

      return { ...current, days };
    });
  };

  const replaceTaskInWeek = (updatedTask: DailyTask) => {
    setWeeklyData((current) => {
      if (!current) return current;

      const days = current.days.map((day) => {
        const nextTasks = day.tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        const summary = summarizeTasks(nextTasks);

        return {
          ...day,
          summary,
          tasks: nextTasks,
        };
      });

      return { ...current, days };
    });
  };

  const toggleTaskStatus = async (task: DailyTask, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (studentId === null || isProblemRangeTask(task) || task.source_type === "lecture") {
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
      setSaveError("저장하지 못했습니다. 다시 시도해 주세요.");

      try {
        await fetchWeeklyTasks(studentId);
      } catch {
        setLoadError("오늘의 미션을 불러오지 못했습니다.");
      }
    }
  };

  const toggleLectureItem = async (
    task: DailyTask,
    lectureItem: LectureTaskItemProgress,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();

    if (studentId === null) {
      return;
    }

    const previousTask = task;
    const nextLectureItems = (task.lecture_items ?? []).map((item) =>
      item.lecture_number === lectureItem.lecture_number
        ? { ...item, is_done: !item.is_done }
        : item,
    );
    const doneCount = nextLectureItems.filter((item) => item.is_done).length;
    const nextTask: DailyTask = {
      ...task,
      lecture_items: nextLectureItems,
      status:
        doneCount === 0
          ? "todo"
          : doneCount === nextLectureItems.length
            ? "done"
            : "in_progress",
      progress_rate:
        nextLectureItems.length > 0
          ? Math.round((doneCount / nextLectureItems.length) * 100)
          : 0,
    };

    setSaveError("");
    replaceTaskInWeek(nextTask);

    try {
      const updatedTask = await apiFetch<DailyTask>(
        `/student/daily-tasks/${task.id}/lecture-items/${lectureItem.lecture_number}`,
        {
          method: "PATCH",
          body: {
            student_id: studentId,
            is_done: !lectureItem.is_done,
          },
        },
      );
      replaceTaskInWeek(updatedTask);
    } catch {
      replaceTaskInWeek(previousTask);
      setSaveError("??ν븯吏 紐삵뻽?듬땲?? ?ㅼ떆 ?쒕룄??二쇱꽭??");

      try {
        await fetchWeeklyTasks(studentId);
      } catch {
        setLoadError("?ㅻ뒛??誘몄뀡??遺덈윭?ㅼ? 紐삵뻽?듬땲??");
      }
    }
  };

  const openTask = (task: DailyTask) => {
    if (task.textbook_key) {
      router.push(`/student/textbooks/${task.textbook_key}`);
    }
  };

  const openHomeworkTextbook = (card: ItemRangeTaskCard) => {
    if (card.textbook_key) {
      router.push(`/student/textbooks/${card.textbook_key}`);
    }
  };

  const openLecture = (task: DailyTask) => {
    if (task.lecture_assignment_id) {
      router.push(`/student/lectures/${task.lecture_assignment_id}`);
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
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="text-[1.5rem] font-black tracking-tight text-[#17213B]">
            {STUDENT_PAGE_TITLES.today}
          </h1>
          <p className="mt-1 text-sm font-medium text-[#8A94A8]">오늘 해야 할 일을 하나씩 해내요</p>
        </div>
        <StudentLogoutButton onClick={handleLogout} />
      </div>

      <div className="rounded-[20px] border border-[#EEF2FF] bg-white px-5 py-3.5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-[#17213B]">
            {loading
              ? "불러오는 중..."
              : progressRemaining === 0 && progressSummary.total > 0
                ? "오늘 미션 모두 완료"
                : `${progressRemaining}개 남아있어요`}
          </p>
          <span className="shrink-0 text-sm font-black text-[#6D73FF]">{progressCompletionRate}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EDF7]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#6676FF_0%,#8E84FF_100%)] transition-all duration-500"
            style={{ width: `${progressCompletionRate}%` }}
          />
        </div>
      </div>

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

        {loading ? <p className="text-sm font-bold text-gray-400">불러오는 중...</p> : null}
        {loadError ? <p className="text-sm font-bold text-red-500">{loadError}</p> : null}
        {saveError ? (
          <p className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{saveError}</p>
        ) : null}

        {!loading && !loadError ? (
          <>
            {pendingNonLectureTasks.length > 0 ? (
              <div className="space-y-3">
                {pendingNonLectureTasks.map((task) =>
                  isProblemRangeTask(task) ? (
                    <HomeworkTaskCardItem
                      card={toItemRangeTaskCard(task, selectedDateKey, todayKey)}
                      key={`item-range-${task.id}`}
                      onOpenTextbook={openHomeworkTextbook}
                    />
                  ) : (
                    <StandardTaskItem
                      key={task.id}
                      onOpenTask={openTask}
                      onToggleTaskStatus={toggleTaskStatus}
                      task={task}
                    />
                  ),
                )}
              </div>
            ) : null}

            {completedRegularTasks.length > 0 || completedItemRangeCards.length > 0 ? (
              <>
                <p className="mb-2 mt-5 text-xs font-bold text-[#98A1B3]">이미 완료한 미션</p>
                <div className="space-y-2">
                  {completedRegularTasks.map((task) => (
                    <CompletedMissionTaskCard
                      key={task.id}
                      onOpenTask={openTask}
                      task={task}
                      taskDate={selectedDateKey}
                    />
                  ))}
                  {completedItemRangeCards.map((card) => (
                    <CompletedHomeworkTaskCard
                      card={card}
                      key={`item-range-done-${card.id}`}
                      onOpenTextbook={openHomeworkTextbook}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {lectureTasks.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-xs font-bold text-[#98A1B3]">인강 수강</p>
                <div className="space-y-3">
                  {lectureTasks.map((task) => (
                    <LectureTaskCard
                      key={`lecture-${task.id}`}
                      onOpenLecture={openLecture}
                      onToggleLectureItem={toggleLectureItem}
                      task={task}
                      taskDate={selectedDateKey}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {selectedTasks.length === 0 ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[#E4EAF6] bg-white px-4 py-6 text-center shadow-card">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F7FB] text-2xl">
                  ·
                </div>
                <p className="text-sm font-black text-[#17213B]">오늘 배정된 미션이 없어요</p>
                <p className="mt-1 text-xs font-semibold text-[#98A1B3]">잠깐 쉬어가도 괜찮아요.</p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

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
              ‹
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
              ›
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
                  오늘
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[30px] border border-[#EEF2FF] bg-white p-5 shadow-card">
        <p className="mb-4 text-sm font-black text-[#17213B]">주간 분석</p>
        <div className="grid grid-cols-3 divide-x divide-[#EEF1F7]">
          {[
            { key: "rate" as const, label: "진도율", value: `${weeklySummary.rate}%` },
            { key: "goal" as const, label: "목표", value: `${weeklySummary.total}개` },
            { key: "done" as const, label: "달성", value: `${weeklySummary.done}개` },
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
