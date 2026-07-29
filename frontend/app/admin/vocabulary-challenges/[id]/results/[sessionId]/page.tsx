"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Question = {
  id: number;
  response_id: number | null;
  order_index: number;
  english: string;
  input_answer: string;
  accepted_answers: string[];
  is_correct: boolean;
  auto_is_correct: boolean;
  final_is_correct: boolean;
  is_manual_override: boolean;
  manual_reason: string | null;
  manual_graded_by: number | null;
  manual_graded_at: string | null;
};
type Result = {
  id: number;
  challenge_name: string;
  study_date: string;
  score: number;
  correct_count: number;
  total_count: number;
  submitted_at: string;
  admin_reviewed_at: string | null;
  questions: Question[];
};
type GradingAction = "mark_correct" | "mark_incorrect" | "restore_auto";

export default function AdminVocabularyResultPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyResponseId, setBusyResponseId] = useState<number | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  const load = () => apiFetch<Result>(`/admin/vocabulary-results/${params.sessionId}`).then(setResult);

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "결과를 불러오지 못했습니다."));
  }, [params.sessionId, router]);

  const runGrading = async (responseId: number, action: GradingAction, reason: string | null) => {
    setError("");
    setNotice("");
    setBusyResponseId(responseId);
    try {
      await apiFetch(`/admin/vocabulary-attempts/${params.sessionId}/responses/${responseId}/grading`, {
        method: "PATCH",
        body: { action, reason },
      });
      await load();
      setNotice("채점을 수정했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "채점을 수정하지 못했습니다.");
    } finally {
      setBusyResponseId(null);
    }
  };

  const markCorrect = (question: Question) => {
    if (question.response_id == null) return;
    void runGrading(question.response_id, "mark_correct", null);
  };

  const markIncorrect = (question: Question) => {
    if (question.response_id == null) return;
    void runGrading(question.response_id, "mark_incorrect", null);
  };

  const restoreAuto = (question: Question) => {
    if (question.response_id == null) return;
    if (!window.confirm("자동채점 결과로 되돌릴까요?")) return;
    void runGrading(question.response_id, "restore_auto", null);
  };

  const toggleReviewed = async () => {
    if (!result) return;
    setReviewSaving(true);
    setError("");
    try {
      await apiFetch(`/admin/vocabulary-results/${result.id}/review`, {
        method: "PATCH",
        body: { reviewed: !result.admin_reviewed_at },
      });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "확인 상태를 저장하지 못했습니다.");
    } finally {
      setReviewSaving(false);
    }
  };

  if (!result) {
    return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error || "결과를 불러오는 중..."}</main>;
  }

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <Link href={`/admin/vocabulary-challenges/${params.id}`} className="text-sm font-black text-[#64748B]">← 챌린지 상세</Link>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-[28px] bg-[#17213B] p-6 text-white">
          <div>
            <p className="text-sm font-bold text-[#9EA9FF]">{result.study_date} 제출 결과</p>
            <h1 className="mt-2 text-2xl font-black">{result.challenge_name}</h1>
            <p className="mt-2 text-xs text-white/50">{new Date(result.submitted_at).toLocaleString("ko-KR")}</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black text-[#65E6BA]">{result.score}점</p>
            <p className="mt-1 text-sm text-white/60">{result.correct_count} / {result.total_count} 정답</p>
            <button
              type="button"
              disabled={reviewSaving}
              onClick={() => void toggleReviewed()}
              className={`mt-3 rounded-full px-4 py-2 text-xs font-black transition disabled:opacity-60 ${
                result.admin_reviewed_at ? "bg-emerald-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {result.admin_reviewed_at ? "✓ 확인함" : "확인 체크"}
            </button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <div className="mt-5 overflow-x-auto rounded-[26px] bg-white shadow-card">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[#F8FAFC] text-xs text-[#7A859F]">
              <tr>
                <th className="p-4">#</th>
                <th>단어</th>
                <th>학생 답안</th>
                <th>허용 정답</th>
                <th>자동채점</th>
                <th>최종판정</th>
                <th>수동수정</th>
                <th>수정 정보</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {result.questions.map((question) => {
                const busy = busyResponseId === question.response_id;
                return (
                  <tr key={question.id} className="border-t border-[#EEF1F5] align-top">
                    <td className="p-4 text-[#98A2B3]">{question.order_index}</td>
                    <td className="font-black text-[#17213B]">{question.english}</td>
                    <td className={question.final_is_correct ? "text-emerald-600" : "text-red-500"}>{question.input_answer || "(빈 답안)"}</td>
                    <td className="text-[#667085]">{question.accepted_answers.join(" · ")}</td>
                    <td>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${question.auto_is_correct ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                        {question.auto_is_correct ? "정답" : "오답"}
                      </span>
                    </td>
                    <td>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${question.final_is_correct ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                        {question.final_is_correct ? "정답" : "오답"}
                      </span>
                    </td>
                    <td>
                      {question.is_manual_override ? (
                        <span className="rounded-full bg-[#EAF5FF] px-2 py-1 text-xs font-black text-[#2874E8]">수동</span>
                      ) : (
                        <span className="text-xs font-bold text-[#98A2B3]">-</span>
                      )}
                    </td>
                    <td className="max-w-[220px] text-xs text-[#7A859F]">
                      {question.is_manual_override ? (
                        <>
                          <p className="font-bold text-[#17213B]">관리자 #{question.manual_graded_by}</p>
                          <p>{question.manual_graded_at ? new Date(question.manual_graded_at).toLocaleString("ko-KR") : ""}</p>
                          {question.manual_reason && <p className="mt-1 break-words">{question.manual_reason}</p>}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          disabled={busy || question.response_id == null}
                          onClick={() => markCorrect(question)}
                          className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-black text-white disabled:opacity-50"
                        >
                          정답 처리
                        </button>
                        <button
                          disabled={busy || question.response_id == null}
                          onClick={() => markIncorrect(question)}
                          className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-black text-white disabled:opacity-50"
                        >
                          오답 처리
                        </button>
                        <button
                          disabled={busy || question.response_id == null || !question.is_manual_override}
                          onClick={() => restoreAuto(question)}
                          className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-black text-[#17213B] disabled:opacity-50"
                        >
                          자동복원
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
