"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { ProgressBar } from "@/components/progress-bar";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type StudentBasicInfo = { name: string; grade: string };

type ItemProgressSummary = {
  student_id: number;
  overall: { total: number; done: number; partial: number; not_started: number; progress_rate: number };
};

type WeeklyTask = {
  id: number;
  title: string;
  detail: string | null;
  textbook_key: string | null;
  start_item_number: number | null;
  end_item_number: number | null;
  status: "todo" | "in_progress" | "done";
  category: string | null;
};

type WeeklyDay = {
  date: string;
  summary: { total: number; done: number; todo: number; completion_rate: number };
  tasks: WeeklyTask[];
};

type WeeklyTasksResponse = {
  student_id: number;
  week_start: string;
  days: WeeklyDay[];
};

type StudentTextbookItem = {
  id: number;
  textbook_key: string;
  title: string;
  short_title: string;
  subject: string | null;
  total_items: number;
  is_checkable: boolean;
  is_student_only: boolean;
};

type ChecklistItem = {
  id: number;
  item_number: number;
  title: string;
  status: "not_started" | "partial" | "done";
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
  summary: { total: number; done: number; partial: number; not_started: number };
  items: ChecklistItem[];
};

function toLocalDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatWeekLabel(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const format = (date: Date) =>
    `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, "0")}.${`${date.getDate()}`.padStart(2, "0")}`;

  return `${format(start)} - ${format(end)}`;
}

function getDayLabel(dateStr: string) {
  return WEEKDAYS[new Date(`${dateStr}T00:00:00`).getDay()];
}

function getTaskStatusLabel(status: string) {
  if (status === "done") return "완료";
  if (status === "in_progress") return "진행 중";
  return "예정";
}

function getTaskStatusClass(status: string) {
  if (status === "done") return "bg-emerald-100 text-emerald-700";
  if (status === "in_progress") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-500";
}

function getItemStatusLabel(status: string) {
  if (status === "done") return "완료";
  if (status === "partial") return "질문";
  return "";
}

function getItemStatusClass(status: string) {
  if (status === "done") return "bg-emerald-50 text-emerald-700";
  if (status === "partial") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-400";
}

function getRangeText(task: WeeklyTask) {
  if (task.start_item_number === null) return null;
  if (task.start_item_number === task.end_item_number) return `${task.start_item_number}번`;
  return `${task.start_item_number}번 ~ ${task.end_item_number ?? "?"}번`;
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#EEF2F7] bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-[#98A2B3]">{label}</p>
      <p className={`mt-2 text-2xl font-black tracking-tight ${tone}`}>{value}</p>
    </div>
  );
}

