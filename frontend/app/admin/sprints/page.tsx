"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Student = { id: number; name: string; grade: string };
type Bank = { id: number; title: string; word_count: number; total_days: number; words_per_day: number; default_daily_test_question_count: number };
type Sprint = {
  id: number;
  student_name: string;
  title: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  status: "scheduled" | "active" | "completed";
  day_info: { day_number: number; total_days: number; days_remaining: number };
  features: Record<string, boolean>;
  strike_summary: { effective: number; threshold: number };
  overall_goal_progress: number | null;
};

const today = new Date().toISOString().slice(0, 10);
const plus = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const statusLabels = { scheduled: "예정", active: "진행 중", completed: "종료" };
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

export default function AdminSprintsPage() {
  const router = useRouter();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [filter, setFilter] = useState<"all" | "scheduled" | "active" | "completed">("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    student_id: "",
    title: "SPRINT 프로그램",
    description: "",
    start_date: today,
    end_date: plus(30),
    enable_mock_exam: false,
    mock_exam_weekday: "0",
    mock_exam_start_time: "09:00",
    mock_exam_submission_deadline_time: "23:00",
    first_mock_exam_date: "",
    enable_seat_check: false,
    seat_check_open_time: "07:00",
    seat_check_deadline_time: "08:00",
    seat_check_strike_on_late: true,
    seat_check_strike_on_missing: true,
    planner_mode: "paper",
    planner_deadline_time: "23:00",
    planner_strike_on_late: true,
    planner_strike_on_missing: true,
    enable_study_time_submission: false,
    daily_study_goal_hours: "8",
    study_time_deadline_time: "23:00",
    study_time_strike_on_missing: false,
    study_time_strike_on_shortage: false,
    enable_vocabulary: false,
    vocabulary_bank_id: "",
    vocabulary_start_bank_day: "1",
    vocabulary_bank_day_direction: "ascending",
    vocabulary_bank_days_per_learning_day: "3",
    vocabulary_max_question_count: "100",
    vocabulary_allow_student_answer_pdf: false,
    enable_goals: true,
    enable_three_strikes: true,
    strike_threshold: "3",
    enable_penalty_assignment: false,
    penalty_word_count: "20",
    penalty_repetition_count: "5",
    penalty_due_hours: "24",
  });

  const selectedBank = banks.find((bank) => String(bank.id) === form.vocabulary_bank_id) ?? null;
  const requiredVocabDays = useMemo(() => {
    if (!selectedBank) return null;
    return Math.ceil(selectedBank.total_days / Number(form.vocabulary_bank_days_per_learning_day || 3));
  }, [selectedBank, form.vocabulary_bank_days_per_learning_day]);

  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const load = async () => {
    const [rows, studentRows, bankRows] = await Promise.all([
      apiFetch<Sprint[]>("/admin/sprints"),
      apiFetch<Student[]>("/admin/students"),
      apiFetch<Bank[]>("/admin/vocabulary-banks"),
    ]);
    setSprints(rows);
    setStudents(studentRows);
    setBanks(bankRows);
    setForm((current) => ({
      ...current,
      student_id: current.student_id || (studentRows[0] ? String(studentRows[0].id) : ""),
      vocabulary_bank_id: current.vocabulary_bank_id || (bankRows[0] ? String(bankRows[0].id) : ""),
    }));
  };

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "SPRINT 목록을 불러오지 못했습니다."));
  }, [router]);

  const createSprint = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const studyMinutes = Math.round(Number(form.daily_study_goal_hours || 0) * 60);
      const created = await apiFetch<Sprint>("/admin/sprints", {
        method: "POST",
        body: {
          student_id: Number(form.student_id),
          title: form.title,
          description: form.description || null,
          start_date: form.start_date,
          end_date: form.end_date,
          is_active: true,
          enable_mock_exam: form.enable_mock_exam,
          mock_exam_weekday: form.enable_mock_exam ? Number(form.mock_exam_weekday) : null,
          mock_exam_start_time: form.enable_mock_exam ? form.mock_exam_start_time : null,
          mock_exam_submission_deadline_time: form.enable_mock_exam ? form.mock_exam_submission_deadline_time : null,
          first_mock_exam_date: form.enable_mock_exam && form.first_mock_exam_date ? form.first_mock_exam_date : null,
          enable_seat_check: form.enable_seat_check,
          seat_check_open_time: form.enable_seat_check ? form.seat_check_open_time : null,
          seat_check_deadline_time: form.enable_seat_check ? form.seat_check_deadline_time : null,
          seat_check_strike_on_late: form.seat_check_strike_on_late,
          seat_check_strike_on_missing: form.seat_check_strike_on_missing,
          planner_mode: form.planner_mode,
          planner_deadline_time: form.planner_mode === "paper" ? form.planner_deadline_time : null,
          planner_strike_on_late: form.planner_mode === "paper" && form.planner_strike_on_late,
          planner_strike_on_missing: form.planner_mode === "paper" && form.planner_strike_on_missing,
          enable_study_time_submission: form.enable_study_time_submission,
          daily_study_goal_minutes: form.enable_study_time_submission ? studyMinutes : null,
          study_time_deadline_time: form.enable_study_time_submission ? form.study_time_deadline_time : null,
          study_time_strike_on_missing: form.study_time_strike_on_missing,
          study_time_strike_on_shortage: form.study_time_strike_on_shortage,
          enable_vocabulary: form.enable_vocabulary,
          enable_vocabulary_challenge: form.enable_vocabulary,
          vocabulary_bank_id: form.enable_vocabulary ? Number(form.vocabulary_bank_id) : null,
          vocabulary_start_bank_day: form.enable_vocabulary ? Number(form.vocabulary_start_bank_day) : null,
          vocabulary_bank_day_direction: form.vocabulary_bank_day_direction,
          vocabulary_bank_days_per_learning_day: Number(form.vocabulary_bank_days_per_learning_day || 3),
          vocabulary_max_question_count: Number(form.vocabulary_max_question_count || 100),
          vocabulary_allow_student_answer_pdf: form.vocabulary_allow_student_answer_pdf,
          enable_goals: form.enable_goals,
          enable_three_strikes: form.enable_three_strikes,
          strike_threshold: Number(form.strike_threshold),
          enable_penalty_assignment: form.enable_penalty_assignment,
          penalty_word_count: Number(form.penalty_word_count),
          penalty_repetition_count: Number(form.penalty_repetition_count),
          penalty_due_hours: Number(form.penalty_due_hours),
        },
      });
      router.push(`/admin/sprints/${created.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "SPRINT를 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const visible = sprints.filter((sprint) => filter === "all" || sprint.status === filter);

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#5C63FF]">ADMIN · SPRINT</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">SPRINT 통합 배정</h1>
            <p className="mt-2 text-sm text-[#7A859F]">학생별 기간, 인증, 영단어, 목표 운영 설정을 한 번에 배정합니다.</p>
          </div>
          <span className="rounded-full bg-[#E7E9FF] px-4 py-2 text-sm font-black text-[#4C52D6]">{sprints.length}개</span>
        </div>

        {error && <p className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <div className="grid gap-5 xl:grid-cols-[460px_1fr]">
          <form onSubmit={createSprint} className="h-fit space-y-4 rounded-[28px] bg-[#141B34] p-6 text-white shadow-xl">
            <Section title="1. 기본 기간">
              <label className="block text-xs font-bold text-white/60">학생<select required value={form.student_id} onChange={(event) => update({ student_id: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-[#26304C] px-4 text-white"><option value="">학생 선택</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label>
              <input required value={form.title} onChange={(event) => update({ title: event.target.value })} className="h-12 w-full rounded-2xl border-0 bg-white/10 px-4 text-white outline-none ring-1 ring-white/10" placeholder="SPRINT 제목" />
              <div className="grid grid-cols-2 gap-3"><DateInput label="시작일" value={form.start_date} onChange={(value) => update({ start_date: value })} /><DateInput label="종료일" value={form.end_date} onChange={(value) => update({ end_date: value })} /></div>
            </Section>

            <Section title="2. 매주 모의고사">
              <Toggle label="사용" checked={form.enable_mock_exam} onChange={(value) => update({ enable_mock_exam: value })} />
              {form.enable_mock_exam && <div className="grid grid-cols-2 gap-3"><SelectInput label="요일" value={form.mock_exam_weekday} onChange={(value) => update({ mock_exam_weekday: value })}>{weekdays.map((day, index) => <option key={day} value={index}>{day}요일</option>)}</SelectInput><TimeInput label="시작" value={form.mock_exam_start_time} onChange={(value) => update({ mock_exam_start_time: value })} /><TimeInput label="마감" value={form.mock_exam_submission_deadline_time} onChange={(value) => update({ mock_exam_submission_deadline_time: value })} /><DateInput label="첫 시험일" value={form.first_mock_exam_date} onChange={(value) => update({ first_mock_exam_date: value })} /></div>}
            </Section>

            <Section title="3. 착석 인증">
              <Toggle label="사용" checked={form.enable_seat_check} onChange={(value) => update({ enable_seat_check: value })} />
              {form.enable_seat_check && <div className="grid grid-cols-2 gap-3"><TimeInput label="오픈" value={form.seat_check_open_time} onChange={(value) => update({ seat_check_open_time: value })} /><TimeInput label="마감" value={form.seat_check_deadline_time} onChange={(value) => update({ seat_check_deadline_time: value })} /><Toggle label="지각 스트라이크" checked={form.seat_check_strike_on_late} onChange={(value) => update({ seat_check_strike_on_late: value })} /><Toggle label="미제출 스트라이크" checked={form.seat_check_strike_on_missing} onChange={(value) => update({ seat_check_strike_on_missing: value })} /></div>}
            </Section>

            <Section title="4. 플래너 방식">
              <SelectInput label="방식" value={form.planner_mode} onChange={(value) => update({ planner_mode: value })}><option value="paper">종이 플래너 사진</option><option value="today_system">오늘도 해냄 플래너 사용</option><option value="disabled">사용 안 함</option></SelectInput>
              {form.planner_mode === "paper" && <div className="grid grid-cols-2 gap-3"><TimeInput label="마감" value={form.planner_deadline_time} onChange={(value) => update({ planner_deadline_time: value })} /><Toggle label="지각 스트라이크" checked={form.planner_strike_on_late} onChange={(value) => update({ planner_strike_on_late: value })} /><Toggle label="미제출 스트라이크" checked={form.planner_strike_on_missing} onChange={(value) => update({ planner_strike_on_missing: value })} /></div>}
              {form.planner_mode === "today_system" && <p className="rounded-2xl bg-white/10 p-3 text-xs font-bold text-white/65">SPRINT 플래너 사진 제출은 비활성화하고, 학생에게 오늘도 해냄 플래너 사용 상태를 보여줍니다.</p>}
            </Section>

            <Section title="5. 공부시간">
              <Toggle label="인증 제출 사용" checked={form.enable_study_time_submission} onChange={(value) => update({ enable_study_time_submission: value })} />
              {form.enable_study_time_submission && <div className="grid grid-cols-2 gap-3"><NumberInput label="목표 시간" value={form.daily_study_goal_hours} onChange={(value) => update({ daily_study_goal_hours: value })} /><TimeInput label="마감" value={form.study_time_deadline_time} onChange={(value) => update({ study_time_deadline_time: value })} /><Toggle label="미제출 스트라이크" checked={form.study_time_strike_on_missing} onChange={(value) => update({ study_time_strike_on_missing: value })} /><Toggle label="부족 스트라이크" checked={form.study_time_strike_on_shortage} onChange={(value) => update({ study_time_strike_on_shortage: value })} /></div>}
            </Section>

            <Section title="6. 영단어 챌린지">
              <Toggle label="사용" checked={form.enable_vocabulary} onChange={(value) => update({ enable_vocabulary: value })} />
              {form.enable_vocabulary && <div className="space-y-3"><SelectInput label="워드뱅크" value={form.vocabulary_bank_id} onChange={(value) => { const bank = banks.find((item) => String(item.id) === value); update({ vocabulary_bank_id: value, vocabulary_start_bank_day: form.vocabulary_bank_day_direction === "descending" ? String(bank?.total_days ?? 1) : "1" }); }}>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.title} · {bank.word_count}개</option>)}</SelectInput>{selectedBank && <p className="rounded-2xl bg-white/10 p-3 text-xs font-bold text-white/65">{selectedBank.total_days} DAY · DAY당 {selectedBank.words_per_day}개 · 하루 {form.vocabulary_bank_days_per_learning_day} DAY 진행 시 총 {requiredVocabDays}일</p>}<div className="grid grid-cols-2 gap-3"><NumberInput label="시작 bank DAY" value={form.vocabulary_start_bank_day} onChange={(value) => update({ vocabulary_start_bank_day: value })} /><SelectInput label="방향" value={form.vocabulary_bank_day_direction} onChange={(value) => update({ vocabulary_bank_day_direction: value, vocabulary_start_bank_day: value === "descending" ? String(selectedBank?.total_days ?? 1) : "1" })}><option value="ascending">정방향</option><option value="descending">역방향</option></SelectInput><NumberInput label="하루 DAY" value={form.vocabulary_bank_days_per_learning_day} onChange={(value) => update({ vocabulary_bank_days_per_learning_day: value })} /><NumberInput label="최대 문항" value={form.vocabulary_max_question_count} onChange={(value) => update({ vocabulary_max_question_count: value })} /></div><Toggle label="학생 정답지 PDF 허용" checked={form.vocabulary_allow_student_answer_pdf} onChange={(value) => update({ vocabulary_allow_student_answer_pdf: value })} /></div>}
            </Section>

            <Section title="7. 최종 확인">
              <p className="text-xs font-bold leading-6 text-white/70">착석 {form.enable_seat_check ? `${form.seat_check_open_time}~${form.seat_check_deadline_time}` : "미사용"} · 플래너 {form.planner_mode} · 공부시간 {form.enable_study_time_submission ? `${form.daily_study_goal_hours}시간` : "미사용"} · 영단어 {form.enable_vocabulary && selectedBank ? `${selectedBank.title}, 하루 ${form.vocabulary_bank_days_per_learning_day} DAY` : "미사용"}</p>
            </Section>

            <button disabled={saving || !form.student_id} className="h-12 w-full rounded-2xl bg-[#7C82FF] font-black text-white disabled:opacity-50">{saving ? "만드는 중..." : "SPRINT 배정하기"}</button>
          </form>

          <section className="space-y-3">
            <div className="flex gap-2">{(["all", "scheduled", "active", "completed"] as const).map((key) => <button key={key} onClick={() => setFilter(key)} className={`rounded-full px-4 py-2 text-xs font-black transition ${filter === key ? "bg-[#141B34] text-white" : "bg-white text-[#7A859F]"}`}>{key === "all" ? "전체" : statusLabels[key]}</button>)}</div>
            {visible.map((sprint) => <Link href={`/admin/sprints/${sprint.id}`} key={sprint.id} className="block rounded-[24px] bg-white p-5 shadow-card"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-black text-[#17213B]">{sprint.title}</h2><p className="mt-1 text-sm font-semibold text-[#7A859F]">{sprint.student_name} · {sprint.start_date} ~ {sprint.end_date}</p><p className="mt-2 text-xs font-bold text-[#8A94A8]">DAY {sprint.day_info.day_number || "-"} / {sprint.day_info.total_days}</p></div><div className="text-right"><span className="rounded-full bg-[#F1F3FF] px-3 py-1 text-xs font-black text-[#5C63FF]">{statusLabels[sprint.status]}</span><p className="mt-2 text-xs font-bold text-[#E5533C]">스트라이크 {sprint.strike_summary.effective}/{sprint.strike_summary.threshold}</p></div></div></Link>)}
            {visible.length === 0 && <div className="rounded-[28px] bg-white p-10 text-center text-sm font-bold text-[#98A2B3]">해당 SPRINT가 없습니다.</div>}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-2xl bg-white/5 p-4"><h2 className="text-sm font-black text-white">{title}</h2>{children}</section>;
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold text-white/60">{label}<input type="time" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border-0 bg-white px-3 text-[#17213B]" /></label>;
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold text-white/60">{label}<input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border-0 bg-white px-3 text-[#17213B]" /></label>;
}

function NumberInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold text-white/60">{label}<input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border-0 bg-white px-3 text-[#17213B]" /></label>;
}

function SelectInput({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="text-xs font-bold text-white/60">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border-0 bg-[#26304C] px-3 text-white">{children}</select></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!checked)} className={`rounded-xl px-3 py-2 text-xs font-black transition ${checked ? "bg-[#7C82FF] text-white" : "bg-white/10 text-white/45"}`}>{label}</button>;
}
