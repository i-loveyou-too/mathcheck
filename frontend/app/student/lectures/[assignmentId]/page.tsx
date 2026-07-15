"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { cn } from "@/lib/utils";

type LectureWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type DailyTaskStatus = "todo" | "in_progress" | "done";

type LectureTaskItemProgress = {
  lecture_number: number;
  title: string;
  is_done: boolean;
  updated_at?: string | null;
};

type LectureDailyTask = {
  id: number;
  title: string;
  detail: string | null;
  task_date: string | null;
  due_date: string | null;
  status: DailyTaskStatus;
  progress_rate: number;
  completed_at: string | null;
  lecture_assignment_id: number | null;
  lecture_start_number: number | null;
  lecture_end_number: number | null;
  lecture_items: LectureTaskItemProgress[];
};

type LectureAssignmentDetail = {
  id: number;
  student_id: number;
  subject: string;
  course_title: string;
  total_lectures: number;
  start_lecture_no: number;
  lectures_per_day: number;
  weekdays: LectureWeekday[];
  start_date: string;
  due_date: string;
  memo: string | null;
  status: string;
  created_at: string;
};

type LectureAssignmentDetailResponse = {
  assignment: LectureAssignmentDetail;
  daily_tasks: LectureDailyTask[];
  total_lectures_to_assign: number;
  completed_lecture_count: number;
  remaining_lecture_count: number;
  progress_rate: number;
};

const WEEKDAY_KOR: Record<LectureWeekday, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

