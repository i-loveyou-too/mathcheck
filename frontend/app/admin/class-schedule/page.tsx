"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { ApiError, apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Student = { id: number; name: string; grade: string };
type LessonStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";
type ViewMode = "week" | "month" | "list";

type ClassScheduleEvent = {
  id: number | null;
  source: "event" | "schedule";
  student_id: number;
  student_name: string;
  schedule_id: number | null;
  subject: string;
  title: string | null;
  date: string;
  start_at: string;
  end_at: string;
  status: LessonStatus;
  event_type: string;
  memo: string | null;
  location: string | null;
  lesson_type: string;
  edit_url: string;
};

type ScheduleResponse = {
  start_date: string;
  end_date: string;
  student_id: number | null;
  events: ClassScheduleEvent[];
};

const statusLabels: Record<LessonStatus, string> = {
  scheduled: "예정",
  completed: "완료",
  cancelled: "취소",
  rescheduled: "변경됨",
};

const typeLabels: Record<string, string> = {
  regular: "정규",
  extra: "추가",
  makeup: "보강",
  trial: "체험",
  other: "기타",
};

const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
const MS_PER_DAY = 86400000;

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekStartOf(date: Date) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = base.getDay();
  base.setDate(base.getDate() + (day === 0 ? -6 : 1 - day));
  return base;
}

function monthStartOf(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function calendarMonthStart(date: Date) {
  return weekStartOf(monthStartOf(date));
}

function formatRange(start: Date, end: Date) {
  return `${start.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} - ${end.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function eventKey(event: ClassScheduleEvent) {
  return `${event.source}-${event.id ?? event.schedule_id}-${event.student_id}-${event.date}-${event.start_at}`;
}

function isToday(value: string) {
  return value === dateKey(new Date());
}

function eventStatus(event: ClassScheduleEvent): LessonStatus | "in_progress" {
  if (event.status !== "scheduled" || !isToday(event.date)) return event.status;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  if (timeToMinutes(event.start_at) <= current && current < timeToMinutes(event.end_at)) return "in_progress";
  return event.status;
}

function eventCardClass(event: ClassScheduleEvent) {
  const status = eventStatus(event);
  if (status === "in_progress") return "border-[#2874E8] bg-[#EAF5FF] text-[#10213D] shadow-[0_10px_22px_rgba(40,116,232,0.18)]";
  if (event.status === "completed") return "border-[#E4E7EC] bg-[#F8FAFC] text-[#667085]";
  if (event.status === "cancelled") return "border-[#E4E7EC] bg-[#F2F4F7] text-[#98A2B3] line-through";
  if (event.status === "rescheduled") return "border-amber-200 bg-amber-50 text-amber-700";
  if (isToday(event.date)) return "border-[#65E6BA] bg-[#F2FBF7] text-[#10213D] shadow-sm";
  return "border-[#DCEBFA] bg-white text-[#10213D]";
}

function statusBadgeClass(status: LessonStatus | "in_progress") {
  if (status === "in_progress") return "bg-[#2874E8] text-white";
  if (status === "scheduled") return "bg-blue-50 text-blue-600";
  if (status === "completed") return "bg-gray-100 text-gray-500";
  if (status === "cancelled") return "bg-gray-200 text-gray-500";
  return "bg-amber-50 text-amber-600";
}

function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function groupByDate(events: ClassScheduleEvent[]) {
  return events.reduce<Record<string, ClassScheduleEvent[]>>((acc, event) => {
    acc[event.date] = [...(acc[event.date] ?? []), event];
    return acc;
  }, {});
}

function layoutDayEvents(events: ClassScheduleEvent[]) {
  const sorted = [...events].sort((a, b) => a.start_at.localeCompare(b.start_at) || a.end_at.localeCompare(b.end_at));
  const positioned: Array<ClassScheduleEvent & { column: number; columns: number }> = [];
  let cluster: ClassScheduleEvent[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns: ClassScheduleEvent[][] = [];
    for (const event of cluster) {
      const start = timeToMinutes(event.start_at);
      let column = columns.findIndex((items) => timeToMinutes(items[items.length - 1].end_at) <= start);
      if (column === -1) {
        column = columns.length;
        columns.push([]);
      }
      columns[column].push(event);
      positioned.push({ ...event, column, columns: 0 });
    }
    const count = Math.max(columns.length, 1);
    for (let index = positioned.length - cluster.length; index < positioned.length; index += 1) {
      positioned[index].columns = count;
    }
  };

  for (const event of sorted) {
    const start = timeToMinutes(event.start_at);
    const end = timeToMinutes(event.end_at);
    if (cluster.length > 0 && start >= clusterEnd) {
      flush();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();
  return positioned;
}

function DetailPanel({
  event,
  onClose,
  onFilterStudent,
}: {
  event: ClassScheduleEvent | null;
  onClose: () => void;
  onFilterStudent: (studentId: number) => void;
}) {
  if (!event) return null;
  const status = eventStatus(event);
  return (
    <>
      <button type="button" aria-label="닫기" onClick={onClose} className="fixed inset-0 z-30 bg-black/20 lg:hidden" />
      <aside className="fixed bottom-0 left-0 right-0 z-40 max-h-[82vh] overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-[0_-16px_40px_rgba(15,23,42,0.18)] lg:fixed lg:bottom-auto lg:left-auto lg:right-6 lg:top-6 lg:w-[360px] lg:rounded-[28px] lg:shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-[#2874E8]">LESSON DETAIL</p>
            <h2 className="mt-2 text-2xl font-black text-[#17213B]">{event.student_name}</h2>
            <p className="mt-1 text-sm font-bold text-[#667085]">{event.subject}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-[#F2F4F7] px-3 py-1.5 text-xs font-black text-[#667085]">닫기</button>
        </div>
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="font-bold text-[#8290A6]">날짜</dt><dd className="font-black text-[#17213B]">{event.date}</dd></div>
          <div className="flex justify-between gap-4"><dt className="font-bold text-[#8290A6]">시간</dt><dd className="font-black text-[#17213B]">{event.start_at}~{event.end_at}</dd></div>
          <div className="flex justify-between gap-4"><dt className="font-bold text-[#8290A6]">상태</dt><dd><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusBadgeClass(status)}`}>{status === "in_progress" ? "진행 중" : statusLabels[event.status]}</span></dd></div>
          <div className="flex justify-between gap-4"><dt className="font-bold text-[#8290A6]">방식/장소</dt><dd className="text-right font-black text-[#17213B]">{event.location || typeLabels[event.lesson_type] || "-"}</dd></div>
          <div><dt className="font-bold text-[#8290A6]">메모</dt><dd className="mt-1 rounded-2xl bg-[#F7F9FB] px-4 py-3 font-bold text-[#52627A]">{event.memo || "메모 없음"}</dd></div>
        </dl>
        <div className="mt-6 grid gap-2">
          <button type="button" onClick={() => onFilterStudent(event.student_id)} className="h-12 rounded-2xl bg-[#10213D] text-sm font-black text-white">학생 일정만 보기</button>
          <Link href={event.edit_url} className="h-12 rounded-2xl border border-[#DCE4ED] bg-white text-center text-sm font-black leading-[3rem] text-[#2874E8]">기존 일정 관리에서 수정</Link>
        </div>
      </aside>
    </>
  );
}

