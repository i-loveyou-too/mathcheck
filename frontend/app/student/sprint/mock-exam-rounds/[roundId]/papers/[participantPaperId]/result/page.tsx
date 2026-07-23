"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type GradeCut = { grade: number; minimum_score: number };
type Paper = { id: number; subject_code: string; subject_label: string; question_count: number; total_score: number; grade_cuts: GradeCut[] };
type GradeAnalysis = {
  grade: number;
  current_grade_cutoff: number | null;
  target_grade: number | null;
  target_cutoff: number | null;
  needed_score: number;
  suggested_question_nos: number[];
  suggested_point_values: number[];
  coaching_message: string | null;
  reachable: boolean | null;
} | null;
type ResponseItem = {
  question_no: number; selected_answer: number | null; correct_answer: number; is_correct: boolean | null;
  score_points: number | null; awarded_points: number | null; category: string | null; is_recommended_for_next_grade: boolean;
};
type Result = {
  id: number; slot_label: string; subject_label: string | null; status: string; submitted_at: string | null;
  raw_score: number | null; max_score: number | null; correct_count: number | null; wrong_count: number; unanswered_count: number;
  paper: Paper; grade_analysis: GradeAnalysis; responses: ResponseItem[];
};

export default function StudentMockExamResultPage() {
  const router = useRouter();
  const params = useParams<{ roundId: string; participantPaperId: string }>();
  const participantPaperId = Number(params.participantPaperId);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    void apiFetch<Result>(`/student/sprint/mock-exam-participant-papers/${participantPaperId}/result?student_id=${student.id}`)
      .then(setResult)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : "결과를 불러오지 못했습니다."));
  }, [router, participantPaperId]);

  if (!result) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[70vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  const grade = result.grade_analysis;
  const gradeCuts = [...result.paper.grade_cuts].sort((a, b) => a.grade - b.grade);

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href={`/student/sprint/mock-exam-rounds/${params.roundId}`} className="break-keep text-sm font-black text-[#2874E8]">← 회차로 돌아가기</Link>

        <section className="mt-4 rounded-[28px] bg-white/95 p-6 text-center shadow-[0_18px_36px_rgba(49,89,130,0.18)] ring-1 ring-[#DCEBFA]">
          <p className="break-keep text-sm font-black text-[#2874E8]">{result.subject_label ?? result.slot_label}</p>
          <p className="mt-2 text-5xl font-black tracking-[-0.05em] text-[#10213D]">{result.raw_score ?? 0}점</p>
          {grade && <p className="mt-1 break-keep text-lg font-black text-[#2874E8]">{grade.grade}등급</p>}
          <p className="mt-3 break-keep text-sm font-semibold text-[#6E7F99]">{result.correct_count ?? 0} / {result.paper.question_count}문항 정답 · 오답 {result.wrong_count} · 미응답 {result.unanswered_count}</p>
          {result.submitted_at && <p className="mt-1 break-keep text-xs font-bold text-[#8CA0BD]">제출 {new Date(result.submitted_at).toLocaleString("ko-KR")}</p>}
        </section>

        {!grade && (
          <section className="mt-4 rounded-[22px] bg-white/85 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.12)] ring-1 ring-[#DFEAF6]">
            <p className="break-keep text-sm font-bold text-[#8CA0BD]">이 시험지는 등급컷이 아직 등록되지 않았습니다. 점수와 정오표만 확인할 수 있어요.</p>
          </section>
        )}

        {gradeCuts.length > 0 && (
          <section className="mt-4 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <h2 className="break-keep text-sm font-black text-[#10213D]">등급컷</h2>
            <div className="mt-3 space-y-1.5">
              {gradeCuts.map((gc) => {
                const isCurrent = grade?.grade === gc.grade;
                return (
                  <div key={gc.grade} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold ${isCurrent ? "bg-[#2874E8] text-white" : "bg-[#F5F8FC] text-[#40516D]"}`}>
                    <span className="break-keep">{gc.grade}등급컷</span>
                    <span className="break-keep">{gc.minimum_score}점{isCurrent ? " · 내 등급" : ""}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-700">
                <span className="break-keep">내 점수</span>
                <span className="break-keep">{result.raw_score ?? 0}점</span>
              </div>
            </div>
          </section>
        )}

        {grade && grade.target_grade != null && (
          <section className="mt-4 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <p className="break-keep text-xs font-black text-[#6E7F99]">다음 목표: {grade.target_grade}등급</p>
            <p className="mt-1 break-keep text-sm font-bold text-[#40516D]">{grade.target_grade}등급컷 {grade.target_cutoff}점 · 부족 점수 {grade.needed_score}점</p>
            {grade.coaching_message && (
              <p className="mt-3 break-keep rounded-2xl bg-[#EAF5FF] px-4 py-3 text-sm font-black text-[#2874E8]">{grade.coaching_message}</p>
            )}
            {grade.reachable === false && (
              <p className="mt-3 break-keep rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">{grade.coaching_message}</p>
            )}
          </section>
        )}

        {grade && grade.target_grade == null && grade.coaching_message && (
          <section className="mt-4 rounded-[22px] bg-emerald-50 p-5 text-center ring-1 ring-emerald-100">
            <p className="break-keep text-lg font-black text-emerald-700">{grade.coaching_message}</p>
          </section>
        )}

        {result.responses.length > 0 && (
          <section className="mt-4 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <h2 className="break-keep text-sm font-black text-[#10213D]">문항 분석</h2>
            <div className="mt-3 space-y-1.5">
              {result.responses.map((r) => (
                <div
                  key={r.question_no}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                    r.is_recommended_for_next_grade ? "bg-[#FFF6E2] ring-1 ring-amber-200" : r.is_correct ? "bg-emerald-50" : r.selected_answer == null ? "bg-[#F5F8FC]" : "bg-red-50"
                  }`}
                >
                  <span className="break-keep text-[#10213D]">{r.question_no}번{r.category ? ` · ${r.category}` : ""}</span>
                  <span className="break-keep text-[#40516D]">
                    {r.selected_answer == null ? "미응답" : `선택 ${r.selected_answer}`} · 정답 {r.correct_answer} · {r.score_points ?? 0}점{r.is_recommended_for_next_grade ? " · 회수 추천" : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {grade && grade.suggested_question_nos.length > 0 && (
          <section className="mt-4 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <h2 className="break-keep text-sm font-black text-[#10213D]">어떤 문제를 더 맞혀야 했을까?</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {grade.suggested_question_nos.map((qno, index) => (
                <span key={qno} className="break-keep rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700">{qno}번 · {grade.suggested_point_values[index]}점</span>
              ))}
            </div>
          </section>
        )}
      </div>
    </ScreenShell>
  );
}
