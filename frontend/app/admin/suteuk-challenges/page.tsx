"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { MathText } from "@/components/math-text";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Student = { id: number; name: string; grade: string };
type ChallengeType = { code: string; title: string; short_title: string; total_days: number };
type ConceptSummary = {
  total: number;
  completed: number;
  progress_rate: number;
  counts: { know: number; unsure: number; dont_know: number; understood_after_card: number; still_dont_know: number };
} | null;
type FormulaSummary = {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  score_rate: number;
  completed: boolean;
  wrong_concepts: { question_code: string; concept_code: string; chapter: string; prompt: string }[];
} | null;
type ChallengeDay = {
  day: number;
  scheduled_date: string | null;
  total_tasks: number;
  completed_tasks: number;
  progress_rate: number;
  total_problems: number;
  concept_summary: ConceptSummary;
  formula_summary: FormulaSummary;
};
type FormulaQuestion = {
  code: string;
  chapter: string;
  prompt: string;
  answer_index: number | null;
  selected_answer: number | null;
  is_correct: boolean | null;
  concept_status: { response: string | null; final_status: string | null } | null;
};
type FormulaDayDetail = { day_number: number; summary: NonNullable<FormulaSummary>; items: FormulaQuestion[] };
type FormulaAdminDetail = { days: FormulaDayDetail[] };
type Assignment = {
  id: number;
  student_id: number;
  student_name: string | null;
  student_grade: string | null;
  challenge_type: string;
  challenge_title: string;
  challenge_short_title: string;
  start_date: string;
  status: "active" | "paused";
  current_day: number;
  total_days: number;
  schedule_ends_on: string;
  schedule_finished: boolean;
  is_rest_day: boolean;
  rest_dates: string[];
  overall_total_tasks: number;
  overall_completed_tasks: number;
  overall_progress_rate: number;
  today: ChallengeDay;
  days?: ChallengeDay[];
};

const today = new Date().toISOString().slice(0, 10);
const fallbackTypes: ChallengeType[] = [
  { code: "suteuk_10day", title: "수특 10일 챌린지", short_title: "수특 10일", total_days: 10 },
  { code: "suteuk_level2_5day", title: "수특 LEVEL 2 · 5일 챌린지", short_title: "수특 LEVEL 2", total_days: 5 },
];

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-red-50 text-[#E13D3D]" : "bg-slate-100 text-slate-500"}`}>
      {active ? "active" : "paused"}
    </span>
  );
}