export default function AdminClassSchedulePage() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<LessonStatus[]>(["scheduled", "completed"]);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [events, setEvents] = useState<ClassScheduleEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ClassScheduleEvent | null>(null);
  const [selectedMobileDate, setSelectedMobileDate] = useState(dateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const range = useMemo(() => {
    if (viewMode === "month") {
      const start = calendarMonthStart(anchorDate);
      return { start, end: addDays(start, 41) };
    }
    const start = weekStartOf(anchorDate);
    return { start, end: addDays(start, 6) };
  }, [anchorDate, viewMode]);

  const days = useMemo(() => Array.from({ length: viewMode === "month" ? 42 : 7 }, (_, index) => addDays(range.start, index)), [range.start, viewMode]);
  const groupedEvents = useMemo(() => groupByDate(events), [events]);
  const selectedStudent = useMemo(() => students.find((student) => student.id === studentId) ?? null, [studentId, students]);

  useEffect(() => {
    if (!getAdmin()?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }
    void apiFetch<Student[]>("/admin/students")
      .then(setStudents)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "학생 목록을 불러오지 못했습니다."));
  }, [router]);

  useEffect(() => {
    if (!getAdmin()?.isLoggedIn) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      start_date: dateKey(range.start),
      end_date: dateKey(range.end),
    });
    if (studentId !== "all") params.set("student_id", String(studentId));
    if (statusFilter.length > 0) params.set("status", statusFilter.join(","));
    setLoading(true);
    setError("");
    void apiFetch<ScheduleResponse>(`/admin/class-schedules?${params.toString()}`, { signal: controller.signal })
      .then((result) => {
        setEvents(result.events);
      })
      .catch((reason) => {
        if ((reason as Error).name !== "AbortError") {
          setEvents([]);
          setError(reason instanceof ApiError ? reason.message : "수업 일정을 불러오지 못했습니다.");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [range.start, range.end, studentId, statusFilter]);

  const stats = useMemo(() => {
    if (!selectedStudent) return null;
    const nowKey = dateKey(new Date());
    const visible = events.filter((event) => event.student_id === selectedStudent.id);
    const next = visible
      .filter((event) => event.status === "scheduled" && `${event.date} ${event.start_at}` >= `${nowKey} 00:00`)
      .sort((a, b) => `${a.date} ${a.start_at}`.localeCompare(`${b.date} ${b.start_at}`))[0];
    return {
      next,
      scheduled: visible.filter((event) => event.status === "scheduled").length,
      completed: visible.filter((event) => event.status === "completed").length,
    };
  }, [events, selectedStudent]);

  const hourBounds = useMemo(() => {
    const activeEvents = events.filter((event) => event.status !== "cancelled");
    const min = Math.min(8 * 60, ...activeEvents.map((event) => timeToMinutes(event.start_at)));
    const max = Math.max(23 * 60, ...activeEvents.map((event) => timeToMinutes(event.end_at)));
    return {
      startHour: Math.max(0, Math.floor(min / 60)),
      endHour: Math.min(24, Math.ceil(max / 60)),
    };
  }, [events]);
  const hours = Array.from({ length: hourBounds.endHour - hourBounds.startHour + 1 }, (_, index) => hourBounds.startHour + index);
  const minuteHeight = 1.35;
  const gridHeight = Math.max((hourBounds.endHour - hourBounds.startHour) * 60 * minuteHeight, 720);

  const movePeriod = (direction: number) => {
    setAnchorDate((current) => addDays(current, viewMode === "month" ? direction * 30 : direction * 7));
  };

  const toggleStatus = (status: LessonStatus) => {
    setStatusFilter((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]);
  };

  const selectStudentOnly = (nextStudentId: number) => {
    setStudentId(nextStudentId);
    setSelectedEvent(null);
  };

  const currentMinute = new Date().getHours() * 60 + new Date().getMinutes();
  const currentLineTop = (currentMinute - hourBounds.startHour * 60) * minuteHeight;
  const showCurrentLine = viewMode === "week" && currentLineTop >= 0 && currentLineTop <= gridHeight;

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black tracking-[0.14em] text-[#2874E8]">ADMIN · CLASS SCHEDULE</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-[#17213B]">수업 일정</h1>
            <p className="mt-2 text-sm font-semibold text-[#667085]">학생별 정규 수업과 일회성 수업을 통합해 확인합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setAnchorDate(new Date()); setSelectedMobileDate(dateKey(new Date())); }} className="h-10 rounded-xl bg-white px-4 text-sm font-black text-[#17213B] shadow-card">오늘</button>
            <button type="button" onClick={() => movePeriod(-1)} className="h-10 rounded-xl bg-white px-4 text-sm font-black text-[#52627A] shadow-card">이전</button>
            <button type="button" onClick={() => movePeriod(1)} className="h-10 rounded-xl bg-white px-4 text-sm font-black text-[#52627A] shadow-card">다음</button>
          </div>
        </header>

        <section className="mt-5 rounded-[24px] bg-white p-4 shadow-card">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="text-lg font-black text-[#17213B]">{formatRange(range.start, range.end)}</div>
            <div className="flex flex-wrap gap-2">
              {(["week", "month", "list"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setViewMode(mode)} className={`h-10 rounded-xl px-4 text-sm font-black ${viewMode === mode ? "bg-[#10213D] text-white" : "bg-[#F4F6FA] text-[#667085]"}`}>
                  {mode === "week" ? "주간" : mode === "month" ? "월간" : "목록"}
                </button>
              ))}
              <select value={studentId} onChange={(event) => setStudentId(event.target.value === "all" ? "all" : Number(event.target.value))} className="h-10 rounded-xl bg-[#F4F6FA] px-3 text-sm font-black text-[#17213B]">
                <option value="all">전체 학생</option>
                {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["scheduled", "completed", "cancelled", "rescheduled"] as LessonStatus[]).map((status) => (
              <button key={status} type="button" onClick={() => toggleStatus(status)} className={`rounded-full px-3 py-2 text-xs font-black ${statusFilter.includes(status) ? statusBadgeClass(status) : "bg-[#F4F6FA] text-[#98A2B3]"}`}>
                {statusLabels[status]}
              </button>
            ))}
          </div>
        </section>

        {selectedStudent && stats && (
          <section className="mt-4 grid gap-3 rounded-[24px] bg-[#10213D] p-4 text-white shadow-card sm:grid-cols-4">
            <div><p className="text-xs font-bold text-white/60">학생</p><p className="mt-1 text-lg font-black">{selectedStudent.name}</p></div>
            <div><p className="text-xs font-bold text-white/60">다음 수업</p><p className="mt-1 text-sm font-black">{stats.next ? `${stats.next.date} ${stats.next.start_at}` : "없음"}</p></div>
            <div><p className="text-xs font-bold text-white/60">조회 기간 예정</p><p className="mt-1 text-lg font-black">{stats.scheduled}회</p></div>
            <div><p className="text-xs font-bold text-white/60">조회 기간 완료</p><p className="mt-1 text-lg font-black">{stats.completed}회</p></div>
          </section>
        )}

        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <section className="mt-5 hidden lg:block">
          {viewMode === "week" && (
            <div className="overflow-hidden rounded-[26px] bg-white shadow-card">
              <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-[#E4EAF2]">
                <div className="bg-[#F8FAFC]" />
                {days.map((day, index) => {
                  const key = dateKey(day);
                  return (
                    <div key={key} className={`px-3 py-4 text-center ${isToday(key) ? "bg-[#EAF5FF]" : ""}`}>
                      <p className="text-xs font-black text-[#8290A6]">{weekdays[index]}</p>
                      <p className="mt-1 text-lg font-black text-[#17213B]">{day.getDate()}</p>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]">
                <div className="relative bg-[#F8FAFC]" style={{ height: gridHeight }}>
                  {hours.map((hour) => (
                    <div key={hour} className="absolute left-0 right-0 border-t border-[#EDF1F5] pr-2 text-right text-[11px] font-bold text-[#98A2B3]" style={{ top: (hour - hourBounds.startHour) * 60 * minuteHeight }}>
                      {`${hour}`.padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                {days.map((day) => {
                  const key = dateKey(day);
                  const positioned = layoutDayEvents(groupedEvents[key] ?? []);
                  return (
                    <div key={key} className={`relative border-l border-[#EDF1F5] ${isToday(key) ? "bg-[#FAFDFF]" : "bg-white"}`} style={{ height: gridHeight }}>
                      {hours.map((hour) => <div key={hour} className="absolute left-0 right-0 border-t border-[#F1F4F8]" style={{ top: (hour - hourBounds.startHour) * 60 * minuteHeight }} />)}
                      {showCurrentLine && isToday(key) && <div className="absolute left-0 right-0 z-10 h-[2px] bg-[#FF5A5F]" style={{ top: currentLineTop }} />}
                      {positioned.map((event) => {
                        const top = (timeToMinutes(event.start_at) - hourBounds.startHour * 60) * minuteHeight;
                        const height = Math.max((timeToMinutes(event.end_at) - timeToMinutes(event.start_at)) * minuteHeight - 4, 38);
                        const width = 100 / event.columns;
                        return (
                          <button
                            key={eventKey(event)}
                            type="button"
                            onClick={() => setSelectedEvent(event)}
                            className={`absolute z-20 overflow-hidden rounded-xl border px-2 py-1.5 text-left text-xs ${eventCardClass(event)}`}
                            style={{ top, height, left: `${event.column * width}%`, width: `${width}%` }}
                          >
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${statusBadgeClass(eventStatus(event))}`}>{eventStatus(event) === "in_progress" ? "진행 중" : statusLabels[event.status]}</span>
                            <p className="mt-1 truncate font-black">{event.student_name}</p>
                            <p className="truncate font-bold">{event.subject}</p>
                            <p className="truncate text-[11px] font-bold opacity-75">{event.start_at}~{event.end_at}</p>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "month" && (
            <div className="grid grid-cols-7 overflow-hidden rounded-[26px] bg-white shadow-card">
              {days.map((day) => {
                const key = dateKey(day);
                const dayEvents = groupedEvents[key] ?? [];
                return (
                  <button key={key} type="button" onClick={() => { setViewMode("list"); setAnchorDate(day); }} className={`min-h-[140px] border-b border-r border-[#EDF1F5] p-3 text-left ${day.getMonth() === anchorDate.getMonth() ? "bg-white" : "bg-[#F8FAFC]"} ${isToday(key) ? "ring-2 ring-inset ring-[#2874E8]" : ""}`}>
                    <div className="flex items-center justify-between"><span className="text-sm font-black text-[#17213B]">{day.getDate()}</span><span className="text-xs font-black text-[#8290A6]">{dayEvents.length}개</span></div>
                    <div className="mt-3 space-y-1">
                      {dayEvents.slice(0, 3).map((event) => <p key={eventKey(event)} className="truncate rounded-lg bg-[#F4F7FF] px-2 py-1 text-xs font-bold text-[#2874E8]">{event.start_at} {event.student_name}</p>)}
                      {dayEvents.length > 3 && <p className="text-xs font-black text-[#667085]">+{dayEvents.length - 3}개</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-5 lg:hidden">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {days.slice(0, viewMode === "month" ? 14 : 7).map((day) => {
              const key = dateKey(day);
              return (
                <button key={key} type="button" onClick={() => setSelectedMobileDate(key)} className={`min-w-[76px] rounded-2xl px-3 py-3 text-center shadow-card ${selectedMobileDate === key ? "bg-[#10213D] text-white" : "bg-white text-[#17213B]"}`}>
                  <p className="text-xs font-black opacity-70">{weekdays[day.getDay() === 0 ? 6 : day.getDay() - 1]}</p>
                  <p className="text-lg font-black">{day.getDate()}</p>
                  <p className="text-[11px] font-bold opacity-70">{(groupedEvents[key] ?? []).length}개</p>
                </button>
              );
            })}
          </div>
          <div className="mt-3 space-y-2">
            {(groupedEvents[selectedMobileDate] ?? []).length === 0 && <p className="rounded-[24px] bg-white p-6 text-center text-sm font-bold text-[#98A2B3] shadow-card">선택한 날짜에 수업이 없습니다.</p>}
            {(groupedEvents[selectedMobileDate] ?? []).map((event) => (
              <button key={eventKey(event)} type="button" onClick={() => setSelectedEvent(event)} className={`w-full rounded-[20px] border p-4 text-left ${eventCardClass(event)}`}>
                <div className="flex items-center justify-between gap-2"><p className="font-black">{event.start_at}~{event.end_at}</p><span className={`rounded-full px-2 py-1 text-[11px] font-black ${statusBadgeClass(eventStatus(event))}`}>{eventStatus(event) === "in_progress" ? "진행 중" : statusLabels[event.status]}</span></div>
                <p className="mt-2 text-lg font-black">{event.student_name}</p>
                <p className="text-sm font-bold opacity-80">{event.subject}{event.location ? ` · ${event.location}` : ""}</p>
              </button>
            ))}
          </div>
        </section>

        {(viewMode === "list" || viewMode === "month") && (
          <section className={`${viewMode === "list" ? "mt-5" : "mt-5 hidden lg:block"} space-y-4`}>
            {days.map((day) => {
              const key = dateKey(day);
              const dayEvents = groupedEvents[key] ?? [];
              if (viewMode === "list" && dayEvents.length === 0) return null;
              return (
                <div key={key} className="rounded-[24px] bg-white p-5 shadow-card">
                  <h2 className="font-black text-[#17213B]">{day.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}</h2>
                  <div className="mt-3 space-y-2">
                    {dayEvents.length === 0 && <p className="text-sm font-bold text-[#98A2B3]">수업 없음</p>}
                    {dayEvents.map((event) => (
                      <button key={eventKey(event)} type="button" onClick={() => setSelectedEvent(event)} className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${eventCardClass(event)}`}>
                        <div><p className="font-black">{event.start_at}~{event.end_at} {event.student_name} / {event.subject}</p><p className="text-xs font-bold opacity-75">{[typeLabels[event.lesson_type], event.location, event.memo].filter(Boolean).join(" · ")}</p></div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${statusBadgeClass(eventStatus(event))}`}>{eventStatus(event) === "in_progress" ? "진행 중" : statusLabels[event.status]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!loading && events.length === 0 && <p className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">조회 기간에 표시할 수업이 없습니다.</p>}
          </section>
        )}

        {loading && <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#8290A6] shadow-card">수업 일정을 불러오는 중...</p>}
      </div>
      <DetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} onFilterStudent={selectStudentOnly} />
      <AdminBottomNav />
    </main>
  );
}
