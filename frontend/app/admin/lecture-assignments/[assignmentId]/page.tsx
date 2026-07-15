"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { ApiError, apiFetch } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getAdmin } from "@/lib/storage";
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
  student_name: string | null;
  student_grade: string | null;
};

type LectureAssignmentDetailResponse = {
  assignment: LectureAssignmentDetail;
  daily_tasks: LectureDailyTask[];
  total_lectures_to_assign: number;
  completed_lecture_count: number;
  remaining_lecture_count: number;
  progress_rate: number;
};

type LecturePreviewItem = {
  date: string;
  start_lecture_no: number;
  end_lecture_no: number;
  count: number;
};

type LecturePreviewResponse = {
  possible: boolean;
  total_lectures_to_assign: number;
  available_days_count: number;
  required_days_count: number;
  max_assignable_lectures: number;
  shortage_count: number;
  recommended_lectures_per_day: number;
  preview_items: LecturePreviewItem[];
};

type LectureAssignmentMutationResponse = {
  assignment: LectureAssignmentDetail;
  daily_tasks: LectureDailyTask[];
};

type AssignmentDeleteResponse = {
  ok: boolean;
  deleted_task_count: number;
  preserved_completed_count: number;
};

type EditFormState = {
  subject: string;
  courseTitle: string;
  totalLectures: string;
  startLectureNo: string;
  lecturesPerDay: string;
  weekdays: LectureWeekday[];
  rescheduleStartDate: string;
  dueDate: string;
  memo: string;
};

type LectureAssignmentEditPayload = {
  subject: string;
  course_title: string;
  total_lectures: number;
  start_lecture_no: number;
  lectures_per_day: number;
  weekdays: LectureWeekday[];
  due_date: string;
  memo: string | null;
  reschedule_start_date: string;
};

const WEEKDAY_KOR: Record<LectureWeekday, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};

const LECTURE_WEEKDAY_OPTIONS: { value: LectureWeekday; label: string }[] = [
  { value: "mon", label: "월" }, { value: "tue", label: "화" }, { value: "wed", label: "수" },
  { value: "thu", label: "목" }, { value: "fri", label: "금" }, { value: "sat", label: "토" }, { value: "sun", label: "일" },
];

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

function buildLectureAssignmentPayload(editForm: EditFormState): LectureAssignmentEditPayload {
  return {
    subject: editForm.subject.trim(),
    course_title: editForm.courseTitle.trim(),
    total_lectures: Number(editForm.totalLectures),
    start_lecture_no: Number(editForm.startLectureNo),
    lectures_per_day: Number(editForm.lecturesPerDay),
    weekdays: [...editForm.weekdays],
    due_date: editForm.dueDate,
    memo: editForm.memo.trim() || null,
    reschedule_start_date: editForm.rescheduleStartDate,
  };
}

