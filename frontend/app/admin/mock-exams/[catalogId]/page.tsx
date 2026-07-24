"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

type GradeCut = { grade: number; minimum_score: number };
type Media = { id: number; media_type: string; original_filename: string | null; file_size: number; duration_seconds: number | null; admin_url: string };
type Question = { question_no: number; correct_answer: number; score_points: number; category: string | null; is_scored: boolean };
type Assignment = {
  id: number; student_id: number; exam_date: string; available_from: string; submission_deadline_at: string;
  result_open_at: string | null; solution_open_at: string | null; status: string; raw_score: number | null;
};
type Catalog = {
  id: number; title: string; subject: string; question_count: number; total_score: number; duration_minutes: number | null;
  is_published: boolean; has_answer_key: boolean; answer_key_total: number; grade_cuts: GradeCut[]; media: Media[];
  questions?: Question[]; assignments?: Assignment[];
};
type Student = { id: number; name: string; grade: string };

const STATUS_LABELS: Record<string, string> = { not_started: "미응시", draft: "작성 중", submitted: "제출됨", graded: "채점 완료", confirmed: "확정" };

export default function AdminMockExamCatalogDetailPage() {
  const router = useRouter();
  const params = useParams<{ catalogId: string }>();
  const catalogId = Number(params.catalogId);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [gradeCutValues, setGradeCutValues] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [examDate, setExamDate] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [deadline, setDeadline] = useState("");
  const [resultOpen, setResultOpen] = useState("");
  const [solutionOpen, setSolutionOpen] = useState("");

  const load = async () => {
    const detail = await apiFetch<Catalog>(`/admin/mock-exam-catalog/${catalogId}`);
    setCatalog(detail);
    setGradeCutValues(Object.fromEntries(detail.grade_cuts.map((gc) => [gc.grade, String(gc.minimum_score)])));
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "불러오지 못했습니다."));
    void apiFetch<Student[]>("/admin/students").then(setStudents).catch(() => null);
  }, [catalogId, router]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(""); setNotice("");
    try {
      await action();
      await load();
      setNotice(message);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "요청을 처리하지 못했습니다.");
    }
  };

  const saveQuestions = () => {
    const rows = answerText.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const [q, a, s, cat] = line.split(",").map((p) => p.trim());
      return { question_no: Number(q), correct_answer: Number(a), score_points: Number(s), category: cat || null };
    });
    if (rows.length === 0) { setError("형식: 문항번호,정답,배점,영역(선택)"); return; }
    void run(() => apiFetch(`/admin/mock-exam-catalog/${catalogId}/questions`, { method: "PUT", body: { questions: rows } }), "정답을 저장했습니다. (기존 제출자 전체 재채점)");
    setAnswerText("");
  };

  const saveGradeCuts = () => {
    const grade_cuts = Object.entries(gradeCutValues).filter(([, v]) => v !== "").map(([g, v]) => ({ grade: Number(g), minimum_score: Number(v) }));
    void run(() => apiFetch(`/admin/mock-exam-catalog/${catalogId}/grade-cuts`, { method: "PUT", body: { grade_cuts } }), "등급컷을 저장했습니다.");
  };

  const uploadMedia = async (kind: string, file: File) => {
    setUploading(kind);
    setError(""); setNotice("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_BASE_URL}/admin/mock-exam-catalog/${catalogId}/${kind}`, { method: "POST", body, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail || "업로드 실패");
      await load();
      setNotice("파일을 업로드했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "업로드하지 못했습니다.");
    } finally {
      setUploading("");
    }
  };

  const bulkAssign = () => {
    if (selectedStudents.length === 0) { setError("학생을 선택하세요."); return; }
    if (!examDate || !availableFrom || !deadline) { setError("시험일·응시 가능 시각·마감 시각을 입력하세요."); return; }
    const toIso = (local: string) => new Date(local).toISOString();
    const assignments = selectedStudents.map((student_id) => ({
      student_id, exam_date: examDate, available_from: toIso(availableFrom), submission_deadline_at: toIso(deadline),
      result_open_at: resultOpen ? toIso(resultOpen) : null, solution_open_at: solutionOpen ? toIso(solutionOpen) : null,
    }));
    void run(async () => {
      const result = await apiFetch<{ results: { student_id: number; status: string }[] }>(`/admin/mock-exam-catalog/${catalogId}/assignments`, { method: "POST", body: { assignments } });
      const created = result.results.filter((r) => r.status === "created").length;
      const dup = result.results.filter((r) => r.status === "duplicate").length;
      const failed = result.results.filter((r) => r.status === "failed").length;
      setNotice(`배정 완료: 신규 ${created} · 중복 ${dup} · 실패 ${failed}`);
    }, "배정을 처리했습니다.");
    setSelectedStudents([]);
  };

  if (!catalog) return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error || "불러오는 중..."}</main>;

  const isEnglish = catalog.subject.includes("영어");
  const worksheet = catalog.media.find((m) => m.media_type === "worksheet_pdf");
  const solution = catalog.media.find((m) => m.media_type === "solution_pdf");
  const audio = catalog.media.find((m) => m.media_type === "listening_audio");
  const assignedIds = new Set((catalog.assignments ?? []).map((a) => a.student_id));

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href="/admin/mock-exams" className="text-sm font-bold text-[#64748B]">← 모의고사 목록</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black text-[#17213B]">{catalog.title}</h1>
              <span className="rounded-md bg-[#EAF5FF] px-2 py-1 text-xs font-black text-[#2874E8]">{catalog.subject}</span>
            </div>
            <p className="mt-1 text-sm font-bold text-[#7A859F]">{catalog.question_count}문항 · {catalog.total_score}점{catalog.duration_minutes ? ` · ${catalog.duration_minutes}분` : ""}</p>
          </div>
          <button onClick={() => void run(() => apiFetch(`/admin/mock-exam-catalog/${catalogId}`, { method: "PATCH", body: { is_published: !catalog.is_published } }), "공개 상태를 변경했습니다.")} className={`rounded-full px-4 py-2 text-sm font-black ${catalog.is_published ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>{catalog.is_published ? "공개 중" : "비공개"}</button>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">문항별 정답/배점</h2>
            <p className="mt-1 text-xs font-bold text-[#98A2B3]">형식: 문항번호,정답,배점,영역(선택) — 한 줄에 한 문항. 채점 대상 배점 합 = 총점({catalog.total_score}).</p>
            {catalog.questions && catalog.questions.length > 0 && (
              <div className="mt-2 max-h-28 overflow-y-auto rounded-lg bg-[#F8F9FC] p-2 text-[11px] text-[#7A859F]">
                {catalog.questions.map((q) => <span key={q.question_no} className="mr-2 inline-block">{q.question_no}:{q.correct_answer}/{q.score_points}점</span>)}
              </div>
            )}
            <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} rows={6} placeholder={"1,3,4\n2,5,3\n3,1,4"} className="mt-2 w-full resize-none rounded-lg bg-[#F5F6FA] p-2 font-mono text-xs text-[#17213B]" />
            <button onClick={saveQuestions} className="mt-2 h-10 rounded-lg bg-[#2874E8] px-4 text-xs font-black text-white">정답 저장 (전체 재채점)</button>
          </section>

          <section className="rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">등급컷</h2>
            <p className="mt-1 text-xs font-bold text-[#98A2B3]">1등급컷 &gt; 2등급컷 &gt; ... 순서. 미입력 등급은 계산에서 제외됩니다.</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((grade) => (
                <label key={grade} className="text-[11px] font-bold text-[#7A859F]">{grade}등급
                  <input type="number" min="0" max={catalog.total_score} value={gradeCutValues[grade] ?? ""} onChange={(e) => setGradeCutValues({ ...gradeCutValues, [grade]: e.target.value })} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs text-[#17213B]" />
                </label>
              ))}
            </div>
            <button onClick={saveGradeCuts} className="mt-3 h-10 rounded-lg bg-[#2874E8] px-4 text-xs font-black text-white">등급컷 저장</button>
          </section>

          <section className="rounded-[24px] bg-white p-6 shadow-card lg:col-span-2">
            <h2 className="text-lg font-black text-[#17213B]">파일</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg bg-[#F0F2F8] px-3 py-2 text-xs font-bold text-[#17213B]">
                {uploading === "worksheet-file" ? "업로드 중..." : worksheet ? "시험지 PDF 교체" : "시험지 PDF 업로드"}
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadMedia("worksheet-file", f); e.target.value = ""; }} />
              </label>
              {worksheet && <a href={`${API_BASE_URL}${worksheet.admin_url}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#F0F2F8] px-3 py-2 text-xs font-bold text-[#17213B]">시험지 보기</a>}
              <label className="cursor-pointer rounded-lg bg-[#F0F2F8] px-3 py-2 text-xs font-bold text-[#17213B]">
                {uploading === "solution-file" ? "업로드 중..." : solution ? "해설지 PDF 교체" : "해설지 PDF 업로드"}
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadMedia("solution-file", f); e.target.value = ""; }} />
              </label>
              {solution && <a href={`${API_BASE_URL}${solution.admin_url}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#F0F2F8] px-3 py-2 text-xs font-bold text-[#17213B]">해설 보기</a>}
              {isEnglish && (
                <label className="cursor-pointer rounded-lg bg-[#F0F2F8] px-3 py-2 text-xs font-bold text-[#17213B]">
                  {uploading === "listening-audio" ? "업로드 중..." : audio ? "듣기 MP3 교체" : "듣기 MP3 업로드"}
                  <input type="file" accept="audio/mpeg,.mp3" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadMedia("listening-audio", f); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {isEnglish && audio && (
              <div className="mt-3 rounded-lg bg-[#F8F9FC] p-2">
                <p className="text-[11px] font-bold text-[#7A859F]">{audio.original_filename}</p>
                <audio controls preload="metadata" src={`${API_BASE_URL}${audio.admin_url}`} className="mt-1 w-full" />
              </div>
            )}
          </section>

          <section className="rounded-[24px] bg-white p-6 shadow-card lg:col-span-2">
            <h2 className="text-lg font-black text-[#17213B]">학생 배정</h2>
            <p className="mt-1 text-xs font-bold text-[#98A2B3]">여러 학생을 선택하고 공통 시험일·응시 시간을 입력해 일괄 배정합니다. 배정 후 학생별로 날짜를 개별 수정할 수 있습니다.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              <label className="text-[11px] font-bold text-[#7A859F]">시험일<input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
              <label className="text-[11px] font-bold text-[#7A859F]">응시 가능<input type="datetime-local" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
              <label className="text-[11px] font-bold text-[#7A859F]">제출 마감<input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
              <label className="text-[11px] font-bold text-[#7A859F]">결과 공개(선택)<input type="datetime-local" value={resultOpen} onChange={(e) => setResultOpen(e.target.value)} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
              <label className="text-[11px] font-bold text-[#7A859F]">해설 공개(선택)<input type="datetime-local" value={solutionOpen} onChange={(e) => setSolutionOpen(e.target.value)} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs" /></label>
            </div>
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-[#EEF1F7] p-2">
              {students.map((student) => {
                const assigned = assignedIds.has(student.id);
                return (
                  <label key={student.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${assigned ? "opacity-50" : ""}`}>
                    <input type="checkbox" disabled={assigned} checked={selectedStudents.includes(student.id)} onChange={() => setSelectedStudents((v) => v.includes(student.id) ? v.filter((id) => id !== student.id) : [...v, student.id])} className="h-4 w-4 accent-[#2874E8]" />
                    <span className="font-bold text-[#17213B]">{student.name}</span>
                    <span className="text-xs text-[#98A2B3]">{student.grade}</span>
                    {assigned && <span className="ml-auto rounded bg-[#F1F3FF] px-2 py-0.5 text-[10px] font-black text-[#5C63FF]">배정됨</span>}
                  </label>
                );
              })}
            </div>
            <button onClick={bulkAssign} className="mt-3 h-10 rounded-lg bg-[#2874E8] px-5 text-xs font-black text-white">선택 학생 배정 ({selectedStudents.length})</button>

            {catalog.assignments && catalog.assignments.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead><tr className="text-[#98A2B3]"><th className="py-1 pr-3">학생ID</th><th className="py-1 pr-3">시험일</th><th className="py-1 pr-3">응시가능</th><th className="py-1 pr-3">마감</th><th className="py-1 pr-3">상태</th><th className="py-1 pr-3">점수</th></tr></thead>
                  <tbody>
                    {catalog.assignments.map((a) => (
                      <tr key={a.id} className="border-t border-[#F1F3FA]">
                        <td className="py-1.5 pr-3 font-bold text-[#17213B]">#{a.student_id}</td>
                        <td className="py-1.5 pr-3">{a.exam_date}</td>
                        <td className="py-1.5 pr-3">{new Date(a.available_from).toLocaleString("ko-KR")}</td>
                        <td className="py-1.5 pr-3">{new Date(a.submission_deadline_at).toLocaleString("ko-KR")}</td>
                        <td className="py-1.5 pr-3"><span className="rounded bg-[#F1F3FF] px-2 py-0.5 font-black text-[#5C63FF]">{STATUS_LABELS[a.status] ?? a.status}</span></td>
                        <td className="py-1.5 pr-3">{a.raw_score ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