export default function AdminStudentDetailPage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();

  const [studentInfo, setStudentInfo] = useState<StudentBasicInfo | null>(null);
  const [itemProgress, setItemProgress] = useState<ItemProgressSummary | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);

  const [weekStart, setWeekStart] = useState(() => toLocalDateKey(getMondayOf(new Date())));
  const [weeklyData, setWeeklyData] = useState<WeeklyTasksResponse | null>(null);
  const [loadingWeekly, setLoadingWeekly] = useState(false);

  const [studentTextbooks, setStudentTextbooks] = useState<StudentTextbookItem[]>([]);
  const [textbookProgressMap, setTextbookProgressMap] = useState<Record<string, TextbookProgressData>>({});
  const [selectedTextbookKey, setSelectedTextbookKey] = useState<string | null>(null);

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }

    const sid = params.studentId;
    setLoadingInit(true);

    void (async () => {
      try {
        const [basicInfo, progress, textbookData] = await Promise.all([
          apiFetch<StudentBasicInfo & Record<string, unknown>>(`/admin/students/${sid}/progress`),
          apiFetch<ItemProgressSummary>(`/student/progress-summary?student_id=${sid}`).catch(() => null),
          apiFetch<{ textbooks: StudentTextbookItem[] }>(`/admin/textbooks-for-student/${sid}`).catch(() => ({
            textbooks: [],
          })),
        ]);

        setStudentInfo({ name: basicInfo.name, grade: basicInfo.grade });
        setItemProgress(progress);

        const textbooks = textbookData.textbooks ?? [];
        setStudentTextbooks(textbooks);

        const checkable = textbooks.filter((textbook) => textbook.is_checkable);
        if (checkable.length > 0) {
          const entries = await Promise.all(
            checkable.map((textbook) =>
              apiFetch<TextbookProgressData>(
                `/student/textbook-progress/${textbook.textbook_key}?student_id=${sid}`,
              )
                .then((data) => [textbook.textbook_key, data] as const)
                .catch(() => null),
            ),
          );

          const map: Record<string, TextbookProgressData> = {};
          for (const entry of entries) {
            if (entry) {
              map[entry[0]] = entry[1];
            }
          }
          setTextbookProgressMap(map);
        }
      } finally {
        setLoadingInit(false);
      }
    })();
  }, [params.studentId, router]);

  useEffect(() => {
    if (!params.studentId) return;
    setLoadingWeekly(true);
    apiFetch<WeeklyTasksResponse>(
      `/student/weekly-tasks?student_id=${params.studentId}&week_start=${weekStart}`,
    )
      .then((data) => setWeeklyData(data))
      .catch(() => setWeeklyData(null))
      .finally(() => setLoadingWeekly(false));
  }, [params.studentId, weekStart]);

  const moveWeek = (direction: -1 | 1) => {
    const date = new Date(`${weekStart}T00:00:00`);
    date.setDate(date.getDate() + direction * 7);
    setWeekStart(toLocalDateKey(date));
  };

  const progressRate = Math.round(itemProgress?.overall.progress_rate ?? 0);
  const totalItems = itemProgress?.overall.total ?? 0;
  const doneItems = itemProgress?.overall.done ?? 0;
  const partialItems = itemProgress?.overall.partial ?? 0;
  const notStartedItems = itemProgress?.overall.not_started ?? 0;

  const checkableTextbooks = studentTextbooks.filter((textbook) => textbook.is_checkable);
  const nonCheckableTextbooks = studentTextbooks.filter((textbook) => !textbook.is_checkable);

  const weeklySummary = useMemo(() => {
    const days = weeklyData?.days ?? [];
    const total = days.reduce((acc, day) => acc + day.summary.total, 0);
    const done = days.reduce((acc, day) => acc + day.summary.done, 0);
    const activeDays = days.filter((day) => day.tasks.length > 0).length;
    return {
      total,
      done,
      activeDays,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }, [weeklyData]);

  return (
    <main className="min-h-screen bg-[#F4F6FA]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-32 sm:px-6 lg:px-8">
        <div className="space-y-5">
          <section className="rounded-[32px] border border-white/80 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Link
                  className="inline-flex items-center gap-2 text-sm font-bold text-[#98A2B3] transition hover:text-[#667085]"
                  href="/admin/students"
                >
                  <span>←</span>
                  <span>학생 목록으로</span>
                </Link>
                <p className="mt-4 text-sm font-semibold text-[#7C8799]">관리자</p>
                <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-[#17213B] sm:text-[2.3rem]">
                  {studentInfo ? `${studentInfo.name} 학생` : "학생 상세"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[#667085]">
                  {studentInfo ? `${studentInfo.grade} · 학습 진행 상황과 숙제 현황을 함께 확인해요.` : "학생 정보를 불러오는 중이에요."}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start rounded-full bg-[#F8FAFC] px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-xs font-black text-[#5C5FFF]">
                  {studentInfo?.name.slice(0, 1) ?? "?"}
                </div>
                <div>
                  <p className="text-sm font-black text-[#17213B]">{studentInfo?.name ?? "학생"}</p>
                  <p className="text-[11px] font-semibold text-[#98A2B3]">{studentInfo?.grade ?? "-"}</p>
                </div>
              </div>
            </div>
          </section>

          {loadingInit ? (
            <div className="rounded-[32px] border border-white/80 bg-white px-6 py-20 text-center text-sm font-bold text-[#98A2B3] shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
              불러오는 중...
            </div>
          ) : (
            <>
              <section className="rounded-[32px] border border-[#E8EEFF] bg-[linear-gradient(135deg,#17213B_0%,#24345F_60%,#3448A0_100%)] p-6 text-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <span className="inline-flex rounded-full bg-white/12 px-3 py-1 text-xs font-black text-white/80">
                      전체 진도율
                    </span>
                    <div className="mt-4 flex flex-wrap items-end gap-4">
                      <p className="text-[3.2rem] font-black tracking-tight">{progressRate}%</p>
                      <p className="pb-2 text-sm font-semibold text-white/70">
                        완료 {doneItems}문항 · 질문 {partialItems}문항 · 아직 안 함 {notStartedItems}문항
                      </p>
                    </div>
                    <div className="mt-5 max-w-2xl">
                      <ProgressBar tone="yellow" value={progressRate} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:min-w-[300px]">
                    <div className="rounded-[24px] bg-white/10 p-4 backdrop-blur-sm">
                      <p className="text-xs font-bold text-white/60">전체 문항</p>
                      <p className="mt-2 text-2xl font-black">{totalItems}개</p>
                    </div>
                    <div className="rounded-[24px] bg-white/10 p-4 backdrop-blur-sm">
                      <p className="text-xs font-bold text-white/60">이번 주 숙제</p>
                      <p className="mt-2 text-2xl font-black">{weeklySummary.total}개</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard label="전체 문항" tone="text-[#17213B]" value={`${totalItems}개`} />
                <StatCard label="완료" tone="text-emerald-600" value={`${doneItems}개`} />
                <StatCard label="질문 표시" tone="text-amber-600" value={`${partialItems}개`} />
                <StatCard label="이번 주 완료율" tone="text-[#4F46E5]" value={`${weeklySummary.percent}%`} />
              </section>

              <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <article className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-black text-[#17213B]">이번 주 숙제</h2>
                      <p className="mt-1 text-sm font-semibold text-[#98A2B3]">{formatWeekLabel(weekStart)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F6FA] text-sm font-black text-[#667085] transition hover:bg-[#EAEFF7]"
                        onClick={() => moveWeek(-1)}
                        type="button"
                      >
                        ←
                      </button>
                      <button
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F6FA] text-sm font-black text-[#667085] transition hover:bg-[#EAEFF7]"
                        onClick={() => moveWeek(1)}
                        type="button"
                      >
                        →
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-[22px] bg-[#F8FAFC] p-4">
                      <p className="text-xs font-bold text-[#98A2B3]">배정된 숙제</p>
                      <p className="mt-2 text-2xl font-black text-[#17213B]">{weeklySummary.total}개</p>
                    </div>
                    <div className="rounded-[22px] bg-[#F8FAFC] p-4">
                      <p className="text-xs font-bold text-[#98A2B3]">완료한 숙제</p>
                      <p className="mt-2 text-2xl font-black text-emerald-600">{weeklySummary.done}개</p>
                    </div>
                    <div className="rounded-[22px] bg-[#F8FAFC] p-4">
                      <p className="text-xs font-bold text-[#98A2B3]">숙제 있는 날</p>
                      <p className="mt-2 text-2xl font-black text-[#4F46E5]">{weeklySummary.activeDays}일</p>
                    </div>
                  </div>

                  {loadingWeekly ? (
                    <p className="py-12 text-center text-sm font-bold text-[#98A2B3]">불러오는 중...</p>
                  ) : !weeklyData || weeklyData.days.every((day) => day.tasks.length === 0) ? (
                    <p className="py-12 text-center text-sm font-bold text-[#98A2B3]">
                      이번 주에 배정된 숙제가 없습니다.
                    </p>
                  ) : (
                    <div className="mt-5 space-y-4">
                      {weeklyData.days.map((day) => {
                        const hasTasks = day.tasks.length > 0;
                        const isToday = day.date === toLocalDateKey(new Date());

                        return (
                          <div
                            className={`rounded-[24px] border p-4 ${
                              hasTasks
                                ? isToday
                                  ? "border-[#C7D2FE] bg-[#F8FAFF]"
                                  : "border-[#EEF2F7] bg-[#FBFCFE]"
                                : "border-[#EEF2F7] bg-white"
                            }`}
                            key={day.date}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-black text-[#17213B]">
                                {day.date} ({getDayLabel(day.date)})
                              </p>
                              {isToday ? (
                                <span className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-black text-[#4F46E5]">
                                  오늘
                                </span>
                              ) : null}
                              <span className="rounded-full bg-[#F4F6FA] px-2.5 py-1 text-[11px] font-black text-[#667085]">
                                {day.summary.done}/{day.summary.total} 완료
                              </span>
                            </div>

                            {hasTasks ? (
                              <div className="mt-3 space-y-2">
                                {day.tasks.map((task) => (
                                  <div
                                    className="rounded-[20px] border border-[#EEF2F7] bg-white px-4 py-3"
                                    key={task.id}
                                  >
                                    <div className="flex flex-wrap items-start gap-2">
                                      <span
                                        className={`rounded-full px-2.5 py-1 text-[11px] font-black ${getTaskStatusClass(task.status)}`}
                                      >
                                        {getTaskStatusLabel(task.status)}
                                      </span>
                                      {task.category ? (
                                        <span className="rounded-full bg-[#F4F6FA] px-2.5 py-1 text-[11px] font-black text-[#667085]">
                                          {task.category}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-2 text-sm font-black leading-6 text-[#17213B]">{task.title}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#98A2B3]">
                                      {task.detail ? <span>{task.detail}</span> : null}
                                      {getRangeText(task) ? <span>{getRangeText(task)}</span> : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm font-semibold text-[#98A2B3]">숙제가 없습니다.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>

                <article className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black text-[#17213B]">교재 현황</h2>
                      <p className="mt-1 text-sm font-semibold text-[#98A2B3]">
                        체크리스트 교재와 개인 배정 교재를 함께 확인해요.
                      </p>
                    </div>
                    <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-black text-[#4F46E5]">
                      {studentTextbooks.length}권
                    </span>
                  </div>

                  {studentTextbooks.length === 0 ? (
                    <p className="py-12 text-center text-sm font-bold text-[#98A2B3]">배정된 교재가 없습니다.</p>
                  ) : (
                    <div className="mt-5 space-y-5">
                      {checkableTextbooks.length > 0 ? (
                        <div>
                          <p className="mb-3 text-sm font-black text-[#17213B]">체크리스트 교재</p>
                          <div className="space-y-2.5">
                            {checkableTextbooks.map((textbook) => {
                              const isSelected = selectedTextbookKey === textbook.textbook_key;
                              const progress = textbookProgressMap[textbook.textbook_key];
                              const percent = progress
                                ? Math.round((progress.summary.done / Math.max(progress.summary.total, 1)) * 100)
                                : null;

                              return (
                                <div key={textbook.id}>
                                  <button
                                    className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition ${
                                      isSelected
                                        ? "border-[#D9E2FF] bg-[#F8FAFF]"
                                        : "border-[#EEF2F7] bg-white hover:bg-[#FBFCFE]"
                                    }`}
                                    onClick={() =>
                                      setSelectedTextbookKey(isSelected ? null : textbook.textbook_key)
                                    }
                                    type="button"
                                  >
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        {textbook.subject ? (
                                          <span className="rounded-full bg-[#F4F6FA] px-2.5 py-1 text-[11px] font-black text-[#667085]">
                                            {textbook.subject}
                                          </span>
                                        ) : null}
                                        {textbook.is_student_only ? (
                                          <span className="rounded-full bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-black text-[#F97316]">
                                            개인 배정
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-2 text-sm font-black text-[#17213B]">
                                        {textbook.short_title || textbook.title}
                                      </p>
                                      <p className="mt-1 text-xs font-semibold text-[#98A2B3]">
                                        {progress
                                          ? `${progress.summary.done}/${progress.summary.total} 완료`
                                          : `${textbook.total_items}문항`}
                                      </p>
                                    </div>

                                    <div className="ml-4 flex shrink-0 items-center gap-3">
                                      {percent !== null ? (
                                        <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-black text-[#4F46E5]">
                                          {percent}%
                                        </span>
                                      ) : null}
                                      <span className="text-sm font-black text-[#98A2B3]">
                                        {isSelected ? "−" : "+"}
                                      </span>
                                    </div>
                                  </button>

                                  {isSelected ? (
                                    <div className="mt-2 rounded-[24px] border border-[#EEF2F7] bg-[#FBFCFE] p-4">
                                      {!progress ? (
                                        <p className="text-center text-sm font-bold text-[#98A2B3]">
                                          진도 데이터를 불러오지 못했습니다.
                                        </p>
                                      ) : (
                                        <>
                                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {[
                                              {
                                                label: "전체",
                                                value: progress.summary.total,
                                                cls: "bg-slate-100 text-slate-700",
                                              },
                                              {
                                                label: "완료",
                                                value: progress.summary.done,
                                                cls: "bg-emerald-50 text-emerald-700",
                                              },
                                              {
                                                label: "질문",
                                                value: progress.summary.partial,
                                                cls: "bg-amber-50 text-amber-700",
                                              },
                                              {
                                                label: "아직 안 함",
                                                value: progress.summary.not_started,
                                                cls: "bg-slate-100 text-slate-500",
                                              },
                                            ].map((stat) => (
                                              <div className={`rounded-[18px] p-3 text-center ${stat.cls}`} key={stat.label}>
                                                <p className="text-[11px] font-black opacity-70">{stat.label}</p>
                                                <p className="mt-1 text-lg font-black">{stat.value}</p>
                                              </div>
                                            ))}
                                          </div>

                                          {progress.items.length === 0 ? (
                                            <p className="mt-4 text-center text-sm font-bold text-[#98A2B3]">
                                              문항 데이터가 없습니다.
                                            </p>
                                          ) : (
                                            <div className="mt-4 flex flex-wrap gap-2">
                                              {progress.items.map((item) => {
                                                const itemLabel = getItemStatusLabel(item.status);
                                                return (
                                                  <span
                                                    className={`inline-flex items-center justify-center rounded-xl px-2.5 py-2 text-xs font-black ${getItemStatusClass(
                                                      item.status,
                                                    )}`}
                                                    key={item.id}
                                                    title={item.title}
                                                  >
                                                    {item.item_number}번
                                                    {itemLabel ? ` ${itemLabel}` : ""}
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {nonCheckableTextbooks.length > 0 ? (
                        <div>
                          <p className="mb-3 text-sm font-black text-[#17213B]">기타 배정 교재</p>
                          <div className="flex flex-wrap gap-2">
                            {nonCheckableTextbooks.map((textbook) => (
                              <span
                                className="rounded-full bg-[#F4F6FA] px-3 py-2 text-xs font-bold text-[#667085]"
                                key={textbook.id}
                              >
                                {textbook.short_title || textbook.title}
                                {textbook.subject ? ` · ${textbook.subject}` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </article>
              </section>
            </>
          )}
        </div>
      </div>

      <AdminBottomNav />
    </main>
  );
}
