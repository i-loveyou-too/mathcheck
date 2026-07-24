"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const MAX_LISTENING_AUDIO_BYTES = 100 * 1024 * 1024;

const SUBJECT_CHOICES: { subject: string; elective: string | null; label: string }[] = [
  { subject: "국어", elective: null, label: "국어 (공통)" },
  { subject: "국어", elective: "화법과 작문", label: "국어 · 화법과 작문" },
  { subject: "국어", elective: "언어와 매체", label: "국어 · 언어와 매체" },
  { subject: "수학", elective: null, label: "수학 (공통)" },
  { subject: "수학", elective: "확률과 통계", label: "수학 · 확률과 통계" },
  { subject: "수학", elective: "미적분", label: "수학 · 미적분" },
  { subject: "수학", elective: "기하", label: "수학 · 기하" },
  { subject: "영어", elective: null, label: "영어" },
  { subject: "탐구", elective: "생활과 윤리", label: "탐구 · 생활과 윤리" },
  { subject: "탐구", elective: "윤리와 사상", label: "탐구 · 윤리와 사상" },
  { subject: "탐구", elective: "사회문화", label: "탐구 · 사회문화" },
  { subject: "탐구", elective: "동아시아사", label: "탐구 · 동아시아사" },
];

type GradeCut = { grade: number; minimum_score: number };
type Media = { id: number; media_type: string; original_filename: string | null; admin_url: string };
type Question = { question_no: number; correct_answer: number | null; score_points: number; category: string | null; is_scored: boolean };
type Exam = {
  id: number; subject: string; elective_name: string | null; subject_label: string; title: string;
  question_count: number; total_score: number; duration_minutes: number | null;
  has_answer_key: boolean; grade_cuts: GradeCut[]; media: Media[]; questions?: Question[];
  has_listening_audio: boolean; has_solution_pdf: boolean;
  assignment_count: number; submitted_count: number;
};
type ExamSet = {
  id: number; title: string; round_no: number | null; scheduled_at: string | null; is_active: boolean;
  exam_count: number; assigned_student_count: number; completed_student_count: number; exams: Exam[];
};
type Template = { id: number; name: string; question_count: number; total_score: number; subject_category: string | null };
type Student = { id: number; name: string; grade: string };
type PreviewExam = { catalog_id: number; label: string };
type PreviewRow = {
  student_id: number; student_name: string | null;
  profile: { korean_elective: string | null; math_elective: string | null; inquiry_subject_1: string | null; inquiry_subject_2: string | null } | null;
  exams: PreviewExam[]; warnings: string[]; already_assigned: number[]; error?: string;
};

