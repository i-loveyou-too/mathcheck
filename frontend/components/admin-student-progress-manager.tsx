"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";

type DailyTaskStatus = "todo" | "in_progress" | "done";
type ItemProgressStatus = "not_started" | "partial" | "done";

type DailyTask = {
  id: number;
  title: string;
  detail: string | null;
  status: DailyTaskStatus;
  task_date?: string | null;
  textbook_key: string | null;
  textbook?: {
    full_title: string;
  } | null;
  source_type?: "manual" | "homework" | "lecture";
  completion_mode?: "manual" | "item_progress";
  lecture_items?: LectureTaskItemProgress[];
  lecture_assignment_id?: number | null;
};

type WeeklyTaskDay = {
  date: string;
  tasks: DailyTask[];
};

type WeeklyTasksResponse = {
  student_id: number;
  week_start: string;
  days: WeeklyTaskDay[];
};

type StudentTextbookItem = {
  id: number;
  textbook_key: string;
  title: string;
  short_title: string;
  subject: string | null;
  total_items: number;
  is_checkable: boolean;
};

type TextbookProgressData = {
  textbook: {
    id: number;
    key: string;
    title: string;
    full_title: string;
    subject: string | null;
    problem_count: number;
  };
  summary: {
    total: number;
    done: number;
    partial: number;
    not_started: number;
  };
  items: {
    id: number;
    item_number: number;
    title: string;
    status: ItemProgressStatus;
  }[];
};

type LectureTaskItemProgress = {
  lecture_number: number;
  title: string;
  is_done: boolean;
  updated_at?: string | null;
};

type LectureAssignmentListItem = {
  id: number;
  subject: string;
  course_title: string;
  start_date: string;
  due_date: string;
  status: string;
};

type LectureAssignmentDetailResponse = {
  assignment: LectureAssignmentListItem & {
    student_name?: string | null;
    student_grade?: string | null;
    weekdays?: string[];
    lectures_per_day?: number;
  };
  daily_tasks: Array<
    DailyTask & {
      task_date: string | null;
      progress_rate: number;
      lecture_start_number: number | null;
      lecture_end_number: number | null;
      lecture_items: LectureTaskItemProgress[];
    }
  >;
  total_lectures_to_assign: number;
  completed_lecture_count: number;
  remaining_lecture_count: number;
  progress_rate: number;
};

