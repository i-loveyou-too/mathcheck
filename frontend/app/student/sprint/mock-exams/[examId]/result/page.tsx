"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type ExamInfo = { id: number; round_no: number; title: string; exam_date: string; question_count: number };
type ResponseItem = { question_no: number; selected_answer: number | null; is_correct: boolean; awarded_points: number };
type SubmissionInfo = {
  status: string; raw_score: number | null; max_score: number | null; correct_count: number | null;
  grading_version: number; responses: ResponseItem[];
};
type AnswerKeyItem = { question_no: number; correct_answer: number; score_points: number };
type ResultResponse = { exam: ExamInfo; submission: SubmissionInfo; answer_key: AnswerKeyItem[] };

export default function SprintMockExamResultPage() {
  const router = useRouter();
  const params = useParams<{ examId: string }>();
  const examId = Number(params.examId);
  const [data, setData] = useState<ResultResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    void apiFetch<ResultResponse>(`/student/sprint/mock-exams/${examId}/result?student_id=${student.id}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : "결과를 불러오지 못했습니다."));
  }, [router, examId]);

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[50vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  const { exam, submission, answer_key } = data;
  const answerByQuestion = new Map(answer_key.map((item) => [item.question_no, item]));

  return (
    <ScreenShell withBottomNav>
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-[#FF6B4A]">RESULT</p>
          <h1 className="mt-1 text-xl font-black text-[#17213B]">{exam.round_no}회차 · {exam.title}</h1>
        </div>
        <Link href="/student/sprint/mock-exams" className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#5C63FF] shadow-sm">목록</Link>
      </div>

      <section className="rounded-[28px] bg-[#10213D] p-6 text-center text-white shadow-[0_18px_40px_rgba(16,33,61,0.3)]">
        <p className="text-sm font-bold text-white/60">최종 점수 {submission.grading_version > 0 && "· 재채점 반영됨"}</p>
        <p className="mt-2 text-5xl font-black">{submission.raw_score}<span className="text-xl text-white/50">/{submission.max_score}</span></p>
        <p className="mt-2 text-sm font-semibold text-white/70">{submission.correct_count} / {exam.question_count} 문항 정답</p>
      </section>

      <section className="rounded-[28px] bg-white p-5 shadow-card">
        <p className="mb-3 text-sm font-black text-[#17213B]">문항별 결과</p>
        <div className="space-y-2">
          {submission.responses.map((response) => {
            const key = answerByQuestion.get(response.question_no);
            return (
              <div key={response.question_no} className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${response.is_correct ? "bg-emerald-50" : "bg-red-50"}`}>
                <span className="text-sm font-black text-[#17213B]">문항 {response.question_no}</span>
                <span className="text-xs font-bold text-[#475569]">
                  내 답 {response.selected_answer ?? "미응답"} · 정답 {key?.correct_answer ?? "-"} · {response.awarded_points}점
                </span>
                <span className={`text-sm font-black ${response.is_correct ? "text-emerald-600" : "text-red-500"}`}>{response.is_correct ? "정답" : "오답"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </ScreenShell>
  );
}