function formatDot(dateStr: string) {
  const d = parseDateKey(dateStr);
  return `${d.getFullYear()}.${`${d.getMonth() + 1}`.padStart(2, "0")}.${`${d.getDate()}`.padStart(2, "0")}`;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatMonthDay(dateStr: string) {
  const d = parseDateKey(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[d.getDay()]})`;
}

function remainingDaysUntil(dueDate: string, todayKey: string) {
  const diffMs = parseDateKey(dueDate).getTime() - parseDateKey(todayKey).getTime();
  return Math.max(Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1, 0);
}

function rangeLabel(task: LectureDailyTask) {
  if (task.lecture_start_number === null || task.lecture_end_number === null) return "-";
  if (task.lecture_start_number === task.lecture_end_number) return `${task.lecture_start_number}강`;
  return `${task.lecture_start_number}~${task.lecture_end_number}강`;
}

function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[20px] border border-[#EEF2FF] bg-white px-3 py-4 text-center shadow-card">
      <p className="text-sm font-black text-[#17213B]">{label}</p>
      <div className="mt-2 flex items-center justify-center gap-1.5">
        <span className="text-xl">{icon}</span>
        <span className="text-2xl font-black tracking-tight text-[#17213B]">{value}</span>
      </div>
    </div>
  );
}

export default function StudentLectureDetailPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const today = toLocalDateKey(new Date());

  const [studentId, setStudentId] = useState<number | null>(null);
  const [detail, setDetail] = useState<LectureAssignmentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  const fetchDetail = useCallback(async (sid: number) => {
    const data = await apiFetch<LectureAssignmentDetailResponse>(
      `/student/lecture-assignments/${params.assignmentId}?student_id=${sid}`,
    );
    setDetail(data);
  }, [params.assignmentId]);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);

    setLoading(true);
    setError("");
    fetchDetail(student.id)
      .catch(() => setError("인강 배정 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [fetchDetail, router]);

  const toggleLectureItem = async (task: LectureDailyTask, item: LectureTaskItemProgress) => {
    if (studentId === null) return;
    const key = `${task.id}-${item.lecture_number}`;
    setSavingKey(key);
    setError("");
    try {
      await apiFetch(`/student/daily-tasks/${task.id}/lecture-items/${item.lecture_number}`, {
        method: "PATCH",
        body: { student_id: studentId, is_done: !item.is_done },
      });
      await fetchDetail(studentId);
    } catch {
      setError("저장하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <ScreenShell withBottomNav>
        <p className="pt-10 text-center text-sm font-bold text-gray-400">불러오는 중...</p>
      </ScreenShell>
    );
  }

  if (!detail) {
    return (
      <ScreenShell withBottomNav>
        <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-600" href="/student/today">
          <span>←</span>
          <span>오늘의 미션</span>
        </Link>
        <p className="pt-10 text-center text-sm font-bold text-red-400">{error || "인강 배정 정보를 찾을 수 없습니다."}</p>
      </ScreenShell>
    );
  }

  const { assignment, daily_tasks: tasks } = detail;
  const sortedTasks = [...tasks].sort((a, b) => (a.task_date ?? "").localeCompare(b.task_date ?? ""));
  const todayTasks = sortedTasks.filter((t) => t.task_date === today);
  const remainingDays = remainingDaysUntil(assignment.due_date, today);

  return (
    <ScreenShell withBottomNav>
      <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 transition hover:text-gray-600" href="/student/today">
        <svg fill="currentColor" height="15" viewBox="0 0 24 24" width="15">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        오늘의 미션
      </Link>

      <section className="relative overflow-hidden rounded-[28px] border border-[#EEF2FF] bg-white p-5 shadow-card">
        <span className="inline-flex rounded-full bg-[#F1EDFF] px-3 py-1.5 text-xs font-black text-[#635BFF]">
          {assignment.subject}
        </span>
        <h1 className="mt-3 max-w-[70%] text-xl font-black leading-snug tracking-tight text-[#17213B]">
          {assignment.course_title}
        </h1>
        <div className="mt-3 space-y-1.5 text-xs font-bold text-[#8A94A8]">
          <p>📅 {formatDot(assignment.start_date)} ~ {formatDot(assignment.due_date)}</p>
          <p>🗓 {assignment.weekdays.map((w) => WEEKDAY_KOR[w]).join(" · ")} ｜ 하루 {assignment.lectures_per_day}강</p>
        </div>

        <div className="absolute right-3 top-3 h-24 w-24 sm:h-28 sm:w-28">
          <Image alt="" className="object-contain" fill priority src="/video%20cat.png" />
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold text-[#98A1B3]">전체 진행률</p>
          <div className="mt-1 flex items-end gap-3">
            <span className="text-4xl font-black tracking-tight text-[#635BFF]">{detail.progress_rate}%</span>
            <span className="pb-1.5 text-sm font-bold text-[#8A94A8]">
              완료 {detail.completed_lecture_count}강 / 전체 {detail.total_lectures_to_assign}강
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#F1EEFF]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#635BFF_0%,#7C71FF_100%)] transition-all duration-500"
              style={{ width: `${detail.progress_rate}%` }}
            />
          </div>
        </div>
      </section>

      <section className="flex gap-3">
        <StatTile icon="✅" label="완료 강의" value={`${detail.completed_lecture_count}강`} />
        <StatTile icon="⏰" label="남은 강의" value={`${detail.remaining_lecture_count}강`} />
        <StatTile icon="📅" label="남은 수강일" value={`${remainingDays}일`} />
      </section>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{error}</p> : null}

      <section className="rounded-[28px] border border-[#EEF2FF] bg-white p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-[#17213B]">오늘의 강의</h2>
          {todayTasks.length > 0 ? (
            <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-black text-[#4F46E5]">오늘</span>
          ) : null}
        </div>
        {todayTasks.length === 0 ? (
          <p className="rounded-2xl bg-[#F8FAFC] px-4 py-6 text-center text-sm font-bold text-[#98A1B3]">오늘 배정된 강의가 없어요.</p>
        ) : (
          <div className="space-y-3">
            {todayTasks.map((task) => (
              <div key={task.id}>
                <p className="mb-2 text-xs font-bold text-[#98A1B3]">오늘은 {rangeLabel(task)}</p>
                <div className="grid grid-cols-1 gap-2">
                  {task.lecture_items.map((item) => {
                    const key = `${task.id}-${item.lecture_number}`;
                    return (
                      <button
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60",
                          item.is_done ? "border-[#BBF7D0] bg-[#F0FDF4]" : "border-[#E5E7EB] bg-white hover:border-[#C7D2FE]",
                        )}
                        disabled={savingKey === key}
                        key={key}
                        onClick={() => void toggleLectureItem(task, item)}
                        type="button"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black transition",
                              item.is_done ? "border-[#22C55E] bg-[#22C55E] text-white" : "border-[#C7D2FE] bg-white text-transparent",
                            )}
                          >
                            ✓
                          </span>
                          <span className={cn("text-sm font-bold", item.is_done ? "text-[#16A34A]" : "text-[#17213B]")}>
                            {item.title}
                          </span>
                        </div>
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black", item.is_done ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F1F0FF] text-[#6D73FF]")}>
                          {item.is_done ? "완료" : "예정"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-[#EEF2FF] bg-white p-5 shadow-card">
        <h2 className="mb-3 text-base font-black text-[#17213B]">전체 수강 일정</h2>
        <div className="space-y-2">
          {sortedTasks.map((task) => {
            const isToday = task.task_date === today;
            const isDone = task.status === "done";
            const doneCount = task.lecture_items.filter((item) => item.is_done).length;
            const totalCount = task.lecture_items.length;
            const isExpanded = expandedTaskId === task.id;

            return (
              <div
                className={cn(
                  "rounded-2xl border px-4 py-3 transition",
                  isDone ? "border-[#BBF7D0] bg-[#F0FDF4]" : isToday ? "border-[#C7D2FE] bg-[#EEF2FF]" : "border-[#EEF2FF] bg-white",
                )}
                key={task.id}
              >
                <button
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                  type="button"
                >
                  <div className="min-w-0">
                    <p className={cn("text-sm font-black", isDone ? "text-[#16A34A]" : "text-[#17213B]")}>
                      {formatMonthDay(task.task_date ?? assignment.start_date)}
                      {isToday ? <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black text-[#4F46E5]">오늘</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-[#8A94A8]">{rangeLabel(task)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black", isDone ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F1F0FF] text-[#6D73FF]")}>
                      {doneCount}/{totalCount} {isDone ? "완료" : "예정"}
                    </span>
                    <span className="text-xs font-black text-[#98A1B3]">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-black/5 pt-3 sm:grid-cols-3">
                    {task.lecture_items.map((item) => {
                      const key = `${task.id}-${item.lecture_number}`;
                      return (
                        <button
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition disabled:opacity-60",
                            item.is_done ? "border-[#BBF7D0] bg-white" : "border-[#E5E7EB] bg-white hover:border-[#C7D2FE]",
                          )}
                          disabled={savingKey === key}
                          key={key}
                          onClick={() => void toggleLectureItem(task, item)}
                          type="button"
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-black transition",
                              item.is_done ? "border-[#22C55E] bg-[#22C55E] text-white" : "border-[#D0D5DD] bg-white text-transparent",
                            )}
                          >
                            ✓
                          </span>
                          <span className={cn("truncate text-xs font-bold", item.is_done ? "text-[#16A34A]" : "text-[#344054]")}>{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-[28px] border border-[#EEF2FF] bg-white p-5 shadow-card">
        <h2 className="mb-3 text-base font-black text-[#17213B]">강의 정보</h2>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="font-bold text-[#98A1B3]">📖 전체 강의 수</p>
            <p className="mt-1 text-sm font-black text-[#17213B]">{assignment.total_lectures}강</p>
          </div>
          <div>
            <p className="font-bold text-[#98A1B3]">▶ 시작 강의 번호</p>
            <p className="mt-1 text-sm font-black text-[#17213B]">{assignment.start_lecture_no}강</p>
          </div>
          <div>
            <p className="font-bold text-[#98A1B3]">🗓 하루 수강 강의 수</p>
            <p className="mt-1 text-sm font-black text-[#17213B]">{assignment.lectures_per_day}강</p>
          </div>
          <div>
            <p className="font-bold text-[#98A1B3]">🗓 수강 요일</p>
            <p className="mt-1 text-sm font-black text-[#17213B]">{assignment.weekdays.map((w) => WEEKDAY_KOR[w]).join(" · ")}</p>
          </div>
          <div>
            <p className="font-bold text-[#98A1B3]">📆 시작일</p>
            <p className="mt-1 text-sm font-black text-[#17213B]">{formatDot(assignment.start_date)}</p>
          </div>
          <div>
            <p className="font-bold text-[#98A1B3]">📆 마감일</p>
            <p className="mt-1 text-sm font-black text-[#17213B]">{formatDot(assignment.due_date)}</p>
          </div>
        </div>
        {assignment.memo ? (
          <div className="mt-4 rounded-2xl bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs font-bold text-[#98A1B3]">메모</p>
            <p className="mt-1 text-sm font-semibold text-[#344054]">{assignment.memo}</p>
          </div>
        ) : null}
      </section>

      <StudentBottomNav />
    </ScreenShell>
  );
}
