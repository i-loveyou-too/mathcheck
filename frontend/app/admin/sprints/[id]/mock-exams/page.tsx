"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

type Round = {
  id: number; round_no: number; title: string; exam_date: string; weekday_label: string;
  status: string; question_count: number; is_date_overridden: boolean; original_exam_date: string | null;
  has_answer_key: boolean;
};
type Series = {
  id: number; title: string; recurrence_weekday: number; recurrence_weekday_label: string;
  first_exam_date: string; submission_deadline_time: string; generation_mode: string; total_rounds: number | null;
  subject: string; default_question_count: number; is_active: boolean; round_count: number;
  rounds?: Round[];
};

const statusLabels: Record<string, string> = { scheduled: "예정", open: "응시 가능", closed: "마감" };
const today = new Date().toISOString().slice(0, 10);

type ProgramSettings = {
  mock_exam_weekday: number | null;
  mock_exam_start_time: string | null;
  mock_exam_submission_deadline_time: string | null;
  first_mock_exam_date: string | null;
};

export default function AdminSprintMockExamsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const programId = Number(params.id);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [expanded, setExpanded] = useState<Record<number, Series>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [programSettings, setProgramSettings] = useState<ProgramSettings | null>(null);
  const [bridgeDismissed, setBridgeDismissed] = useState(false);
  const [form, setForm] = useState({
    title: "SPRINT 모의고사", recurrence_weekday: "6", first_exam_date: today,
    submission_deadline_time: "23:00", generation_mode: "until_sprint_end", total_rounds: "8",
    subject: "", default_question_count: "20", default_total_score: "100",
  });

  const load = async () => {
    setSeriesList(await apiFetch<Series[]>(`/admin/sprints/${programId}/mock-exam-series`));
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다."));
    void apiFetch<ProgramSettings>(`/admin/sprints/${programId}`).then(setProgramSettings).catch(() => null);
  }, [programId, router]);

  const applyProgramSettings = () => {
    if (!programSettings) return;
    setForm((prev) => ({
      ...prev,
      recurrence_weekday: programSettings.mock_exam_weekday != null ? String(programSettings.mock_exam_weekday) : prev.recurrence_weekday,
      first_exam_date: programSettings.first_mock_exam_date ?? prev.first_exam_date,
      submission_deadline_time: programSettings.mock_exam_submission_deadline_time ?? prev.submission_deadline_time,
    }));
    setBridgeDismissed(true);
  };

  const showBridge = !bridgeDismissed && seriesList.length === 0 && programSettings?.mock_exam_weekday != null;

  const toggleExpand = async (seriesId: number) => {
    if (expanded[seriesId]) {
      setExpanded((prev) => { const next = { ...prev }; delete next[seriesId]; return next; });
      return;
    }
    const detail = await apiFetch<Series>(`/admin/mock-exam-series/${seriesId}`);
    setExpanded((prev) => ({ ...prev, [seriesId]: detail }));
  };

  const createSeries = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/admin/sprints/${programId}/mock-exam-series`, {
        method: "POST",
        body: {
          title: form.title,
          recurrence_weekday: Number(form.recurrence_weekday),
          first_exam_date: form.first_exam_date,
          submission_deadline_time: form.submission_deadline_time,
          generation_mode: form.generation_mode,
          total_rounds: form.generation_mode === "fixed_rounds" ? Number(form.total_rounds) : null,
          subject: form.subject,
          default_question_count: Number(form.default_question_count),
          default_total_score: Number(form.default_total_score),
        },
      });
      await load();
      setNotice("시리즈와 회차를 생성했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "시리즈를 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const run = async (action: () => Promise<unknown>, message: string, seriesId?: number) => {
    setError(""); setNotice("");
    try {
      await action();
      await load();
      if (seriesId && expanded[seriesId]) {
        const detail = await apiFetch<Series>(`/admin/mock-exam-series/${seriesId}`);
        setExpanded((prev) => ({ ...prev, [seriesId]: detail }));
      }
      setNotice(message);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "요청을 처리하지 못했습니다.");
    }
  };

  const rescheduleSingle = (round: Round) => {
    const newDate = window.prompt("새 시험일 (YYYY-MM-DD)", round.exam_date);
    if (!newDate) return;
    void run(() => apiFetch(`/admin/mock-exams/${round.id}/reschedule`, { method: "POST", body: { exam_date: newDate } }), "이 회차의 일정을 변경했습니다.");
  };

  const rescheduleFrom = (seriesId: number, round: Round) => {
    const newDate = window.prompt(`${round.round_no}회차부터 새 시험일 (YYYY-MM-DD, 이후 회차는 7일 간격으로 재계산)`, round.exam_date);
    if (!newDate) return;
    void run(() => apiFetch(`/admin/mock-exam-series/${seriesId}/reschedule-from/${round.id}`, { method: "POST", body: { exam_date: newDate } }), `${round.round_no}회차부터 이후 일정을 재계산했습니다.`, seriesId);
  };

  const rescheduleAll = (series: Series) => {
    const newFirst = window.prompt("전체 시리즈 새 첫 시험일 (YYYY-MM-DD)", series.first_exam_date);
    if (!newFirst) return;
    const weekday = new Date(newFirst).getDay();
    const mondayIndexed = weekday === 0 ? 6 : weekday - 1;
    void run(() => apiFetch(`/admin/mock-exam-series/${series.id}/reschedule-all`, {
      method: "POST",
      body: {
        recurrence_weekday: mondayIndexed, first_exam_date: newFirst,
        submission_deadline_time: series.submission_deadline_time,
        generation_mode: series.generation_mode, total_rounds: series.total_rounds,
      },
    }), "전체 시리즈 일정을 재생성했습니다. (이미 제출된 회차는 유지됨)", series.id);
  };

  const generateMore = (seriesId: number) => {
    void run(() => apiFetch(`/admin/mock-exam-series/${seriesId}/generate-rounds`, { method: "POST" }), "회차를 추가 생성했습니다.", seriesId);
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href={`/admin/sprints/${programId}`} className="text-sm font-bold text-[#64748B]">← SPRINT 상세</Link>
        <div className="mt-4">
          <p className="text-sm font-bold text-[#FF6B4A]">MOCK EXAM SERIES (구버전)</p>
          <h1 className="mt-1 text-3xl font-black text-[#17213B]">주간 반복 모의고사</h1>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
          <p className="text-sm font-black text-amber-800">⚠ 이 화면은 이전 버전입니다.</p>
          <p className="mt-1 text-xs font-bold text-amber-700">
            여기서 등록한 시험은 저장은 되지만 학생 SPRINT 화면과 새 관리자 회차 목록에는 표시되지 않습니다.
            새 시험은 반드시{" "}
            <Link href={`/admin/sprints/${programId}/mock-exam-rounds`} className="underline">모의고사 회차 관리</Link>
            {" "}(과목별 시험지를 등록하는 화면)에서 등록해주세요.
          </p>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        {showBridge && (
          <div className="mt-5 rounded-2xl bg-[#EAF5FF] px-5 py-4">
            <p className="text-sm font-black text-[#10213D]">
              SPRINT 프로그램 생성 시 설정한 모의고사 요일({weekdays[programSettings!.mock_exam_weekday!]}요일)이 있지만, 아직 시리즈가 생성되지 않았습니다.
            </p>
            <p className="mt-1 text-xs font-bold text-[#2874E8]">
              첫 시험일 {programSettings?.first_mock_exam_date ?? "미설정"} · 제출 마감 {programSettings?.mock_exam_submission_deadline_time ?? "미설정"}
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={applyProgramSettings} className="rounded-xl bg-[#2874E8] px-4 py-2 text-xs font-black text-white">이 설정으로 시리즈 생성 폼 채우기</button>
              <button onClick={() => setBridgeDismissed(true)} className="rounded-xl bg-white px-4 py-2 text-xs font-black text-[#6E7F99]">닫기</button>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[380px_1fr]">
          <form onSubmit={createSeries} className="h-fit rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">시리즈 생성</h2>
            <div className="mt-4 space-y-3 text-xs font-bold text-[#7A859F]">
              <label className="block">제목<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">기본 시험 요일<select value={form.recurrence_weekday} onChange={(e) => setForm({ ...form, recurrence_weekday: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]">{weekdays.map((w, i) => <option key={i} value={i}>{w}요일</option>)}</select></label>
              <label className="block">첫 시험일 (요일 일치 필요)<input type="date" value={form.first_exam_date} onChange={(e) => setForm({ ...form, first_exam_date: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">OMR 제출 마감시간<input type="time" value={form.submission_deadline_time} onChange={(e) => setForm({ ...form, submission_deadline_time: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">종료 방식<select value={form.generation_mode} onChange={(e) => setForm({ ...form, generation_mode: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]"><option value="until_sprint_end">SPRINT 종료일까지</option><option value="fixed_rounds">총 회차 수</option></select></label>
              {form.generation_mode === "fixed_rounds" && (
                <label className="block">총 회차 수<input type="number" min="1" value={form.total_rounds} onChange={(e) => setForm({ ...form, total_rounds: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block">기본 과목<input required placeholder="예: 국어, 영어" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
                <label className="block">기본 문항 수<input type="number" min="1" value={form.default_question_count} onChange={(e) => setForm({ ...form, default_question_count: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              </div>
              <label className="block">기본 총점<input type="number" min="1" value={form.default_total_score} onChange={(e) => setForm({ ...form, default_total_score: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            </div>
            <button disabled={saving} className="mt-5 h-12 w-full rounded-2xl bg-[#5C63FF] text-sm font-black text-white disabled:opacity-50">{saving ? "생성 중..." : "시리즈 생성 (회차 자동 생성)"}</button>
          </form>

          <section className="space-y-4">
            {seriesList.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">등록된 시리즈가 없습니다.</div>}
            {seriesList.map((series) => {
              const detail = expanded[series.id];
              return (
                <article key={series.id} className="rounded-[24px] bg-white p-5 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black text-[#17213B]">{series.title}</h2>
                      <p className="mt-1 text-sm font-bold text-[#7A859F]">
                        매주 {series.recurrence_weekday_label}요일 · 첫 시험 {series.first_exam_date} · 마감 {series.submission_deadline_time} · {series.round_count}회차
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => generateMore(series.id)} className="rounded-xl bg-[#F0F2F8] px-3 py-2 text-xs font-black text-[#17213B]">회차 추가생성</button>
                      <button onClick={() => rescheduleAll(series)} className="rounded-xl bg-[#17213B] px-3 py-2 text-xs font-black text-white">전체 일정 변경</button>
                      <button onClick={() => void toggleExpand(series.id)} className="rounded-xl bg-[#EAF5FF] px-3 py-2 text-xs font-black text-[#2874E8]">{detail ? "접기" : "회차 보기"}</button>
                    </div>
                  </div>

                  {detail?.rounds && (
                    <div className="mt-4 space-y-2">
                      {detail.rounds.map((round) => (
                        <div key={round.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EEF1F7] p-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-[#17213B]">{round.round_no}회차 · {round.exam_date} ({round.weekday_label})</span>
                              <span className="rounded-md bg-[#F1F3FF] px-2 py-0.5 text-[10px] font-black text-[#5C63FF]">{statusLabels[round.status] ?? round.status}</span>
                              {round.is_date_overridden && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">일정 변경</span>}
                              {!round.has_answer_key && <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-500">정답 미등록</span>}
                            </div>
                            <p className="mt-0.5 text-xs font-bold text-[#98A2B3]">{round.title} · {round.question_count}문항</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Link href={`/admin/sprints/${programId}/mock-exams/${round.id}`} className="rounded-lg bg-[#5C63FF] px-2.5 py-1.5 text-xs font-black text-white">관리</Link>
                            <button onClick={() => rescheduleSingle(round)} className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">이 회차만</button>
                            <button onClick={() => rescheduleFrom(series.id, round)} className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">이후 전체</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