export default function AdminMockExamSetDetailPage() {
  const router = useRouter();
  const params = useParams<{ setId: string }>();
  const setId = Number(params.setId);
  const [data, setData] = useState<ExamSet | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newExam, setNewExam] = useState({ choice: "0", template_id: "", question_count: "", total_score: "", duration_minutes: "" });
  const [openExamId, setOpenExamId] = useState<number | null>(null);

  const [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, number[]>>({});
  const [schedule, setSchedule] = useState({ exam_date: "", available_from: "", deadline: "", result_open: "", solution_open: "" });

  const load = async () => setData(await apiFetch<ExamSet>(`/admin/mock-exam-sets/${setId}`));

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "불러오지 못했습니다."));
    void apiFetch<Template[]>("/admin/mock-score-templates").then((result) => {
      setTemplates(result);
      setNewExam((current) => {
        if (current.template_id) return current;
        const choice = SUBJECT_CHOICES[Number(current.choice)];
        const matchingTemplate = result.find((template) => template.subject_category === choice.subject);
        return matchingTemplate ? { ...current, template_id: String(matchingTemplate.id) } : current;
      });
    }).catch(() => null);
    void apiFetch<Student[]>("/admin/students").then(setStudents).catch(() => null);
  }, [setId, router]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(""); setNotice("");
    try { await action(); await load(); setNotice(message); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "요청을 처리하지 못했습니다."); }
  };

  const addExam = () => {
    const choice = SUBJECT_CHOICES[Number(newExam.choice)];
    const body: Record<string, unknown> = { subject: choice.subject, elective_name: choice.elective };
    if (newExam.template_id) {
      body.score_template_id = Number(newExam.template_id);
    } else {
      if (newExam.question_count) body.question_count = Number(newExam.question_count);
      if (newExam.total_score) body.total_score = Number(newExam.total_score);
    }
    if (newExam.duration_minutes) body.duration_minutes = Number(newExam.duration_minutes);
    void run(async () => {
      await apiFetch(`/admin/mock-exam-sets/${setId}/exams`, { method: "POST", body });
      setNewExam((current) => ({
        ...current,
        template_id: "",
        question_count: "",
        total_score: "",
        duration_minutes: "",
      }));
    }, "과목 시험을 추가했습니다.");
  };

  const runPreview = async () => {
    setError(""); setNotice("");
    if (selected.length === 0) { setError("학생을 선택하세요."); return; }
    try {
      const result = await apiFetch<{ students: PreviewRow[] }>(`/admin/mock-exam-sets/${setId}/assignment-preview`, {
        method: "POST", body: { student_ids: selected },
      });
      setPreview(result.students);
      setOverrides(Object.fromEntries(result.students.map((r) => [r.student_id, r.exams.map((e) => e.catalog_id)])));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "미리보기를 불러오지 못했습니다.");
    }
  };

  const confirmAssign = () => {
    if (!preview) return;
    if (!schedule.exam_date || !schedule.available_from || !schedule.deadline) { setError("시험일·응시 가능 시각·마감 시각을 입력하세요."); return; }
    const toIso = (v: string) => new Date(v).toISOString();
    const assignments = preview.filter((r) => !r.error).map((r) => ({
      student_id: r.student_id,
      exam_date: schedule.exam_date,
      available_from: toIso(schedule.available_from),
      submission_deadline_at: toIso(schedule.deadline),
      result_open_at: schedule.result_open ? toIso(schedule.result_open) : null,
      solution_open_at: schedule.solution_open ? toIso(schedule.solution_open) : null,
      catalog_ids: overrides[r.student_id] ?? [],
    }));
    void run(async () => {
      const result = await apiFetch<{ results: { student_id: number; status: string; created_subjects: string[]; duplicate_subjects: string[] }[] }>(
        `/admin/mock-exam-sets/${setId}/assignments`, { method: "POST", body: { assignments } },
      );
      const created = result.results.filter((r) => r.status === "created").length;
      const dup = result.results.filter((r) => r.status === "duplicate").length;
      const failed = result.results.filter((r) => r.status === "failed").length;
      setNotice(`배정 완료: 신규 ${created}명 · 중복 ${dup}명 · 실패 ${failed}명`);
      setPreview(null);
      setSelected([]);
    }, "배정을 처리했습니다.");
  };

  if (!data) return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error || "불러오는 중..."}</main>;

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href="/admin/mock-exams" className="text-sm font-bold text-[#64748B]">← 모의고사 회차 목록</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-[#17213B]">{data.title}</h1>
            <p className="mt-1 text-sm font-bold text-[#7A859F]">과목 {data.exam_count}개 · 배정 {data.assigned_student_count}명 · 응시 완료 {data.completed_student_count}명</p>
          </div>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-6 rounded-[24px] bg-white p-6 shadow-card">
          <h2 className="text-lg font-black text-[#17213B]">과목 시험 추가</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-6">
            <label className="text-[11px] font-bold text-[#7A859F] sm:col-span-2">과목
              <select
                value={newExam.choice}
                onChange={(e) => {
                  const choice = SUBJECT_CHOICES[Number(e.target.value)];
                  const matchingTemplate = templates.find((template) => template.subject_category === choice.subject);
                  setNewExam({
                    ...newExam,
                    choice: e.target.value,
                    template_id: matchingTemplate ? String(matchingTemplate.id) : "",
                    question_count: "",
                    total_score: "",
                  });
                }}
                className="mt-1 block h-10 w-full rounded-lg bg-[#F5F6FA] px-2 text-sm text-[#17213B]"
              >
                {SUBJECT_CHOICES.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-[#7A859F] sm:col-span-2">배점 템플릿
              <select
                value={newExam.template_id}
                onChange={(e) => setNewExam({
                  ...newExam,
                  template_id: e.target.value,
                  question_count: e.target.value ? "" : newExam.question_count,
                  total_score: e.target.value ? "" : newExam.total_score,
                })}
                className="mt-1 block h-10 w-full rounded-lg bg-[#F5F6FA] px-2 text-sm text-[#17213B]"
              >
                <option value="">직접 입력</option>
                {templates
                  .filter((template) => {
                    const choice = SUBJECT_CHOICES[Number(newExam.choice)];
                    return !template.subject_category || template.subject_category === choice.subject;
                  })
                  .map((t) => <option key={t.id} value={t.id}>{t.name} ({t.question_count}문항/{t.total_score}점)</option>)}
              </select>
            </label>
            {!newExam.template_id && (
              <>
                <label className="text-[11px] font-bold text-[#7A859F]">문항 수<input type="number" min="1" value={newExam.question_count} onChange={(e) => setNewExam({ ...newExam, question_count: e.target.value })} className="mt-1 block h-10 w-full rounded-lg bg-[#F5F6FA] px-2 text-sm" /></label>
                <label className="text-[11px] font-bold text-[#7A859F]">총점<input type="number" min="1" value={newExam.total_score} onChange={(e) => setNewExam({ ...newExam, total_score: e.target.value })} className="mt-1 block h-10 w-full rounded-lg bg-[#F5F6FA] px-2 text-sm" /></label>
              </>
            )}
            <label className="text-[11px] font-bold text-[#7A859F]">시험시간(분)<input type="number" min="1" value={newExam.duration_minutes} onChange={(e) => setNewExam({ ...newExam, duration_minutes: e.target.value })} className="mt-1 block h-10 w-full rounded-lg bg-[#F5F6FA] px-2 text-sm" /></label>
          </div>
          {newExam.template_id && (() => {
            const t = templates.find((x) => String(x.id) === newExam.template_id);
            return t ? <p className="mt-2 text-xs font-bold text-[#2874E8]">템플릿 적용: {t.question_count}문항 · 총점 {t.total_score}점 (배점이 시험지에 복사됩니다)</p> : null;
          })()}
          <button onClick={addExam} className="mt-3 h-10 rounded-lg bg-[#2874E8] px-5 text-xs font-black text-white">과목 추가</button>
        </section>

        <section className="mt-5 space-y-3">
          {data.exams.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">등록된 과목 시험이 없습니다.</div>}
          {data.exams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              open={openExamId === exam.id}
              onToggle={() => setOpenExamId(openExamId === exam.id ? null : exam.id)}
              onChanged={() => void load()}
              onNotice={setNotice}
              onError={setError}
            />
          ))}
        </section>

        <section className="mt-5 rounded-[24px] bg-white p-6 shadow-card">
          <h2 className="text-lg font-black text-[#17213B]">학생 배정</h2>
          <p className="mt-1 text-xs font-bold text-[#98A2B3]">학생을 선택하면 각자의 선택과목 프로필로 배정 과목이 자동 계산됩니다. 미리보기에서 과목을 조정한 뒤 확정하세요.</p>
          <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-[#EEF1F7] p-2">
            {students.map((student) => (
              <label key={student.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                <input type="checkbox" checked={selected.includes(student.id)} onChange={() => setSelected((v) => v.includes(student.id) ? v.filter((i) => i !== student.id) : [...v, student.id])} className="h-4 w-4 accent-[#2874E8]" />
                <span className="font-bold text-[#17213B]">{student.name}</span>
                <span className="text-xs text-[#98A2B3]">{student.grade}</span>
              </label>
            ))}
          </div>
          <button onClick={() => void runPreview()} className="mt-3 h-10 rounded-lg bg-[#17213B] px-5 text-xs font-black text-white">자동 선택 미리보기 ({selected.length}명)</button>

          {preview && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-5">
                <label className="text-[11px] font-bold text-[#7A859F]">시험일<input type="date" value={schedule.exam_date} onChange={(e) => setSchedule({ ...schedule, exam_date: e.target.value })} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
                <label className="text-[11px] font-bold text-[#7A859F]">응시 가능<input type="datetime-local" value={schedule.available_from} onChange={(e) => setSchedule({ ...schedule, available_from: e.target.value })} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
                <label className="text-[11px] font-bold text-[#7A859F]">제출 마감<input type="datetime-local" value={schedule.deadline} onChange={(e) => setSchedule({ ...schedule, deadline: e.target.value })} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
                <label className="text-[11px] font-bold text-[#7A859F]">결과 공개<input type="datetime-local" value={schedule.result_open} onChange={(e) => setSchedule({ ...schedule, result_open: e.target.value })} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
                <label className="text-[11px] font-bold text-[#7A859F]">해설 공개<input type="datetime-local" value={schedule.solution_open} onChange={(e) => setSchedule({ ...schedule, solution_open: e.target.value })} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
              </div>

              {preview.map((row) => (
                <div key={row.student_id} className="rounded-xl border border-[#EEF1F7] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-[#17213B]">{row.student_name ?? `#${row.student_id}`}</span>
                    {row.profile && (
                      <span className="text-[11px] font-bold text-[#98A2B3]">
                        국어 {row.profile.korean_elective ?? "-"} · 수학 {row.profile.math_elective ?? "-"} · 탐구 {row.profile.inquiry_subject_1 ?? "-"}/{row.profile.inquiry_subject_2 ?? "-"}
                      </span>
                    )}
                  </div>
                  {row.error && <p className="mt-1 text-xs font-bold text-red-500">{row.error}</p>}
                  {row.warnings.map((w) => <p key={w} className="mt-1 text-xs font-bold text-amber-600">⚠ {w}</p>)}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.exams.map((exam) => {
                      const on = (overrides[row.student_id] ?? []).includes(exam.id);
                      const already = row.already_assigned.includes(exam.id);
                      return (
                        <button
                          key={exam.id}
                          disabled={already}
                          onClick={() => setOverrides((prev) => {
                            const current = prev[row.student_id] ?? [];
                            return { ...prev, [row.student_id]: on ? current.filter((i) => i !== exam.id) : [...current, exam.id] };
                          })}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${already ? "bg-gray-100 text-gray-400" : on ? "bg-[#2874E8] text-white" : "bg-[#F0F2F8] text-[#17213B]"}`}
                        >
                          {exam.subject_label}{already ? " (배정됨)" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button onClick={confirmAssign} className="h-10 rounded-lg bg-[#2874E8] px-5 text-xs font-black text-white">이 내용으로 배정 확정</button>
            </div>
          )}
        </section>
      </div>
      <AdminBottomNav />
    </main>
  );
}

function ExamCard({ exam, open, onToggle, onChanged, onNotice, onError }: {
  exam: Exam; open: boolean; onToggle: () => void; onChanged: () => void; onNotice: (m: string) => void; onError: (m: string) => void;
}) {
  const [answerText, setAnswerText] = useState("");
  const [cuts, setCuts] = useState<Record<number, string>>(Object.fromEntries(exam.grade_cuts.map((g) => [g.grade, String(g.minimum_score)])));
  const [uploading, setUploading] = useState("");
  const isEnglish = exam.subject.includes("영어");
  const audio = exam.media.find((m) => m.media_type === "listening_audio");
  const solution = exam.media.find((m) => m.media_type === "solution_pdf");

  const saveAnswers = async () => {
    const rows = answerText.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const [q, a, s, cat] = line.split(",").map((p) => p.trim());
      return { question_no: Number(q), correct_answer: Number(a), score_points: Number(s), category: cat || null };
    });
    if (rows.length === 0) { onError("형식: 문항번호,정답,배점,영역(선택)"); return; }
    try {
      await apiFetch(`/admin/mock-exam-catalog/${exam.id}/questions`, { method: "PUT", body: { questions: rows } });
      onChanged(); onNotice("정답을 저장했습니다."); setAnswerText("");
    } catch (reason) { onError(reason instanceof ApiError ? reason.message : "정답을 저장하지 못했습니다."); }
  };

  const saveCuts = async () => {
    const grade_cuts = Object.entries(cuts).filter(([, v]) => v !== "").map(([g, v]) => ({ grade: Number(g), minimum_score: Number(v) }));
    try {
      await apiFetch(`/admin/mock-exam-catalog/${exam.id}/grade-cuts`, { method: "PUT", body: { grade_cuts } });
      onChanged(); onNotice("등급컷을 저장했습니다.");
    } catch (reason) { onError(reason instanceof ApiError ? reason.message : "등급컷을 저장하지 못했습니다."); }
  };

  const upload = async (kind: string, file: File) => {
    if (!API_BASE_URL) {
      onError("NEXT_PUBLIC_API_URL is not configured.");
      return;
    }
    if (kind === "listening-audio" && file.size > MAX_LISTENING_AUDIO_BYTES) {
      onError("듣기 MP3는 100MB 이하만 업로드할 수 있습니다.");
      return;
    }
    setUploading(kind);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_BASE_URL}/admin/mock-exam-catalog/${exam.id}/${kind}`, { method: "POST", body, credentials: "include" });
      if (!res.ok) {
        const responseBody = await res.json().catch(() => null);
        const message = res.status === 413
          ? "서버 업로드 용량 제한을 초과했습니다. nginx client_max_body_size 설정을 확인해주세요."
          : responseBody?.detail || "업로드 실패";
        throw new Error(message);
      }
      onChanged(); onNotice("파일을 업로드했습니다.");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "업로드하지 못했습니다."); }
    finally { setUploading(""); }
  };

  const deleteExam = async () => {
    if (!window.confirm(`"${exam.subject_label}" 과목 시험을 삭제할까요? 제출 기록이 있으면 삭제되지 않습니다.`)) return;
    try {
      await apiFetch(`/admin/mock-exam-catalog/${exam.id}`, { method: "DELETE" });
      onChanged();
      onNotice("과목 시험을 삭제했습니다.");
    } catch (reason) {
      onError(reason instanceof ApiError ? reason.message : "과목 시험을 삭제하지 못했습니다.");
    }
  };

  const prefill = () => {
    if (!exam.questions) return;
    setAnswerText(exam.questions.map((q) => `${q.question_no},${q.correct_answer ?? ""},${q.score_points}`).join("\n"));
  };

  return (
    <article className="rounded-[24px] bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-base font-black text-[#17213B]">{exam.subject_label}</span>
          <span className="ml-2 text-xs font-bold text-[#98A2B3]">{exam.question_count}문항 · {exam.total_score}점{exam.duration_minutes ? ` · ${exam.duration_minutes}분` : ""} · 배정 {exam.assignment_count}명 · 응시 {exam.submitted_count}명</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {exam.has_answer_key ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">정답 등록됨</span> : <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-500">정답 미등록</span>}
          {exam.grade_cuts.length > 0 && <span className="rounded-md bg-[#EAF5FF] px-2 py-0.5 text-[10px] font-black text-[#2874E8]">등급컷 {exam.grade_cuts.length}</span>}
          {isEnglish && (exam.has_listening_audio ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">듣기 있음</span> : <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">듣기 없음</span>)}
          {exam.has_solution_pdf ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">해설 있음</span> : <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">해설 없음</span>}
          <button onClick={onToggle} className="rounded-lg bg-[#EAF5FF] px-2.5 py-1.5 text-xs font-black text-[#2874E8]">{open ? "접기" : "관리"}</button>
          <button
            data-testid={`delete-set-exam-${exam.id}`}
            disabled={exam.submitted_count > 0}
            onClick={() => void deleteExam()}
            className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-black text-red-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            title={exam.submitted_count > 0 ? "제출 기록이 있어 삭제할 수 없습니다." : "과목 시험 삭제"}
          >
            과목 삭제
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-[#EEF1F7] pt-4">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-[#17213B]">정답 / 배점</p>
              <button onClick={prefill} className="text-[11px] font-bold text-[#2874E8]">현재 값 불러오기</button>
            </div>
            <p className="mt-1 text-[11px] font-bold text-[#98A2B3]">형식: 문항번호,정답,배점 — 채점 대상 배점 합은 총점({exam.total_score})과 같아야 합니다. 배정된 시험지는 배점 변경이 차단됩니다.</p>
            {exam.questions && exam.questions.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-[#F8F9FC] p-2 text-[11px] text-[#7A859F]">
                {exam.questions.map((q) => <span key={q.question_no} className="mr-2 inline-block">{q.question_no}:{q.correct_answer ?? "?"}/{q.score_points}점</span>)}
              </div>
            )}
            <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} rows={5} placeholder={"1,3,4\n2,5,3"} className="mt-2 w-full resize-none rounded-lg bg-[#F5F6FA] p-2 font-mono text-xs text-[#17213B]" />
            <button onClick={() => void saveAnswers()} className="mt-2 h-9 rounded-lg bg-[#2874E8] px-4 text-xs font-black text-white">정답 저장</button>
          </div>

          <div>
            <p className="text-xs font-black text-[#17213B]">등급컷</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                <label key={g} className="text-[11px] font-bold text-[#7A859F]">{g}등급
                  <input type="number" min="0" max={exam.total_score} value={cuts[g] ?? ""} onChange={(e) => setCuts({ ...cuts, [g]: e.target.value })} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" />
                </label>
              ))}
            </div>
            <button onClick={() => void saveCuts()} className="mt-2 h-9 rounded-lg bg-[#2874E8] px-4 text-xs font-black text-white">등급컷 저장</button>
          </div>

          <div>
            <p className="text-xs font-black text-[#17213B]">파일</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg bg-[#F0F2F8] px-3 py-2 text-xs font-bold text-[#17213B]">
                {uploading === "solution-file" ? "업로드 중..." : solution ? "해설지 교체" : "해설지 PDF 업로드"}
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload("solution-file", f); e.target.value = ""; }} />
              </label>
              {solution && <a href={`${API_BASE_URL}${solution.admin_url}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#F0F2F8] px-3 py-2 text-xs font-bold text-[#17213B]">해설 보기</a>}
              {isEnglish && (
                <label className="cursor-pointer rounded-lg bg-[#F0F2F8] px-3 py-2 text-xs font-bold text-[#17213B]">
                  {uploading === "listening-audio" ? "업로드 중..." : audio ? "듣기 MP3 교체" : "듣기 MP3 업로드"}
                  <input type="file" accept="audio/mpeg,.mp3" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload("listening-audio", f); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {isEnglish && audio && <audio controls preload="metadata" src={`${API_BASE_URL}${audio.admin_url}`} className="mt-2 w-full" />}
          </div>
        </div>
      )}
    </article>
  );
}