function addDaysToDateKey(dateStr: string, days: number) {
  const d = parseDateKey(dateStr);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

function formatMonthDayTime(isoStr: string) {
  const d = new Date(isoStr);
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

function rangeLabel(task: LectureDailyTask) {
  if (task.lecture_start_number === null || task.lecture_end_number === null) return "-";
  if (task.lecture_start_number === task.lecture_end_number) return `${task.lecture_start_number}강`;
  return `${task.lecture_start_number}~${task.lecture_end_number}강`;
}

function latestCompletionLabel(task: LectureDailyTask) {
  const doneUpdates = task.lecture_items
    .filter((item) => item.is_done && item.updated_at)
    .map((item) => item.updated_at as string);
  if (doneUpdates.length === 0) return null;
  const latest = doneUpdates.reduce((a, b) => (a > b ? a : b));
  return formatMonthDayTime(latest);
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[24px] border border-[#EEF2F7] bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-[#98A2B3]">{label}</p>
      <p className={`mt-2 text-2xl font-black tracking-tight ${tone}`}>{value}</p>
    </div>
  );
}

const inputCls = "w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-bold text-[#17213B] outline-none focus:border-[#0F172A]";

export default function AdminLectureAssignmentDetailPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<LectureAssignmentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewResult, setPreviewResult] = useState<LecturePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewStale, setPreviewStale] = useState(true);
  const [message, setMessage] = useState("");

  const fetchDetail = useCallback(async () => {
    const data = await apiFetch<LectureAssignmentDetailResponse>(
      `/admin/lecture-assignments/${params.assignmentId}`,
    );
    setDetail(data);
  }, [params.assignmentId]);

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }

    setLoading(true);
    setLoadError("");
    fetchDetail()
      .catch(() => setLoadError("인강 배정 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [fetchDetail, router]);

  const startEdit = () => {
    if (!detail) return;
    setMessage("");

    const protectedDates = detail.daily_tasks
      .filter((task) => task.status !== "todo" && task.task_date)
      .map((task) => task.task_date as string)
      .sort();
    const lastProtectedDate = protectedDates.length > 0 ? protectedDates[protectedDates.length - 1] : null;
    const defaultRescheduleStartDate = lastProtectedDate
      ? addDaysToDateKey(lastProtectedDate, 1)
      : detail.assignment.start_date;

    setEditForm({
      subject: detail.assignment.subject,
      courseTitle: detail.assignment.course_title,
      totalLectures: String(detail.assignment.total_lectures),
      startLectureNo: String(detail.assignment.start_lecture_no),
      lecturesPerDay: String(detail.assignment.lectures_per_day),
      weekdays: detail.assignment.weekdays,
      rescheduleStartDate: defaultRescheduleStartDate,
      dueDate: detail.assignment.due_date,
      memo: detail.assignment.memo ?? "",
    });
    setEditError("");
    setPreviewResult(null);
    setPreviewStale(true);
    setEditing(true);
  };

  const updateEditForm = (patch: Partial<EditFormState>) => {
    setEditForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setPreviewStale(true);
    setPreviewResult(null);
  };

  const toggleWeekday = (weekday: LectureWeekday) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const exists = prev.weekdays.includes(weekday);
      return { ...prev, weekdays: exists ? prev.weekdays.filter((w) => w !== weekday) : [...prev.weekdays, weekday] };
    });
    setPreviewStale(true);
    setPreviewResult(null);
  };

  const handlePreview = async () => {
    if (!editForm || !detail) return;
    setEditError("");
    setPreviewLoading(true);
    try {
      const payload = buildLectureAssignmentPayload(editForm);
      const result = await apiFetch<LecturePreviewResponse>(
        `/admin/lecture-assignments/${detail.assignment.id}/reschedule-preview`,
        { method: "POST", body: payload },
      );
      setPreviewResult(result);
      setPreviewStale(false);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "미리보기를 불러오지 못했습니다.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editForm || !detail) return;
    setEditError("");
    setSaving(true);
    try {
      const payload = buildLectureAssignmentPayload(editForm);
      const result = await apiFetch<LectureAssignmentMutationResponse>(
        `/admin/lecture-assignments/${detail.assignment.id}`,
        {
          method: "PATCH",
          body: payload,
        },
      );
      setMessage(`저장되었습니다. 현재 ${result.daily_tasks.length}개의 일일 강의 task가 배정되어 있습니다.`);
      setEditing(false);
      setEditForm(null);
      await fetchDetail();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    if (!window.confirm("이 인강 배정을 삭제할까요? 완료/진행 중인 기록은 보존됩니다.")) return;
    try {
      const result = await apiFetch<AssignmentDeleteResponse>(
        `/admin/lecture-assignments/${detail.assignment.id}`,
        { method: "DELETE" },
      );
      window.alert(`삭제되었습니다. (미완료 ${result.deleted_task_count}개 삭제, 완료/진행 중 ${result.preserved_completed_count}개 보존)`);
      router.push("/admin/daily-tasks");
    } catch {
      setLoadError("삭제에 실패했습니다. 다시 시도해주세요.");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F4F6FA]">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-32 sm:px-6 lg:px-8">
          <div className="rounded-[32px] border border-white/80 bg-white px-6 py-20 text-center text-sm font-bold text-[#98A2B3] shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            불러오는 중...
          </div>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="min-h-screen bg-[#F4F6FA]">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-32 sm:px-6 lg:px-8">
          <Link className="inline-flex items-center gap-2 text-sm font-bold text-[#98A2B3] hover:text-[#667085]" href="/admin/daily-tasks">
            <span>←</span><span>강의 배정 목록으로</span>
          </Link>
          <p className="mt-6 rounded-[32px] border border-white/80 bg-white px-6 py-20 text-center text-sm font-bold text-red-400 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            {loadError || "인강 배정 정보를 찾을 수 없습니다."}
          </p>
        </div>
      </main>
    );
  }

  const { assignment } = detail;
  const sortedTasks = [...detail.daily_tasks].sort((a, b) => (a.task_date ?? "").localeCompare(b.task_date ?? ""));
  const todayKey = getStudyDate();
  const incompleteCount = detail.total_lectures_to_assign - detail.completed_lecture_count;

  return (
    <main className="min-h-screen bg-[#F4F6FA]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-32 sm:px-6 lg:px-8">
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-[32px] border border-white/80 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <Link className="inline-flex items-center gap-2 text-sm font-bold text-[#98A2B3] transition hover:text-[#667085]" href="/admin/daily-tasks">
                  <span>←</span><span>강의 배정 목록으로</span>
                </Link>
                <span className="mt-4 inline-flex rounded-full bg-[#F1EDFF] px-3 py-1.5 text-xs font-black text-[#635BFF]">강의 배정 관리</span>

                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-black text-[#4F46E5]">
                    {assignment.student_name ?? "학생"}
                  </span>
                  {assignment.student_grade ? (
                    <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs font-bold text-[#667085]">{assignment.student_grade}</span>
                  ) : null}
                </div>
                <h1 className="mt-2 text-2xl font-black leading-snug tracking-tight text-[#17213B] sm:text-[1.9rem]">
                  {assignment.course_title}
                </h1>
                <p className="mt-2 text-sm font-bold text-[#667085]">
                  {formatDot(assignment.start_date)} ~ {formatDot(assignment.due_date)} · {assignment.weekdays.map((w) => WEEKDAY_KOR[w]).join("·")} · 하루 {assignment.lectures_per_day}강
                </p>

                <div className="mt-5 max-w-md">
                  <p className="text-xs font-bold text-[#98A2B3]">전체 진행률</p>
                  <p className="mt-1 text-3xl font-black tracking-tight text-[#635BFF]">{detail.progress_rate}%</p>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#F1EEFF]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#635BFF_0%,#7C71FF_100%)] transition-all duration-500"
                      style={{ width: `${detail.progress_rate}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row lg:flex-col">
                <button
                  className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-black text-[#344054] transition hover:bg-[#F8FAFC]"
                  onClick={startEdit}
                  type="button"
                >
                  배정 계획 수정
                </button>
                <button
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-black text-red-500 transition hover:bg-red-100"
                  onClick={() => void handleDelete()}
                  type="button"
                >
                  배정 삭제
                </button>
              </div>
            </div>

            <div className="pointer-events-none absolute -right-2 -top-2 hidden h-32 w-32 sm:block">
              <Image alt="" className="object-contain" fill priority src="/video%20cat.png" />
            </div>
          </section>

          {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600">{message}</p> : null}
          {loadError ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{loadError}</p> : null}

          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="전체 강의" tone="text-[#17213B]" value={`${detail.total_lectures_to_assign}강`} />
            <StatCard label="완료 강의" tone="text-emerald-600" value={`${detail.completed_lecture_count}강`} />
            <StatCard label="미완료 강의" tone="text-amber-600" value={`${incompleteCount}강`} />
            <StatCard label="진행률" tone="text-[#4F46E5]" value={`${detail.progress_rate}%`} />
          </section>

          {editing && editForm ? (
            <section className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
              <h2 className="text-lg font-black text-[#17213B]">배정 계획 수정</h2>
              <p className="mt-1 text-xs text-[#98A2B3]">완료·진행 중인 강의 기록은 보존됩니다. 값을 바꾸면 저장 전 다시 미리보기를 확인해야 합니다.</p>

              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold text-[#667085]">과목</label>
                    <input className={inputCls} onChange={(e) => updateEditForm({ subject: e.target.value })} value={editForm.subject} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold text-[#667085]">강의명</label>
                    <input className={inputCls} onChange={(e) => updateEditForm({ courseTitle: e.target.value })} value={editForm.courseTitle} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-xs font-bold text-[#667085]">총 강의 수</label>
                    <input className={inputCls} min="1" onChange={(e) => updateEditForm({ totalLectures: e.target.value })} type="number" value={editForm.totalLectures} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold text-[#667085]">시작 강의 번호</label>
                    <input className={inputCls} min="1" onChange={(e) => updateEditForm({ startLectureNo: e.target.value })} type="number" value={editForm.startLectureNo} />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold text-[#667085]">하루 수강 강의 수</label>
                  <input className={inputCls} min="1" onChange={(e) => updateEditForm({ lecturesPerDay: e.target.value })} type="number" value={editForm.lecturesPerDay} />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold text-[#667085]">수강 요일</label>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {LECTURE_WEEKDAY_OPTIONS.map((option) => {
                      const active = editForm.weekdays.includes(option.value);
                      return (
                        <button
                          className={cn(
                            "rounded-xl py-2.5 text-xs font-bold transition",
                            active ? "bg-[#0F172A] text-white" : "border border-[#E5E7EB] bg-[#F8FAFC] text-[#667085] hover:bg-[#EDEFF5]",
                          )}
                          key={option.value}
                          onClick={() => toggleWeekday(option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-xs font-bold text-[#667085]">최초 시작일</label>
                    <input className={`${inputCls} cursor-not-allowed opacity-60`} disabled readOnly type="date" value={detail.assignment.start_date} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold text-[#667085]">마감일</label>
                    <input className={inputCls} onChange={(e) => updateEditForm({ dueDate: e.target.value })} type="date" value={editForm.dueDate} />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold text-[#667085]">미완료 일정 다시 시작일</label>
                  <input
                    className={inputCls}
                    onChange={(e) => updateEditForm({ rescheduleStartDate: e.target.value })}
                    type="date"
                    value={editForm.rescheduleStartDate}
                  />
                  <p className="mt-2 text-xs font-bold text-[#667085]">
                    완료한 강의 기록은 유지되고, 미완료 일정만 선택한 날짜부터 다시 배정됩니다.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold text-[#667085]">메모</label>
                  <textarea className={`${inputCls} min-h-[88px] resize-y`} onChange={(e) => updateEditForm({ memo: e.target.value })} value={editForm.memo} />
                </div>

                <div className="flex gap-3">
                  <button
                    className="flex-1 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] py-3 text-sm font-black text-[#344054] transition hover:bg-white disabled:opacity-50"
                    disabled={previewLoading}
                    onClick={() => void handlePreview()}
                    type="button"
                  >
                    {previewLoading ? "미리보기 불러오는 중..." : "변경 결과 미리보기"}
                  </button>
                  <button
                    className="flex-1 rounded-2xl bg-[#0F172A] py-3 text-sm font-black text-white transition hover:bg-[#1E293B] disabled:opacity-50"
                    disabled={saving || previewStale || previewResult?.possible !== true}
                    onClick={() => void handleSave()}
                    type="button"
                  >
                    {saving ? "저장 중..." : "변경 저장"}
                  </button>
                  <button
                    className="rounded-2xl border border-[#E5E7EB] bg-white px-5 py-3 text-sm font-black text-[#667085]"
                    onClick={() => { setEditing(false); setEditForm(null); }}
                    type="button"
                  >
                    취소
                  </button>
                </div>

                {previewStale && previewResult ? (
                  <p className="rounded-2xl bg-yellow-50 px-4 py-3 text-sm font-bold text-yellow-800">
                    입력값이 바뀌었습니다. 저장하려면 미리보기를 다시 확인해야 합니다.
                  </p>
                ) : null}

                {previewResult ? (
                  <div className={cn("rounded-2xl p-4", previewResult.possible ? "bg-emerald-50" : "bg-yellow-50")}>
                    <p className={cn("text-sm font-black", previewResult.possible ? "text-emerald-700" : "text-yellow-800")}>
                      {previewResult.possible ? "배정 가능합니다." : "현재 조건으로는 완료가 불가능합니다."}
                      {" "}(전체 범위 기준 — 저장 시 이미 완료/진행 중인 강의 이후만 새로 배정됩니다)
                    </p>
                    {previewResult.possible ? (
                      <div className="mt-3 space-y-1.5">
                        {previewResult.preview_items.map((item) => (
                          <p className="text-xs font-bold text-[#344054]" key={`${item.date}-${item.start_lecture_no}`}>
                            {item.date}: {item.start_lecture_no}강~{item.end_lecture_no}강
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {editError ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{editError}</p> : null}
              </div>
            </section>
          ) : null}

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <article className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
              <h2 className="text-xl font-black text-[#17213B]">수강 일정 및 진행 상황</h2>

              <div className="mt-4 space-y-2">
                {sortedTasks.map((task) => {
                  const isToday = task.task_date === todayKey;
                  const isDone = task.status === "done";
                  const doneCount = task.lecture_items.filter((item) => item.is_done).length;
                  const totalCount = task.lecture_items.length;
                  const isExpanded = expandedTaskId === task.id;
                  const completionLabel = latestCompletionLabel(task);

                  return (
                    <div
                      className={cn(
                        "rounded-2xl border px-4 py-3 transition",
                        isDone ? "border-emerald-200 bg-emerald-50" : isToday ? "border-[#C7D2FE] bg-[#EEF2FF]" : "border-[#EEF2F7] bg-white",
                      )}
                      key={task.id}
                    >
                      <button
                        className="flex w-full items-center justify-between gap-3 text-left"
                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                        type="button"
                      >
                        <div className="min-w-0">
                          <p className={cn("text-sm font-black", isDone ? "text-emerald-700" : "text-[#17213B]")}>
                            {formatMonthDay(task.task_date ?? assignment.start_date)}
                            {isToday ? <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-[#4F46E5]">오늘</span> : null}
                          </p>
                          <p className="mt-0.5 text-xs font-bold text-[#8A94A8]">{rangeLabel(task)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {completionLabel ? (
                            <span className="hidden text-[11px] font-bold text-[#98A2B3] sm:inline">최근 완료 {completionLabel}</span>
                          ) : null}
                          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black", isDone ? "bg-emerald-100 text-emerald-700" : "bg-[#F1F0FF] text-[#6D73FF]")}>
                            {doneCount}/{totalCount} {isDone ? "완료" : "예정"}
                          </span>
                          <span className="text-xs font-black text-[#98A1B3]">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </button>

                      {isExpanded ? (
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-black/5 pt-3 sm:grid-cols-4">
                          {task.lecture_items.map((item) => (
                            <div
                              className={cn(
                                "flex items-center gap-2 rounded-xl border px-3 py-2",
                                item.is_done ? "border-emerald-200 bg-white" : "border-[#E5E7EB] bg-white",
                              )}
                              key={`${task.id}-${item.lecture_number}`}
                            >
                              <span
                                className={cn(
                                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-black",
                                  item.is_done ? "border-emerald-500 bg-emerald-500 text-white" : "border-[#D0D5DD] bg-white text-transparent",
                                )}
                              >
                                ✓
                              </span>
                              <span className={cn("truncate text-xs font-bold", item.is_done ? "text-emerald-700" : "text-[#344054]")}>{item.title}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {sortedTasks.length === 0 ? (
                  <p className="rounded-2xl bg-[#F8FAFC] px-4 py-8 text-center text-sm font-bold text-[#98A2B3]">배정된 일정이 없습니다.</p>
                ) : null}
              </div>
            </article>

            <article className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
              <h2 className="text-xl font-black text-[#17213B]">배정 계획 정보</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                <div><p className="font-bold text-[#98A2B3]">과목</p><p className="mt-1 text-sm font-black text-[#17213B]">{assignment.subject}</p></div>
                <div><p className="font-bold text-[#98A2B3]">강의명</p><p className="mt-1 text-sm font-black text-[#17213B]">{assignment.course_title}</p></div>
                <div><p className="font-bold text-[#98A2B3]">전체 강의 수</p><p className="mt-1 text-sm font-black text-[#17213B]">{assignment.total_lectures}강</p></div>
                <div><p className="font-bold text-[#98A2B3]">시작 강의 번호</p><p className="mt-1 text-sm font-black text-[#17213B]">{assignment.start_lecture_no}강</p></div>
                <div><p className="font-bold text-[#98A2B3]">하루 수강 강의 수</p><p className="mt-1 text-sm font-black text-[#17213B]">{assignment.lectures_per_day}강</p></div>
                <div><p className="font-bold text-[#98A2B3]">수강 요일</p><p className="mt-1 text-sm font-black text-[#17213B]">{assignment.weekdays.map((w) => WEEKDAY_KOR[w]).join(" · ")}</p></div>
                <div><p className="font-bold text-[#98A2B3]">시작일</p><p className="mt-1 text-sm font-black text-[#17213B]">{formatDot(assignment.start_date)}</p></div>
                <div><p className="font-bold text-[#98A2B3]">마감일</p><p className="mt-1 text-sm font-black text-[#17213B]">{formatDot(assignment.due_date)}</p></div>
              </div>

              <div className="mt-4 rounded-2xl bg-[#F8FAFC] px-4 py-3">
                <p className="text-xs font-bold text-[#98A2B3]">메모</p>
                <p className="mt-1 text-sm font-semibold text-[#344054]">{assignment.memo || "메모가 없습니다."}</p>
              </div>
            </article>
          </section>
        </div>
      </div>

      <AdminBottomNav />
    </main>
  );
}