export default function AdminSuteukChallengesPage() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [challengeTypes, setChallengeTypes] = useState<ChallengeType[]>(fallbackTypes);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Assignment | null>(null);
  const [formulaDetail, setFormulaDetail] = useState<FormulaAdminDetail | null>(null);
  const [form, setForm] = useState({ student_id: "", challenge_type: "suteuk_level2_5day", start_date: today });
  const [restDate, setRestDate] = useState(today);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => assignments.find((assignment) => assignment.id === selectedId) ?? null, [assignments, selectedId]);

  const load = async () => {
    const [studentRows, typeRows, assignmentRows] = await Promise.all([
      apiFetch<Student[]>("/admin/students"),
      apiFetch<ChallengeType[]>("/admin/suteuk-challenge-types").catch(() => fallbackTypes),
      apiFetch<Assignment[]>("/admin/suteuk-challenges"),
    ]);
    setStudents(studentRows);
    setChallengeTypes(typeRows);
    setAssignments(assignmentRows);
    setForm((value) => ({
      ...value,
      student_id: value.student_id || (studentRows[0] ? String(studentRows[0].id) : ""),
      challenge_type: value.challenge_type || (typeRows[0]?.code ?? "suteuk_level2_5day"),
    }));
    if (!selectedId && assignmentRows[0]) setSelectedId(assignmentRows[0].id);
  };

  useEffect(() => {
    if (!getAdmin()?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다."));
  }, [router]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setFormulaDetail(null);
      return;
    }
    void apiFetch<Assignment>(`/admin/suteuk-challenges/${selectedId}`)
      .then((value) => {
        setDetail(value);
        if (value.challenge_type === "suteuk_10day") {
          void apiFetch<FormulaAdminDetail>(`/admin/suteuk-challenges/${selectedId}/formula-check`)
            .then(setFormulaDetail)
            .catch(() => setFormulaDetail(null));
        } else {
          setFormulaDetail(null);
        }
      })
      .catch(() => {
        setDetail(null);
        setFormulaDetail(null);
      });
  }, [selectedId]);

  const createAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch<Assignment>("/admin/suteuk-challenges", {
        method: "POST",
        body: { student_id: Number(form.student_id), challenge_type: form.challenge_type, start_date: form.start_date },
      });
      await load();
      setSelectedId(created.id);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "챌린지를 배정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const updateAssignment = async (assignment: Assignment, body: Record<string, unknown>) => {
    setError("");
    try {
      const updated = await apiFetch<Assignment>(`/admin/suteuk-challenges/${assignment.id}`, { method: "PATCH", body });
      setAssignments((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setDetail(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "변경사항을 저장하지 못했습니다.");
    }
  };

  const deleteAssignment = async (assignment: Assignment) => {
    if (!window.confirm(`${assignment.student_name ?? "학생"}의 ${assignment.challenge_title} 배정을 취소할까요?`)) return;
    await apiFetch(`/admin/suteuk-challenges/${assignment.id}`, { method: "DELETE" });
    setSelectedId(null);
    await load();
  };

  const addRestDate = async () => {
    if (!selected || !restDate) return;
    setError("");
    try {
      const updated = await apiFetch<Assignment>(`/admin/suteuk-challenges/${selected.id}/rest-dates`, {
        method: "POST",
        body: { rest_date: restDate },
      });
      setAssignments((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setDetail(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "쉬는날을 지정하지 못했습니다.");
    }
  };

  const removeRestDate = async (dateValue: string) => {
    if (!selected) return;
    setError("");
    try {
      const updated = await apiFetch<Assignment>(`/admin/suteuk-challenges/${selected.id}/rest-dates/${dateValue}`, { method: "DELETE" });
      setAssignments((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setDetail(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "쉬는날을 해제하지 못했습니다.");
    }
  };

  return (
    <main className="min-h-screen bg-[#F6F7FB] pb-32">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black text-[#E13D3D]">ADMIN CHALLENGE</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-[#17213B]">수특 챌린지</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">챌린지 종류별 배정, 시작일, DAY별 진행률을 관리합니다.</p>
          </div>
          <Link href="/admin" className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#17213B] shadow-sm">관리자 홈</Link>
        </div>

        {error ? <p className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p> : null}

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <form onSubmit={createAssignment} className="h-fit rounded-[28px] bg-[#111827] p-6 text-white shadow-xl">
            <h2 className="text-xl font-black">챌린지 배정</h2>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-bold text-white/60">
                학생
                <select required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-[#253044] px-4 text-white">
                  <option value="">학생 선택</option>
                  {students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-white/60">
                챌린지
                <select required value={form.challenge_type} onChange={(event) => setForm({ ...form, challenge_type: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-[#253044] px-4 text-white">
                  {challengeTypes.map((type) => <option key={type.code} value={type.code}>{type.title}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-white/60">
                시작일
                <input type="date" required value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-4 text-[#17213B]" />
              </label>
            </div>
            <button disabled={saving || !form.student_id} className="mt-5 h-12 w-full rounded-2xl bg-[#FF5A5F] font-black text-white disabled:opacity-50">
              {saving ? "배정 중..." : "챌린지 시작"}
            </button>
          </form>

          <section className="space-y-4">
            <div className="overflow-hidden rounded-[28px] border border-[#EEF2F7] bg-white shadow-sm">
              <div className="hidden grid-cols-[1fr_1.2fr_110px_100px_120px_110px_90px] gap-3 bg-[#F8FAFC] px-5 py-3 text-xs font-black text-[#667085] lg:grid">
                <span>학생명</span><span>챌린지 종류</span><span>시작일</span><span>현재 DAY</span><span>오늘 진행률</span><span>전체 진행률</span><span>상태</span>
              </div>
              {assignments.length === 0 ? (
                <div className="p-10 text-center text-sm font-bold text-[#98A2B3]">아직 배정된 챌린지가 없습니다.</div>
              ) : assignments.map((assignment) => (
                <button key={assignment.id} type="button" onClick={() => setSelectedId(assignment.id)} className={`grid w-full gap-2 border-t border-[#EEF2F7] px-5 py-4 text-left transition hover:bg-[#FFF7F7] lg:grid-cols-[1fr_1.2fr_110px_100px_120px_110px_90px] lg:items-center ${selectedId === assignment.id ? "bg-[#FFF7F7]" : "bg-white"}`}>
                  <span className="font-black text-[#17213B]">{assignment.student_name} <span className="font-semibold text-[#98A2B3]">{assignment.student_grade}</span></span>
                  <span className="text-sm font-black text-[#17213B]">{assignment.challenge_title}</span>
                  <span className="text-sm font-bold text-[#667085]">{assignment.start_date}</span>
                  <span className="text-sm font-black text-[#E13D3D]">{assignment.is_rest_day ? "쉬는날" : `DAY ${assignment.current_day}${assignment.schedule_finished ? " 종료" : ""}`}</span>
                  <span className="text-sm font-bold text-[#667085]">{assignment.today.completed_tasks} / {assignment.today.total_tasks}</span>
                  <span className="text-sm font-black text-[#17213B]">{assignment.overall_completed_tasks}/{assignment.overall_total_tasks} · {assignment.overall_progress_rate}%</span>
                  <StatusPill status={assignment.status} />
                </button>
              ))}
            </div>

            {selected && (
              <div className="rounded-[28px] border border-[#EEF2F7] bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-[#17213B]">{selected.student_name} 진행상태</h2>
                    <p className="mt-1 text-sm font-bold text-[#98A2B3]">
                      {selected.challenge_title} · DAY 1~{selected.total_days}
                      {detail?.schedule_finished ? ` · 일정 종료일 ${detail.schedule_ends_on}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input type="date" value={detail?.start_date ?? selected.start_date} onChange={(event) => updateAssignment(selected, { start_date: event.target.value })} className="h-10 rounded-2xl border border-[#DDE4EF] px-3 text-sm font-bold" />
                    <button onClick={() => updateAssignment(selected, { status: selected.status === "active" ? "paused" : "active" })} className="h-10 rounded-2xl bg-[#EEF2FF] px-4 text-sm font-black text-[#4F46E5]">
                      {selected.status === "active" ? "paused로 변경" : "active로 변경"}
                    </button>
                    <button onClick={() => deleteAssignment(selected)} className="h-10 rounded-2xl bg-red-50 px-4 text-sm font-black text-red-600">배정 취소</button>
                  </div>
                </div>
                <section className="mt-5 rounded-[22px] bg-[#FFF7F7] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-[#E13D3D]">쉬는날</p>
                      <p className="mt-1 text-xs font-bold text-[#7A859F]">지정한 날짜는 Day 계산에서 제외되고 이후 Day가 하루씩 밀립니다.</p>
                    </div>
                    <div className="flex gap-2">
                      <input type="date" value={restDate} onChange={(event) => setRestDate(event.target.value)} className="h-10 rounded-2xl border border-[#DDE4EF] px-3 text-sm font-bold" />
                      <button type="button" onClick={() => void addRestDate()} className="h-10 rounded-2xl bg-[#E13D3D] px-4 text-sm font-black text-white">쉬는날 지정</button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(detail?.rest_dates ?? []).length === 0 ? (
                      <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-[#98A2B3]">지정된 쉬는날 없음</span>
                    ) : detail?.rest_dates.map((dateValue) => (
                      <button key={dateValue} type="button" onClick={() => void removeRestDate(dateValue)} className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#E13D3D] ring-1 ring-[#FFD1D1]">
                        {dateValue} 해제
                      </button>
                    ))}
                  </div>
                </section>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {(detail?.days ?? []).map((day) => (
                    <article key={day.day} className="rounded-[20px] border border-[#EEF2F7] p-4">
                      <p className="text-lg font-black text-[#17213B]">DAY {day.day}</p>
                      <p className="mt-1 text-xs font-black text-[#E13D3D]">{day.scheduled_date ?? "-"}</p>
                      <p className="mt-1 text-sm font-bold text-[#98A2B3]">{day.completed_tasks} / {day.total_tasks} task</p>
                      {day.concept_summary ? <p className="mt-1 text-xs font-black text-[#E13D3D]">개념 {day.concept_summary.completed}/{day.concept_summary.total}</p> : null}
                      {day.formula_summary ? <p className="mt-1 text-xs font-black text-[#4F46E5]">공식 {day.formula_summary.correct}/{day.formula_summary.total} · {day.formula_summary.score_rate}%</p> : null}
                      <div className="mt-3 h-2 rounded-full bg-[#F1F5F9]">
                        <div className="h-full rounded-full bg-[#FF5A5F]" style={{ width: `${day.progress_rate}%` }} />
                      </div>
                      <p className="mt-3 text-xs font-bold text-[#667085]">{day.total_problems ? `총 ${day.total_problems}문제` : "콘텐츠 준비 중"}</p>
                    </article>
                  ))}
                </div>
                {formulaDetail ? (
                  <div className="mt-6 rounded-[24px] border border-[#EEF2F7] bg-[#F8FAFC] p-4">
                    <h3 className="text-lg font-black text-[#17213B]">공식 CHECK 문항별 결과</h3>
                    <div className="mt-4 space-y-4">
                      {formulaDetail.days.map((formulaDay) => (
                        <section key={formulaDay.day_number} className="rounded-[20px] bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-black text-[#17213B]">DAY {formulaDay.day_number}</p>
                            <p className="text-sm font-black text-[#4F46E5]">{formulaDay.summary.correct}/{formulaDay.summary.total} · {formulaDay.summary.score_rate}%</p>
                          </div>
                          <div className="mt-3 space-y-2">
                            {formulaDay.items.map((item) => (
                              <div key={item.code} className="rounded-2xl border border-[#EEF2F7] px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${item.is_correct === true ? "bg-emerald-50 text-emerald-600" : item.is_correct === false ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                                    {item.is_correct === true ? "정답" : item.is_correct === false ? "오답" : "미응답"}
                                  </span>
                                  <span className="text-[11px] font-bold text-[#98A2B3]">{item.chapter}</span>
                                </div>
                                <p className="mt-2 text-sm font-bold text-[#17213B]"><MathText text={item.prompt} /></p>
                                <p className="mt-1 text-xs font-bold text-[#667085]">선택 {item.selected_answer === null ? "-" : item.selected_answer + 1} / 정답 {item.answer_index === null ? "-" : item.answer_index + 1}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
