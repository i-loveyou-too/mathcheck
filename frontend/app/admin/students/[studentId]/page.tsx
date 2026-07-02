"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { Header } from "@/components/header";
import { ProgressBar } from "@/components/progress-bar";
import { ScreenShell } from "@/components/screen-shell";
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
  textbook: { id: number; key: string; title: string; full_title: string; subject: string | null; problem_count: number };
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
function getDayLabel(dateStr: string) {
  return WEEKDAYS[new Date(`${dateStr}T00:00:00`).getDay()];
}

function getTaskStatusLabel(status: string) {
  if (status === "done") return "완료";
  if (status === "in_progress") return "진행중";
  return "예정";
}

function getTaskStatusClass(status: string) {
  if (status === "done") return "bg-emerald-100 text-emerald-600";
  if (status === "in_progress") return "bg-amber-100 text-amber-600";
  return "bg-gray-100 text-gray-500";
}

function getItemStatusLabel(status: string) {
  if (status === "done") return "○";
  if (status === "partial") return "△";
  return "-";
}

function getItemStatusClass(status: string) {
  if (status === "done") return "bg-emerald-100 text-emerald-700";
  if (status === "partial") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-400";
}

function getRangeText(task: WeeklyTask) {
  if (task.start_item_number === null) return null;
  if (task.start_item_number === task.end_item_number) return `${task.start_item_number}번`;
  return `${task.start_item_number}번 ~ ${task.end_item_number ?? "?"}번`;
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
          apiFetch<{ textbooks: StudentTextbookItem[] }>(`/admin/textbooks-for-student/${sid}`).catch(() => ({ textbooks: [] })),
        ]);

        setStudentInfo({ name: basicInfo.name, grade: basicInfo.grade });
        setItemProgress(progress);

        const textbooks = textbookData.textbooks ?? [];
        setStudentTextbooks(textbooks);

        const checkable = textbooks.filter((t) => t.is_checkable);
        if (checkable.length > 0) {
          const entries = await Promise.all(
            checkable.map((t) =>
              apiFetch<TextbookProgressData>(`/student/textbook-progress/${t.textbook_key}?student_id=${sid}`)
                .then((data) => [t.textbook_key, data] as const)
                .catch(() => null)
            )
          );
          const map: Record<string, TextbookProgressData> = {};
          for (const entry of entries) {
            if (entry) map[entry[0]] = entry[1];
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
    apiFetch<WeeklyTasksResponse>(`/student/weekly-tasks?student_id=${params.studentId}&week_start=${weekStart}`)
      .then((data) => setWeeklyData(data))
      .catch(() => setWeeklyData(null))
      .finally(() => setLoadingWeekly(false));
  }, [params.studentId, weekStart]);

  const moveWeek = (direction: -1 | 1) => {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + direction * 7);
    setWeekStart(toLocalDateKey(d));
  };

  const progressRate = Math.round(itemProgress?.overall.progress_rate ?? 0);
  const totalItems = itemProgress?.overall.total ?? 0;
  const doneItems = itemProgress?.overall.done ?? 0;
  const partialItems = itemProgress?.overall.partial ?? 0;

  const checkableTextbooks = studentTextbooks.filter((t) => t.is_checkable);
  const nonCheckableTextbooks = studentTextbooks.filter((t) => !t.is_checkable);

  return (
    <ScreenShell withBottomNav>
      <Header
        backHref="/admin/students"
        logoutType="admin"
        subtitle={studentInfo ? studentInfo.grade : "학생 상세 현황"}
        title={studentInfo ? `${studentInfo.name} 학생` : "불러오는 중..."}
      />

      {loadingInit ? (
        <div className="py-16 text-center text-sm font-bold text-gray-300">불러오는 중...</div>
      ) : (
        <>
          {/* 전체 진도 — textbook item 기반 */}
          <div className="rounded-3xl bg-[#0F172A] p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40">전체 진도</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-5xl font-black tracking-tight">{progressRate}%</p>
                <p className="mt-2 text-sm text-white/50">
                  {doneItems}개 완료 &middot; {totalItems - doneItems}개 남음
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-center">
                <p className="text-xs text-white/40">학년</p>
                <p className="mt-1 text-lg font-bold">{studentInfo?.grade ?? "-"}</p>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#FACC15] transition-all duration-700"
                style={{ width: `${progressRate}%` }}
              />
            </div>
          </div>

          {/* 통계 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-card">
              <p className="text-xs text-gray-400">전체 문항</p>
              <p className="mt-1.5 text-xl font-black tracking-tight text-gray-900">{totalItems}개</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-card">
              <p className="text-xs text-gray-400">완료</p>
              <p className="mt-1.5 text-xl font-black tracking-tight text-emerald-600">{doneItems}개</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-card">
              <p className="text-xs text-gray-400">질문/오답</p>
              <p className="mt-1.5 text-xl font-black tracking-tight text-amber-500">{partialItems}개</p>
            </div>
          </div>

          {/* 이번 주 숙제 */}
          <div className="rounded-3xl bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">이번 주 숙제</h2>
              <div className="flex items-center gap-1.5">
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200"
                  onClick={() => moveWeek(-1)}
                  type="button"
                >
                  ←
                </button>
                <span className="min-w-[88px] text-center text-xs font-bold text-gray-500">{weekStart} 주</span>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200"
                  onClick={() => moveWeek(1)}
                  type="button"
                >
                  →
                </button>
              </div>
            </div>

            {loadingWeekly ? (
              <p className="py-4 text-center text-sm font-bold text-gray-400">불러오는 중...</p>
            ) : !weeklyData || weeklyData.days.every((d) => d.tasks.length === 0) ? (
              <p className="py-4 text-center text-sm font-bold text-gray-300">이번 주 배정된 숙제가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {weeklyData.days.map((day) => {
                  if (day.tasks.length === 0) return null;
                  return (
                    <div key={day.date}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-xs font-black text-gray-600">
                          {day.date} ({getDayLabel(day.date)})
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                          {day.summary.done}/{day.summary.total} 완료
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {day.tasks.map((task) => (
                          <div className="flex items-start gap-2 rounded-2xl bg-[#F8FAFC] px-3 py-2" key={task.id}>
                            <span
                              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getTaskStatusClass(task.status)}`}
                            >
                              {getTaskStatusLabel(task.status)}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold leading-snug text-gray-900">{task.title}</p>
                              {task.detail ? <p className="mt-0.5 text-xs text-gray-400">{task.detail}</p> : null}
                              {getRangeText(task) ? (
                                <p className="mt-0.5 text-xs font-bold text-gray-400">{getRangeText(task)}</p>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 교재 현황 */}
          <div className="rounded-3xl bg-white p-5 shadow-card">
            <h2 className="mb-4 text-lg font-bold text-gray-900">교재 현황</h2>

            {studentTextbooks.length === 0 ? (
              <p className="text-sm font-bold text-gray-300">배정된 교재가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {checkableTextbooks.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-black text-gray-400">문항 체크리스트</p>
                    <div className="space-y-2">
                      {checkableTextbooks.map((textbook) => {
                        const isSelected = selectedTextbookKey === textbook.textbook_key;
                        const prog = textbookProgressMap[textbook.textbook_key];
                        const pct = prog ? Math.round((prog.summary.done / Math.max(prog.summary.total, 1)) * 100) : null;

                        return (
                          <div key={textbook.id}>
                            <button
                              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${isSelected ? "bg-[#0F172A] text-white" : "bg-[#F8FAFC] hover:bg-gray-100"}`}
                              onClick={() => setSelectedTextbookKey(isSelected ? null : textbook.textbook_key)}
                              type="button"
                            >
                              <div className="min-w-0">
                                <p className={`text-sm font-bold ${isSelected ? "text-white" : "text-gray-900"}`}>
                                  {textbook.short_title || textbook.title}
                                </p>
                                <p className={`mt-0.5 text-xs ${isSelected ? "text-white/60" : "text-gray-400"}`}>
                                  {textbook.subject ? `${textbook.subject} · ` : ""}
                                  {prog
                                    ? `${prog.summary.done}/${prog.summary.total} 완료`
                                    : `${textbook.total_items}문항`}
                                  {textbook.is_student_only ? " · 개인 배정" : ""}
                                </p>
                              </div>
                              <div className="ml-3 flex shrink-0 items-center gap-2">
                                {pct !== null ? (
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-black ${isSelected ? "bg-white/20 text-white" : pct === 100 ? "bg-emerald-100 text-emerald-700" : "bg-[#EEF2FF] text-[#5C5FFF]"}`}
                                  >
                                    {pct}%
                                  </span>
                                ) : null}
                                <span className={`text-sm font-bold ${isSelected ? "text-white/70" : "text-gray-400"}`}>
                                  {isSelected ? "▲" : "▼"}
                                </span>
                              </div>
                            </button>

                            {isSelected ? (
                              <div className="mt-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                {!prog ? (
                                  <p className="text-center text-sm font-bold text-gray-300">데이터 없음</p>
                                ) : (
                                  <>
                                    <div className="mb-3 grid grid-cols-4 gap-2">
                                      {[
                                        { label: "전체", value: prog.summary.total, cls: "bg-gray-100 text-gray-700" },
                                        { label: "○ 완료", value: prog.summary.done, cls: "bg-emerald-100 text-emerald-700" },
                                        { label: "△ 질문", value: prog.summary.partial, cls: "bg-amber-100 text-amber-700" },
                                        { label: "미체크", value: prog.summary.not_started, cls: "bg-gray-100 text-gray-400" },
                                      ].map((s) => (
                                        <div className={`rounded-xl p-2 text-center text-xs ${s.cls}`} key={s.label}>
                                          <p className="font-bold opacity-70">{s.label}</p>
                                          <p className="mt-0.5 text-base font-black">{s.value}</p>
                                        </div>
                                      ))}
                                    </div>
                                    {prog.items.length === 0 ? (
                                      <p className="text-center text-xs font-bold text-gray-300">문항 데이터 없음</p>
                                    ) : (
                                      <div className="flex flex-wrap gap-1.5">
                                        {prog.items.map((item) => (
                                          <span
                                            className={`inline-flex min-w-[44px] items-center justify-center rounded-lg px-1.5 py-1 text-xs font-bold ${getItemStatusClass(item.status)}`}
                                            key={item.id}
                                            title={item.title}
                                          >
                                            {item.item_number}
                                            {getItemStatusLabel(item.status) !== "-"
                                              ? ` ${getItemStatusLabel(item.status)}`
                                              : ""}
                                          </span>
                                        ))}
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
                    <p className="mb-2 text-xs font-black text-gray-400">기타 교재</p>
                    <div className="flex flex-wrap gap-2">
                      {nonCheckableTextbooks.map((textbook) => (
                        <span
                          className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600"
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
          </div>
        </>
      )}

      <AdminBottomNav />
    </ScreenShell>
  );
}
