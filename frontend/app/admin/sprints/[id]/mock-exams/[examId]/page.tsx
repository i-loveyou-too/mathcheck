"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type ExamInfo = {
  id: number; round_no: number; title: string; exam_date: string; question_count: number;
  status: string; is_date_overridden: boolean; original_exam_date: string | null;
};
type AnswerKeyRow = { question_no: number; correct_answer: number; score_points: number; category: string | null; memo: string | null };
type SubmissionRow = { id: number; student_id: number; status: string; raw_score: number | null; correct_count: number | null; grading_version: number; submitted_at: string | null };
type ExamDetail = { exam: ExamInfo; answer_key: AnswerKeyRow[]; locked: boolean; has_draft: boolean; submissions: SubmissionRow[] };
type SubmissionsResponse = { exam: ExamInfo; submitted: { submission: SubmissionRow; student_name: string }[]; missing_students: { student_id: number; student_name: string }[] };
type RegradeDetail = { submission_id: number; student_id: number; previous_raw_score: number | null; new_raw_score: number; score_delta: number };
type RegradeResult = { dry_run: boolean; affected_count: number; details: RegradeDetail[] };

type QuestionRow = { question_no: number; correct_answer: number; score_points: string };

export default function AdminMockExamRoundPage() {
  const router = useRouter();
  const params = useParams<{ id: string; examId: string }>();
  const programId = Number(params.id);
  const examId = Number(params.examId);

  const [detail, setDetail] = useState<ExamDetail | null>(null);
  const [submissionsData, setSubmissionsData] = useState<SubmissionsResponse | null>(null);
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [bulkPaste, setBulkPaste] = useState("");
  const [totalScore, setTotalScore] = useState("100");
  const [regradePreview, setRegradePreview] = useState<RegradeResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [d, s] = await Promise.all([
      apiFetch<ExamDetail>(`/admin/mock-exams/${examId}`),
      apiFetch<SubmissionsResponse>(`/admin/mock-exams/${examId}/submissions`),
    ]);
    setDetail(d);
    setSubmissionsData(s);
    if (d.answer_key.length > 0) {
      setRows(d.answer_key.map((ak) => ({ question_no: ak.question_no, correct_answer: ak.correct_answer, score_points: String(ak.score_points) })));
    } else {
      setRows(Array.from({ length: d.exam.question_count }, (_, i) => ({ question_no: i + 1, correct_answer: 1, score_points: "" })));
    }
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "회차 정보를 불러오지 못했습니다."));
  }, [examId, router]);

  const applyBulkPaste = () => {
    const digits = bulkPaste.split("").filter((c) => /[1-5]/.test(c)).map(Number);
    if (!detail) return;
    if (digits.length !== detail.exam.question_count) {
      setError(`붙여넣은 정답 개수(${digits.length})가 문항 수(${detail.exam.question_count})와 일치하지 않습니다.`);
      return;
    }
    setError("");
    setRows((prev) => prev.map((row, index) => ({ ...row, correct_answer: digits[index] })));
  };

  const updateRow = (index: number, patch: Partial<QuestionRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const questionsPayload = useMemo(
    () => rows.map((row) => ({
      question_no: row.question_no,
      correct_answer: row.correct_answer,
      score_points: row.score_points ? Number(row.score_points) : null,
    })),
    [rows],
  );

  const saveAnswerKey = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch(`/admin/mock-exams/${examId}/answer-key`, {
        method: "PUT",
        body: { questions: questionsPayload, total_score: Number(totalScore) },
      });
      await load();
      setNotice("정답을 등록했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "정답 등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const runRegrade = async (dryRun: boolean) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiFetch<RegradeResult>(`/admin/mock-exams/${examId}/answer-key/regrade`, {
        method: "POST",
        body: { questions: questionsPayload, total_score: Number(totalScore), dry_run: dryRun },
      });
      if (dryRun) {
        setRegradePreview(result);
        setNotice(`영향받는 제출 ${result.affected_count}건 - 아래 미리보기를 확인하세요.`);
      } else {
        setRegradePreview(null);
        setNotice(`재채점을 적용했습니다. (영향받은 제출 ${result.affected_count}건)`);
        await load();
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "재채점 요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(""); setNotice("");
    try { await action(); await load(); setNotice(message); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "요청을 처리하지 못했습니다."); }
  };

  const confirmSubmission = (submissionId: number) => run(() => apiFetch(`/admin/mock-exam-submissions/${submissionId}/confirm`, { method: "POST" }), "성적을 확정했습니다.");
  const confirmAll = () => run(() => apiFetch(`/admin/mock-exams/${examId}/confirm-all`, { method: "POST" }), "채점된 제출을 모두 확정했습니다.");
  const reopenSubmission = (submissionId: number) => {
    const note = window.prompt("재응시 허용 사유(선택)") ?? undefined;
    void run(() => apiFetch(`/admin/mock-exam-submissions/${submissionId}/reopen`, { method: "POST", body: { review_note: note || null } }), "재응시할 수 있도록 되돌렸습니다.");
  };
  const cancelSubmission = (submissionId: number) => {
    const note = window.prompt("제출 취소 사유(선택)") ?? undefined;
    void run(() => apiFetch(`/admin/mock-exam-submissions/${submissionId}/cancel`, { method: "POST", body: { review_note: note || null } }), "제출을 취소했습니다.");
  };

  if (!detail || !submissionsData) {
    return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error || "불러오는 중..."}</main>;
  }

  const { exam, locked, has_draft } = detail;

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href={`/admin/sprints/${programId}/mock-exams`} className="text-sm font-bold text-[#64748B]">← 모의고사 시리즈</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#FF6B4A]">{exam.round_no}회차</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">{exam.title}</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">{exam.exam_date} · {exam.question_count}문항 · {exam.status}</p>
          </div>
          {locked && <span className="rounded-full bg-amber-50 px-4 py-2 text-sm font-black text-amber-700">제출 존재 - 정답은 재채점 흐름으로만 수정 가능</span>}
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-6 rounded-[24px] bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-[#17213B]">정답 및 배점</h2>
            <span className="text-xs font-bold text-[#98A2B3]">{has_draft && !locked && "임시 답안 존재 - 문항 수 축소 금지"}</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px]">
            <textarea
              value={bulkPaste}
              onChange={(e) => setBulkPaste(e.target.value)}
              placeholder={`정답 일괄 붙여넣기 (예: ${"1".repeat(Math.min(5, exam.question_count))}...) - 숫자 1~5만 순서대로 인식합니다.`}
              rows={2}
              className="rounded-2xl border border-[#E5EAF1] p-3 text-sm outline-none"
            />
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[#7A859F]">기본 총점<input type="number" value={totalScore} onChange={(e) => setTotalScore(e.target.value)} className="mt-1 h-10 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <button onClick={applyBulkPaste} className="h-10 rounded-xl bg-[#17213B] text-xs font-black text-white">붙여넣기 적용</button>
            </div>
          </div>

          <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-[#EEF1F7]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#F7F8FB] text-xs font-black text-[#7A859F]">
                <tr><th className="p-2">문항</th><th className="p-2">정답(1~5)</th><th className="p-2">배점</th></tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.question_no} className="border-t border-[#EEF1F7]">
                    <td className="p-2 text-center font-black text-[#17213B]">{row.question_no}</td>
                    <td className="p-2 text-center">
                      <select value={row.correct_answer} onChange={(e) => updateRow(index, { correct_answer: Number(e.target.value) })} className="h-9 rounded-lg bg-[#F5F6FA] px-2">
                        {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-center">
                      <input type="number" placeholder="자동" value={row.score_points} onChange={(e) => updateRow(index, { score_points: e.target.value })} className="h-9 w-20 rounded-lg bg-[#F5F6FA] px-2 text-center" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!locked ? (
              <button disabled={busy} onClick={() => void saveAnswerKey()} className="h-11 rounded-2xl bg-[#5C63FF] px-5 text-sm font-black text-white disabled:opacity-50">정답 등록/수정</button>
            ) : (
              <>
                <button disabled={busy} onClick={() => void runRegrade(true)} className="h-11 rounded-2xl bg-[#F0F2F8] px-5 text-sm font-black text-[#17213B] disabled:opacity-50">정답 수정 dry-run</button>
                <button disabled={busy || !regradePreview} onClick={() => void runRegrade(false)} className="h-11 rounded-2xl bg-red-500 px-5 text-sm font-black text-white disabled:opacity-50">재채점 적용</button>
              </>
            )}
          </div>

          {regradePreview && (
            <div className="mt-4 rounded-2xl bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-800">영향받는 제출 {regradePreview.affected_count}건 (dry-run, 아직 저장되지 않음)</p>
              <div className="mt-2 space-y-1">
                {regradePreview.details.map((d) => (
                  <p key={d.submission_id} className="text-xs font-bold text-amber-700">
                    student #{d.student_id}: {d.previous_raw_score ?? "-"}점 → {d.new_raw_score}점 ({d.score_delta >= 0 ? "+" : ""}{d.score_delta})
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-[24px] bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-[#17213B]">응시 현황</h2>
            <button onClick={() => void confirmAll()} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white">채점 완료 전체 확정</button>
          </div>
          <div className="mt-4 space-y-2">
            {submissionsData.submitted.length === 0 && <p className="rounded-xl bg-[#F7F8FB] px-4 py-3 text-sm font-bold text-[#98A2B3]">제출자가 없습니다.</p>}
            {submissionsData.submitted.map(({ submission, student_name }) => (
              <div key={submission.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EEF1F7] p-3">
                <div>
                  <p className="text-sm font-black text-[#17213B]">{student_name} · {submission.status}{submission.grading_version > 0 && ` (재채점 v${submission.grading_version})`}</p>
                  <p className="text-xs font-bold text-[#7A859F]">{submission.raw_score ?? "-"}점 · 정답 {submission.correct_count ?? "-"}개</p>
                </div>
                <div className="flex gap-1.5">
                  {submission.status === "graded" && <button onClick={() => confirmSubmission(submission.id)} className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-black text-white">확정</button>}
                  <button onClick={() => reopenSubmission(submission.id)} className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">재응시 허용</button>
                  <button onClick={() => cancelSubmission(submission.id)} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600">제출 취소</button>
                </div>
              </div>
            ))}
          </div>
          {submissionsData.missing_students.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-black text-[#98A2B3]">미제출자</p>
              <p className="mt-1 text-sm font-bold text-[#7A859F]">{submissionsData.missing_students.map((s) => s.student_name).join(", ")}</p>
            </div>
          )}
        </section>
      </div>
      <AdminBottomNav />
    </main>
  );
}
