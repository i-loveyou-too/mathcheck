"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Student = { id: number; name: string; grade: string };
type Schedule = {
  id: number; title: string | null; weekday: number; weekday_label: string;
  start_time: string; end_time: string; effective_start_date: string; effective_end_date: string | null;
  location: string | null; memo: string | null; is_active: boolean;
};
type LessonEvent = {
  id: number | null; source: "event" | "schedule"; schedule_id: number | null;
  event_date: string; weekday_label: string; start_time: string; end_time: string;
  event_type: string; status: string; title: string | null; location: string | null; memo: string | null;
};

const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
const typeLabels: Record<string, string> = { regular: "정규", extra: "추가", makeup: "보강", trial: "체험", other: "기타" };
const statusLabels: Record<string, string> = { scheduled: "예정", completed: "완료", cancelled: "취소", rescheduled: "변경됨" };
const statusStyles: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-600", completed: "bg-gray-100 text-gray-500",
  cancelled: "bg-red-50 text-red-500 line-through", rescheduled: "bg-amber-50 text-amber-600",
};
const today = new Date().toISOString().slice(0, 10);
const plus = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export default function AdminLessonSchedulesPage() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<LessonEvent[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [regForm, setRegForm] = useState({ title: "", weekday: "0", start_time: "17:00", end_time: "19:00", effective_start_date: today, location: "" });
  const [oneForm, setOneForm] = useState({ event_date: today, start_time: "17:00", end_time: "19:00", event_type: "makeup", title: "", location: "" });

  const load = async (sid: number) => {
    const [sch, ev] = await Promise.all([
      apiFetch<Schedule[]>(`/admin/lesson-schedules?student_id=${sid}`),
      apiFetch<{ events: LessonEvent[] }>(`/admin/lesson-events?student_id=${sid}&start=${today}&end=${plus(42)}`),
    ]);
    setSchedules(sch); setEvents(ev.events);
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void apiFetch<Student[]>("/admin/students").then((rows) => {
      setStudents(rows);
      if (rows[0]) { setStudentId(rows[0].id); void load(rows[0].id).catch(() => {}); }
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "학생 목록을 불러오지 못했습니다."));
  }, [router]);

  const selectStudent = (sid: number) => { setStudentId(sid); setError(""); void load(sid).catch((reason) => setError(reason instanceof ApiError ? reason.message : "불러오지 못했습니다.")); };
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2000); };
  const wrap = async (fn: () => Promise<void>, ok: string) => {
    if (!studentId) return; setError("");
    try { await fn(); await load(studentId); flash(ok); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "처리하지 못했습니다."); }
  };

  const addRegular = (e: React.FormEvent) => { e.preventDefault(); void wrap(async () => {
    await apiFetch("/admin/lesson-schedules", { method: "POST", body: {
      student_id: studentId, title: regForm.title || null, weekday: Number(regForm.weekday),
      start_time: regForm.start_time, end_time: regForm.end_time,
      effective_start_date: regForm.effective_start_date, location: regForm.location || null,
    }});
  }, "정규 수업을 등록했습니다."); };

  const addOneOff = (e: React.FormEvent) => { e.preventDefault(); void wrap(async () => {
    await apiFetch("/admin/lesson-events", { method: "POST", body: {
      student_id: studentId, event_date: oneForm.event_date, start_time: oneForm.start_time,
      end_time: oneForm.end_time, event_type: oneForm.event_type, title: oneForm.title || null, location: oneForm.location || null,
    }});
  }, "수업을 등록했습니다."); };

  const deactivate = (s: Schedule) => { if (!confirm("이 정규 수업을 비활성화할까요? (기록은 보존됩니다)")) return; void wrap(async () => { await apiFetch(`/admin/lesson-schedules/${s.id}/deactivate`, { method: "POST" }); }, "비활성화했습니다."); };

  const cancelOccurrence = (ev: LessonEvent) => {
    const reason = prompt("휴강 사유를 입력하세요 (선택)") ?? undefined;
    void wrap(async () => {
      if (ev.source === "schedule" && ev.schedule_id) {
        await apiFetch(`/admin/lesson-schedules/${ev.schedule_id}/cancel-occurrence`, { method: "POST", body: { event_date: ev.event_date, reason } });
      } else if (ev.id) {
        await apiFetch(`/admin/lesson-events/${ev.id}/cancel`, { method: "POST", body: { reason } });
      }
    }, "취소했습니다.");
  };

  const reschedule = (ev: LessonEvent) => {
    const newDate = prompt("변경할 날짜 (YYYY-MM-DD)", ev.event_date); if (!newDate) return;
    const newStart = prompt("시작 시간 (HH:MM)", ev.start_time); if (!newStart) return;
    const newEnd = prompt("종료 시간 (HH:MM)", ev.end_time); if (!newEnd) return;
    void wrap(async () => {
      if (ev.source === "schedule" && ev.schedule_id) {
        await apiFetch(`/admin/lesson-schedules/${ev.schedule_id}/reschedule-occurrence`, { method: "POST", body: {
          event_date: ev.event_date, new_date: newDate, new_start_time: newStart, new_end_time: newEnd,
        }});
      } else if (ev.id) {
        await apiFetch(`/admin/lesson-events/${ev.id}`, { method: "PATCH", body: { event_date: newDate, start_time: newStart, end_time: newEnd } });
      }
    }, "일정을 변경했습니다.");
  };

  return <main className="min-h-screen bg-[#EEF2F6] pb-32">
    <div className="mx-auto max-w-[1100px] px-5 py-8">
      <div className="mb-6"><p className="text-sm font-bold text-[#0E9F6E]">ADMIN · LESSONS</p><h1 className="mt-1 text-3xl font-black text-[#17213B]">수업 일정 관리</h1><p className="mt-2 text-sm text-[#7A859F]">정규 수업, 일회성 수업, 보강, 휴강, 시간 변경을 관리합니다. (Asia/Seoul)</p></div>

      <div className="mb-5 flex flex-wrap gap-2">
        {students.map((s) => (
          <button key={s.id} onClick={() => selectStudent(s.id)} className={`rounded-full px-4 py-2 text-sm font-black transition ${studentId === s.id ? "bg-[#141B34] text-white" : "bg-white text-[#7A859F]"}`}>{s.name}</button>
        ))}
      </div>
      {error && <p className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
      {msg && <p className="mb-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600">{msg}</p>}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <form onSubmit={addRegular} className="rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">정규 수업 등록</h2>
            <div className="mt-4 space-y-3 text-xs font-bold text-[#7A859F]">
              <label className="block">수업명 (선택)<input value={regForm.title} onChange={(e) => setRegForm({...regForm, title:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" placeholder="수학 과외" /></label>
              <label className="block">요일<select value={regForm.weekday} onChange={(e) => setRegForm({...regForm, weekday:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]">{weekdays.map((w, i) => <option key={i} value={i}>{w}요일</option>)}</select></label>
              <div className="flex gap-2">
                <label className="flex-1">시작<input type="time" value={regForm.start_time} onChange={(e) => setRegForm({...regForm, start_time:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
                <label className="flex-1">종료<input type="time" value={regForm.end_time} onChange={(e) => setRegForm({...regForm, end_time:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              </div>
              <label className="block">적용 시작일<input type="date" value={regForm.effective_start_date} onChange={(e) => setRegForm({...regForm, effective_start_date:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">장소 (선택)<input value={regForm.location} onChange={(e) => setRegForm({...regForm, location:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            </div>
            <button className="mt-4 h-11 w-full rounded-xl bg-[#0E9F6E] text-sm font-black text-white">정규 수업 추가</button>
          </form>

          <form onSubmit={addOneOff} className="rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">일회성 · 보강 수업</h2>
            <div className="mt-4 space-y-3 text-xs font-bold text-[#7A859F]">
              <label className="block">유형<select value={oneForm.event_type} onChange={(e) => setOneForm({...oneForm, event_type:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]"><option value="makeup">보강</option><option value="extra">추가 수업</option><option value="trial">체험</option><option value="other">기타</option></select></label>
              <label className="block">날짜<input type="date" value={oneForm.event_date} onChange={(e) => setOneForm({...oneForm, event_date:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <div className="flex gap-2">
                <label className="flex-1">시작<input type="time" value={oneForm.start_time} onChange={(e) => setOneForm({...oneForm, start_time:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
                <label className="flex-1">종료<input type="time" value={oneForm.end_time} onChange={(e) => setOneForm({...oneForm, end_time:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              </div>
              <label className="block">수업명 (선택)<input value={oneForm.title} onChange={(e) => setOneForm({...oneForm, title:e.target.value})} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            </div>
            <button className="mt-4 h-11 w-full rounded-xl bg-[#4C52D6] text-sm font-black text-white">수업 추가</button>
          </form>
        </div>

        <div className="space-y-5">
          <section className="rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">정규 수업 규칙</h2>
            <div className="mt-4 space-y-2">
              {schedules.length === 0 && <p className="rounded-xl bg-[#F7F8FB] px-4 py-3 text-sm font-bold text-[#98A2B3]">등록된 정규 수업이 없습니다.</p>}
              {schedules.map((s) => (
                <div key={s.id} className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${s.is_active ? "border-[#EEF1F7]" : "border-gray-100 bg-gray-50 opacity-60"}`}>
                  <div><p className="text-sm font-black text-[#17213B]">매주 {weekdays[s.weekday]}요일 {s.start_time}~{s.end_time}{s.title && ` · ${s.title}`}</p><p className="text-xs font-semibold text-[#7A859F]">{s.effective_start_date}부터{s.effective_end_date ? ` ~ ${s.effective_end_date}` : ""}{s.location && ` · ${s.location}`}</p></div>
                  {s.is_active && <button onClick={() => deactivate(s)} className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600">비활성화</button>}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">예정 수업 (6주)</h2>
            <div className="mt-4 space-y-2">
              {events.length === 0 && <p className="rounded-xl bg-[#F7F8FB] px-4 py-3 text-sm font-bold text-[#98A2B3]">예정된 수업이 없습니다.</p>}
              {events.map((ev, i) => (
                <div key={`${ev.event_date}-${ev.id ?? "s" + ev.schedule_id}-${i}`} className="flex items-center justify-between gap-2 rounded-xl border border-[#EEF1F7] p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-[#17213B]">{ev.event_date} ({ev.weekday_label}) {ev.start_time}~{ev.end_time}</p>
                      <span className="rounded-md bg-[#F1F3FF] px-1.5 py-0.5 text-[10px] font-black text-[#5C63FF]">{typeLabels[ev.event_type]}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${statusStyles[ev.status]}`}>{statusLabels[ev.status]}</span>
                    </div>
                    {(ev.title || ev.location) && <p className="truncate text-xs font-semibold text-[#7A859F]">{[ev.title, ev.location].filter(Boolean).join(" · ")}</p>}
                  </div>
                  {ev.status !== "cancelled" && ev.status !== "rescheduled" && (
                    <div className="flex shrink-0 gap-1.5">
                      <button onClick={() => reschedule(ev)} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-600">변경</button>
                      <button onClick={() => cancelOccurrence(ev)} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-500">휴강</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div><AdminBottomNav />
  </main>;
}