const tabs = [
  { key: "missions", label: "오늘의 미션" },
  { key: "textbook", label: "교재 진도" },
  { key: "lecture", label: "인강 진도" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function getWeekStart(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getStatusTone(status: DailyTaskStatus) {
  if (status === "done") return "bg-emerald-100 text-emerald-700";
  if (status === "in_progress") return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

function getStatusLabel(status: DailyTaskStatus) {
  if (status === "done") return "완료";
  if (status === "in_progress") return "진행 중";
  return "예정";
}

function getItemTone(status: ItemProgressStatus) {
  if (status === "done") return "bg-emerald-50 text-emerald-700";
  if (status === "partial") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-500";
}

function getItemLabel(status: ItemProgressStatus) {
  if (status === "done") return "완료";
  if (status === "partial") return "질문";
  return "미완료";
}

function getLectureRangeLabel(task: LectureAssignmentDetailResponse["daily_tasks"][number]) {
  if (task.lecture_start_number === null || task.lecture_end_number === null) {
    return "강의 범위 확인";
  }
  if (task.lecture_start_number === task.lecture_end_number) {
    return `${task.lecture_start_number}강`;
  }
  return `${task.lecture_start_number}~${task.lecture_end_number}강`;
}

export function AdminStudentProgressManager({
  studentId,
  studentName,
}: {
  studentId: number;
  studentName: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("missions");
  const [selectedDate, setSelectedDate] = useState(() => getStudyDate());
  const [missionData, setMissionData] = useState<WeeklyTasksResponse | null>(null);
  const [missionLoading, setMissionLoading] = useState(false);
  const [missionError, setMissionError] = useState("");
  const [missionSavingId, setMissionSavingId] = useState<number | null>(null);

  const [textbooks, setTextbooks] = useState<StudentTextbookItem[]>([]);
  const [selectedTextbookKey, setSelectedTextbookKey] = useState<string | null>(null);
  const [textbookProgress, setTextbookProgress] = useState<TextbookProgressData | null>(null);
  const [textbookLoading, setTextbookLoading] = useState(false);
  const [textbookError, setTextbookError] = useState("");
  const [textbookSavingItemId, setTextbookSavingItemId] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [textbookBatchSaving, setTextbookBatchSaving] = useState(false);

  const [lectureAssignments, setLectureAssignments] = useState<LectureAssignmentListItem[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [lectureDetail, setLectureDetail] = useState<LectureAssignmentDetailResponse | null>(null);
  const [lectureLoading, setLectureLoading] = useState(false);
  const [lectureError, setLectureError] = useState("");
  const [lectureSavingKey, setLectureSavingKey] = useState<string | null>(null);

  const fetchMissions = useCallback(async () => {
    setMissionLoading(true);
    setMissionError("");
    try {
      const data = await apiFetch<WeeklyTasksResponse>(
        `/student/weekly-tasks?student_id=${studentId}&week_start=${getWeekStart(selectedDate)}`,
      );
      setMissionData(data);
    } catch (error) {
      setMissionData(null);
      setMissionError(
        error instanceof ApiError ? error.message : "미션 목록을 불러오지 못했습니다.",
      );
    } finally {
      setMissionLoading(false);
    }
  }, [selectedDate, studentId]);

  const fetchTextbooks = useCallback(async () => {
    try {
      const data = await apiFetch<{ textbooks: StudentTextbookItem[] }>(
        `/admin/textbooks-for-student/${studentId}`,
      );
      const nextTextbooks = data.textbooks.filter((textbook) => textbook.is_checkable);
      setTextbooks(nextTextbooks);
      setSelectedTextbookKey((current) => {
        if (current && nextTextbooks.some((textbook) => textbook.textbook_key === current)) {
          return current;
        }
        return nextTextbooks[0]?.textbook_key ?? null;
      });
    } catch (error) {
      setTextbookError(
        error instanceof ApiError ? error.message : "배정된 교재를 불러오지 못했습니다.",
      );
    }
  }, [studentId]);

  const fetchTextbookProgress = useCallback(async () => {
    if (!selectedTextbookKey) {
      setTextbookProgress(null);
      return;
    }

    setTextbookLoading(true);
    setTextbookError("");
    try {
      const data = await apiFetch<TextbookProgressData>(
        `/student/textbook-progress/${selectedTextbookKey}?student_id=${studentId}`,
      );
      setTextbookProgress(data);
    } catch (error) {
      setTextbookProgress(null);
      setTextbookError(
        error instanceof ApiError ? error.message : "교재 진도 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setTextbookLoading(false);
    }
  }, [selectedTextbookKey, studentId]);

  const fetchLectureAssignments = useCallback(async () => {
    try {
      const data = await apiFetch<LectureAssignmentListItem[]>(
        `/admin/lecture-assignments?student_id=${studentId}`,
      );
      setLectureAssignments(data);
      setSelectedAssignmentId((current) => {
        if (current && data.some((assignment) => assignment.id === current)) {
          return current;
        }
        return data[0]?.id ?? null;
      });
    } catch (error) {
      setLectureError(
        error instanceof ApiError ? error.message : "인강 배정 목록을 불러오지 못했습니다.",
      );
    }
  }, [studentId]);

  const fetchLectureDetail = useCallback(async () => {
    if (selectedAssignmentId === null) {
      setLectureDetail(null);
      return;
    }

    setLectureLoading(true);
    setLectureError("");
    try {
      const data = await apiFetch<LectureAssignmentDetailResponse>(
        `/admin/lecture-assignments/${selectedAssignmentId}`,
      );
      setLectureDetail(data);
    } catch (error) {
      setLectureDetail(null);
      setLectureError(
        error instanceof ApiError ? error.message : "인강 진도 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLectureLoading(false);
    }
  }, [selectedAssignmentId]);

  useEffect(() => {
    void fetchMissions();
  }, [fetchMissions]);

  useEffect(() => {
    void fetchTextbooks();
  }, [fetchTextbooks]);

  useEffect(() => {
    void fetchTextbookProgress();
  }, [fetchTextbookProgress]);

  useEffect(() => {
    void fetchLectureAssignments();
  }, [fetchLectureAssignments]);

  useEffect(() => {
    void fetchLectureDetail();
  }, [fetchLectureDetail]);

  const selectedDayTasks = useMemo(() => {
    return missionData?.days.find((day) => day.date === selectedDate)?.tasks ?? [];
  }, [missionData, selectedDate]);

  const rangeItems = useMemo(() => {
    if (!textbookProgress) return [];
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) {
      return [];
    }
    const [from, to] = start <= end ? [start, end] : [end, start];
    return textbookProgress.items.filter(
      (item) => item.item_number >= from && item.item_number <= to,
    );
  }, [rangeEnd, rangeStart, textbookProgress]);

  const lectureTasksByDate = useMemo(() => {
    const groups = new Map<string, LectureAssignmentDetailResponse["daily_tasks"]>();
    for (const task of lectureDetail?.daily_tasks ?? []) {
      const dateKey = task.task_date ?? "날짜 미정";
      const current = groups.get(dateKey) ?? [];
      current.push(task);
      groups.set(dateKey, current);
    }
    return Array.from(groups.entries());
  }, [lectureDetail]);

  const updateMissionStatus = async (task: DailyTask, nextStatus: DailyTaskStatus) => {
    if (task.status === nextStatus) return;
    if (
      task.status === "done" &&
      nextStatus !== "done" &&
      !window.confirm("완료 처리된 미션을 다시 변경할까요?")
    ) {
      return;
    }

    setMissionSavingId(task.id);
    setMissionError("");
    try {
      await apiFetch<DailyTask>(`/admin/students/${studentId}/daily-tasks/${task.id}`, {
        method: "PATCH",
        body: {
          status: nextStatus,
        },
      });
      await fetchMissions();
    } catch (error) {
      setMissionError(
        error instanceof ApiError ? error.message : "미션 상태를 저장하지 못했습니다.",
      );
    } finally {
      setMissionSavingId(null);
    }
  };

  const updateTextbookItemStatus = async (itemId: number, current: ItemProgressStatus, next: ItemProgressStatus) => {
    if (current === next) return;
    if (
      current === "done" &&
      next !== "done" &&
      !window.confirm("완료한 문항을 다시 변경할까요?")
    ) {
      return;
    }

    setTextbookSavingItemId(itemId);
    setTextbookError("");
    try {
      await apiFetch(`/admin/students/${studentId}/textbook-items/${itemId}`, {
        method: "PATCH",
        body: { status: next },
      });
      await fetchTextbookProgress();
      await fetchMissions();
    } catch (error) {
      setTextbookError(
        error instanceof ApiError ? error.message : "문항 상태를 저장하지 못했습니다.",
      );
    } finally {
      setTextbookSavingItemId(null);
    }
  };

  const applyTextbookBatch = async (itemIds: number[], nextStatus: ItemProgressStatus) => {
    if (itemIds.length === 0) {
      setTextbookError("적용할 문항이 없습니다.");
      return;
    }
    if (
      nextStatus !== "done" &&
      !window.confirm("선택한 문항의 완료 상태를 해제할까요?")
    ) {
      return;
    }

    setTextbookBatchSaving(true);
    setTextbookError("");
    try {
      await apiFetch(`/admin/students/${studentId}/textbook-items`, {
        method: "PATCH",
        body: {
          item_ids: itemIds,
          status: nextStatus,
        },
      });
      await fetchTextbookProgress();
      await fetchMissions();
    } catch (error) {
      setTextbookError(
        error instanceof ApiError ? error.message : "일괄 저장에 실패했습니다.",
      );
    } finally {
      setTextbookBatchSaving(false);
    }
  };

  const toggleLectureItem = async (
    taskId: number,
    lectureNumber: number,
    isDone: boolean,
  ) => {
    if (isDone && !window.confirm("완료한 인강 회차를 다시 해제할까요?")) {
      return;
    }

    const key = `${taskId}-${lectureNumber}`;
    setLectureSavingKey(key);
    setLectureError("");
    try {
      await apiFetch(
        `/admin/students/${studentId}/daily-tasks/${taskId}/lecture-items/${lectureNumber}`,
        {
          method: "PATCH",
          body: { is_done: !isDone },
        },
      );
      await fetchLectureDetail();
      await fetchMissions();
    } catch (error) {
      setLectureError(
        error instanceof ApiError ? error.message : "인강 회차 상태를 저장하지 못했습니다.",
      );
    } finally {
      setLectureSavingKey(null);
    }
  };

  return (
    <section className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black text-[#17213B]">학습 진행 관리</h2>
            <span className="rounded-full bg-[#FFF7ED] px-3 py-1 text-xs font-black text-[#C2410C]">
              관리자 대신 수정 중
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-[#98A2B3]">
            {studentName} 학생의 미션, 교재, 인강 진행 상태를 같은 DB 기준으로 바로 수정합니다.
          </p>
        </div>
        <div className="rounded-2xl bg-[#F8FAFC] px-4 py-3 text-sm font-bold text-[#475467]">
          기준 학습일 {selectedDate}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-2 text-sm font-black transition ${
              activeTab === tab.key
                ? "bg-[#17213B] text-white"
                : "bg-[#F4F6FA] text-[#667085] hover:bg-[#EAEFF7]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "missions" ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-[#17213B]">날짜별 미션 상태</p>
              <p className="mt-1 text-xs font-semibold text-[#98A2B3]">
                수기 미션은 여기서 직접 수정하고, 교재/인강 기반 미션은 아래 다른 탭과 같은 상태를 봅니다.
              </p>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-2xl border border-[#D0D5DD] px-4 py-3 text-sm font-semibold text-[#17213B]"
            />
          </div>

          {missionLoading ? <p className="text-sm font-bold text-[#98A2B3]">불러오는 중입니다.</p> : null}
          {missionError ? (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{missionError}</div>
          ) : null}
          {!missionLoading && selectedDayTasks.length === 0 ? (
            <div className="rounded-2xl bg-[#F8FAFC] px-4 py-8 text-center text-sm font-bold text-[#98A2B3]">
              선택한 날짜에 미션이 없습니다.
            </div>
          ) : null}

          <div className="space-y-3">
            {selectedDayTasks.map((task) => {
              const isDerivedTask =
                task.completion_mode === "item_progress" || task.source_type === "lecture";

              return (
                <article
                  key={task.id}
                  className="rounded-[24px] border border-[#EEF2F7] bg-[#FBFCFE] p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${getStatusTone(task.status)}`}>
                          {getStatusLabel(task.status)}
                        </span>
                        {task.source_type ? (
                          <span className="rounded-full bg-[#F4F6FA] px-2.5 py-1 text-[11px] font-black text-[#667085]">
                            {task.source_type}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-black text-[#17213B]">{task.title}</p>
                      {task.detail ? (
                        <p className="mt-1 text-xs font-semibold text-[#98A2B3]">{task.detail}</p>
                      ) : null}
                      {task.textbook?.full_title ? (
                        <p className="mt-1 text-xs font-semibold text-[#98A2B3]">
                          {task.textbook.full_title}
                        </p>
                      ) : null}
                      {isDerivedTask ? (
                        <p className="mt-2 text-xs font-bold text-[#C2410C]">
                          이 미션 상태는 교재 문항 또는 인강 회차 진행과 함께 연동됩니다.
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(["todo", "in_progress", "done"] as DailyTaskStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={isDerivedTask || missionSavingId === task.id}
                          onClick={() => void updateMissionStatus(task, status)}
                          className={`rounded-xl px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            task.status === status
                              ? "bg-[#17213B] text-white"
                              : "bg-white text-[#667085] border border-[#D0D5DD]"
                          }`}
                        >
                          {getStatusLabel(status)}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "textbook" ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            {textbooks.length === 0 ? (
              <div className="rounded-2xl bg-[#F8FAFC] px-4 py-8 text-center text-sm font-bold text-[#98A2B3]">
                체크 가능한 교재가 없습니다.
              </div>
            ) : (
              textbooks.map((textbook) => (
                <button
                  key={textbook.id}
                  type="button"
                  onClick={() => setSelectedTextbookKey(textbook.textbook_key)}
                  className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                    selectedTextbookKey === textbook.textbook_key
                      ? "border-[#D9E2FF] bg-[#F8FAFF]"
                      : "border-[#EEF2F7] bg-white hover:bg-[#FBFCFE]"
                  }`}
                >
                  <p className="text-sm font-black text-[#17213B]">
                    {textbook.short_title || textbook.title}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#98A2B3]">
                    {textbook.subject ?? "교재"} · {textbook.total_items}문항
                  </p>
                </button>
              ))
            )}
          </div>

          <div className="rounded-[24px] border border-[#EEF2F7] bg-[#FBFCFE] p-4">
            {textbookLoading ? <p className="text-sm font-bold text-[#98A2B3]">불러오는 중입니다.</p> : null}
            {textbookError ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                {textbookError}
              </div>
            ) : null}

            {textbookProgress ? (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-[#17213B]">
                      {textbookProgress.textbook.full_title}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-[#98A2B3]">
                      완료 {textbookProgress.summary.done} · 질문 {textbookProgress.summary.partial} · 미완료{" "}
                      {textbookProgress.summary.not_started}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input
                      type="number"
                      min="1"
                      value={rangeStart}
                      onChange={(event) => setRangeStart(event.target.value)}
                      placeholder="시작"
                      className="rounded-xl border border-[#D0D5DD] px-3 py-2 text-sm font-semibold"
                    />
                    <input
                      type="number"
                      min="1"
                      value={rangeEnd}
                      onChange={(event) => setRangeEnd(event.target.value)}
                      placeholder="끝"
                      className="rounded-xl border border-[#D0D5DD] px-3 py-2 text-sm font-semibold"
                    />
                    <button
                      type="button"
                      disabled={textbookBatchSaving}
                      onClick={() => void applyTextbookBatch(rangeItems.map((item) => item.id), "done")}
                      className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
                    >
                      구간 완료
                    </button>
                    <button
                      type="button"
                      disabled={textbookBatchSaving}
                      onClick={() =>
                        void applyTextbookBatch(rangeItems.map((item) => item.id), "not_started")
                      }
                      className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
                    >
                      구간 해제
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={textbookBatchSaving}
                    onClick={() =>
                      void applyTextbookBatch(
                        textbookProgress.items.map((item) => item.id),
                        "done",
                      )
                    }
                    className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                  >
                    전체 완료
                  </button>
                  <button
                    type="button"
                    disabled={textbookBatchSaving}
                    onClick={() =>
                      void applyTextbookBatch(
                        textbookProgress.items.map((item) => item.id),
                        "not_started",
                      )
                    }
                    className="rounded-full bg-slate-700 px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                  >
                    전체 해제
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {textbookProgress.items.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-[20px] border border-[#E5E7EB] bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-[#17213B]">{item.item_number}번</p>
                          <p className="mt-1 text-xs font-semibold text-[#98A2B3]">{item.title}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${getItemTone(item.status)}`}>
                          {getItemLabel(item.status)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {(["not_started", "partial", "done"] as ItemProgressStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={textbookSavingItemId === item.id}
                            onClick={() => void updateTextbookItemStatus(item.id, item.status, status)}
                            className={`rounded-xl px-2 py-2 text-xs font-black transition disabled:opacity-60 ${
                              item.status === status
                                ? "bg-[#17213B] text-white"
                                : "border border-[#D0D5DD] bg-white text-[#667085]"
                            }`}
                          >
                            {getItemLabel(status)}
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : !textbookLoading ? (
              <div className="rounded-2xl bg-white px-4 py-8 text-center text-sm font-bold text-[#98A2B3]">
                교재를 선택해주세요.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "lecture" ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-3">
            {lectureAssignments.length === 0 ? (
              <div className="rounded-2xl bg-[#F8FAFC] px-4 py-8 text-center text-sm font-bold text-[#98A2B3]">
                배정된 인강이 없습니다.
              </div>
            ) : (
              lectureAssignments.map((assignment) => (
                <button
                  key={assignment.id}
                  type="button"
                  onClick={() => setSelectedAssignmentId(assignment.id)}
                  className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                    selectedAssignmentId === assignment.id
                      ? "border-[#D9E2FF] bg-[#F8FAFF]"
                      : "border-[#EEF2F7] bg-white hover:bg-[#FBFCFE]"
                  }`}
                >
                  <p className="text-xs font-black text-[#4F46E5]">{assignment.subject}</p>
                  <p className="mt-1 text-sm font-black text-[#17213B]">{assignment.course_title}</p>
                  <p className="mt-1 text-xs font-semibold text-[#98A2B3]">
                    {assignment.start_date} ~ {assignment.due_date}
                  </p>
                </button>
              ))
            )}
          </div>

          <div className="rounded-[24px] border border-[#EEF2F7] bg-[#FBFCFE] p-4">
            {lectureLoading ? <p className="text-sm font-bold text-[#98A2B3]">불러오는 중입니다.</p> : null}
            {lectureError ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                {lectureError}
              </div>
            ) : null}

            {lectureDetail ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-[#17213B]">
                      {lectureDetail.assignment.course_title}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-[#98A2B3]">
                      완료 {lectureDetail.completed_lecture_count}강 · 남은 회차{" "}
                      {lectureDetail.remaining_lecture_count}강 · 진행률 {lectureDetail.progress_rate}%
                    </p>
                  </div>
                  <Link
                    href={`/admin/lecture-assignments/${lectureDetail.assignment.id}`}
                    className="inline-flex items-center justify-center rounded-full bg-[#17213B] px-4 py-2 text-xs font-black text-white"
                  >
                    배정 상세보기
                  </Link>
                </div>

                <div className="mt-5 space-y-4">
                  {lectureTasksByDate.map(([dateKey, tasks]) => (
                    <div key={dateKey} className="rounded-[20px] border border-[#E5E7EB] bg-white p-4">
                      <p className="text-sm font-black text-[#17213B]">{dateKey}</p>
                      <div className="mt-3 space-y-3">
                        {tasks.map((task) => (
                          <div key={task.id} className="rounded-[18px] bg-[#F8FAFC] p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-black text-[#17213B]">{task.title}</p>
                                <p className="mt-1 text-xs font-semibold text-[#98A2B3]">
                                  {getLectureRangeLabel(task)}
                                </p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${getStatusTone(task.status)}`}>
                                {getStatusLabel(task.status)}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {task.lecture_items.map((item) => {
                                const saveKey = `${task.id}-${item.lecture_number}`;
                                return (
                                  <button
                                    key={saveKey}
                                    type="button"
                                    disabled={lectureSavingKey === saveKey}
                                    onClick={() => void toggleLectureItem(task.id, item.lecture_number, item.is_done)}
                                    className={`rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${
                                      item.is_done
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-[#D0D5DD] bg-white text-[#344054]"
                                    }`}
                                  >
                                    <p className="text-sm font-black">{item.lecture_number}강</p>
                                    <p className="mt-1 text-xs font-semibold opacity-80">{item.title}</p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : !lectureLoading ? (
              <div className="rounded-2xl bg-white px-4 py-8 text-center text-sm font-bold text-[#98A2B3]">
                인강 배정을 선택해주세요.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
