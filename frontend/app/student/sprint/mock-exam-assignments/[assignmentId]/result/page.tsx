"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

type GradeAnalysis = {
  grade: number;
  current_grade_cutoff: number | null;
  target_grade: number | null;
  target_cutoff: number | null;
  needed_score: number;
  minimum_question_count: number;
  suggested_question_nos: number[];
  suggested_point_values: number[];
  suggested_total_points: number;
  coaching_message: string | null;
  reachable: boolean | null;
} | null;
type ResponseRow = {
  question_no: number;
  selected_answer: number | null;
  correct_answer: number | null;
  is_correct: boolean | null;
  score_points: number | null;
  awarded_points: number | null;
  category: string | null;
  is_recommended_for_next_grade: boolean;
};
type Assignment = {
  id: number;
  catalog_id: number;
  status: string;
  submitted_at: string | null;
  raw_score: number | null;
  max_score: number | null;
  correct_count: number | null;
  is_result_open: boolean;
  is_solution_open: boolean;
  catalog: { id: number; title: string; subject: string; question_count: number; total_score: number; media: { media_type: string }[] };
  grade_analysis?: GradeAnalysis;
  responses?: ResponseRow[];
};

export default function StudentMockExamResultPage() {
  const router = useRouter();
  const params = useParams<{ assignmentId: string }>();
  const assignmentId = Number(params.assignmentId);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [studentName, setStudentName] = useState("");
  const [data, setData] = useState<Assignment | null>(null);
  const [error, setError] = useState("");
  const [showSolution, setShowSolution] = useState(false);

  useEffect(() => {
    const student = getStudent();
    if (!student) { router.push("/login"); return; }
    setStudentId(student.id);
    setStudentName(student.name ?? "");
    void apiFetch<Assignment>(`/student/sprint/mock-exam-assignments/${assignmentId}/result?student_id=${student.id}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : "결과를 불러오지 못했습니다."));
  }, [router, assignmentId]);

  const watermark = useMemo(() => {
    if (!studentId) return "";
    const now = new Date().toLocaleString("ko-KR");
    const partialId = String(studentId).padStart(4, "0").slice(-4);
    return `${studentName} · ${partialId} · ${now}`;
  }, [studentId, studentName]);

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[70vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  const catalog = data.catalog;
  const analysis = data.grade_analysis;
  const hasSolution = catalog.media.some((m) => m.media_type === "solution_pdf");
  const solutionUrl = studentId ? `${API_BASE_URL}/student/sprint/mock-exam-catalog/${catalog.id}/solution-file?student_id=${studentId}#toolbar=0&navpanes=0` : "";
  const cuts = analysis && data.raw_score !== null
    ? [...(analysis.target_cutoff !== null && analysis.target_grade !== null ? [{ grade: analysis.target_grade, score: analysis.target_cutoff }] : []),
       ...(analysis.current_grade_cutoff !== null ? [{ grade: analysis.grade, score: analysis.current_grade_cutoff }] : [])]
    : [];

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href={`/student/sprint/mock-exam-assignments/${assignmentId}`} className="break-keep text-sm font-black text-[#2874E8]">← 시험 화면</Link>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <section className="mt-6 rounded-[28px] bg-white/95 p-6 text-center shadow-[0_18px_36px_rgba(49,89,130,0.18)] ring-1 ring-[#DCEBFA]">
          <div className="flex items-center justify-center gap-2">
            <span className="break-keep rounded-full bg-[#EAF5FF] px-3 py-1 text-xs font-black text-[#2874E8]">{catalog.subject}</span>
            <p className="break-keep text-sm font-bold text-[#6E7F99]">{catalog.title}</p>
          </div>
          {data.is_result_open ? (
            <>
              <p className="mt-3 break-keep text-5xl font-black tracking-[-0.05em] text-[#10213D]">{data.raw_score}<span className="text-2xl text-[#8CA0BD]">/{data.max_score}</span></p>
              {analysis && <p className="mt-2 break-keep text-lg font-black text-[#2874E8]">{analysis.grade}등급</p>}
              <p className="mt-2 break-keep text-sm font-bold text-[#6E7F99]">{data.correct_count}/{catalog.question_count}문항 정답</p>
            </>
          ) : (
            <p className="mt-4 break-keep text-lg font-black text-[#10213D]">제출 완료 · 결과 공개 예정</p>
          )}
        </section>

        {data.is_result_open && analysis && analysis.target_grade !== null && (
          <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <p className="break-keep text-xs font-black text-[#6E7F99]">등급 향상</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="break-keep text-sm font-bold text-[#6E7F99]">다음 목표 {analysis.target_grade}등급컷 {analysis.target_cutoff}점</p>
                <p className="mt-1 break-keep text-2xl font-black text-[#10213D]">{analysis.needed_score}점 남음</p>
              </div>
            </div>
            {cuts.length > 0 && data.raw_score !== null && (
              <div className="mt-4">
                <div className="relative h-3 rounded-full bg-[#DDE4EF]">
                  <div className="h-full rounded-full bg-[#2874E8]" style={{ width: `${Math.min(100, Math.round((data.raw_score / catalog.total_score) * 100))}%` }} />
                  {cuts.map((c) => (
                    <div key={c.grade} className="absolute top-[-4px] h-5 w-0.5 bg-[#10213D]" style={{ left: `${Math.min(100, Math.round((c.score / catalog.total_score) * 100))}%` }} title={`${c.grade}등급컷 ${c.score}`} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-[#8CA0BD]">
                  {cuts.map((c) => <span key={c.grade} className="break-keep">{c.grade}등급 {c.score}점</span>)}
                  <span className="break-keep text-[#2874E8]">내 점수 {data.raw_score}점</span>
                </div>
              </div>
            )}
            {analysis.coaching_message && (
              <div className="mt-4 rounded-2xl bg-[#EAF5FF] px-4 py-3">
                <p className="break-keep text-sm font-black text-[#2874E8]">{analysis.coaching_message}</p>
                {analysis.suggested_question_nos.length > 0 && (
                  <p className="mt-1 break-keep text-xs font-bold text-[#6E7F99]">추천 회수 문항: {analysis.suggested_question_nos.join(", ")}번</p>
                )}
              </div>
            )}
          </section>
        )}

        {data.is_result_open && analysis === null && (
          <section className="mt-4 rounded-[28px] bg-white/85 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.12)] ring-1 ring-[#DFEAF6]">
            <p className="break-keep text-sm font-bold text-[#8CA0BD]">등급컷이 등록되지 않아 등급은 표시되지 않습니다. 점수와 정오표만 확인할 수 있어요.</p>
          </section>
        )}

        {data.is_result_open && data.responses && (
          <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <h2 className="break-keep text-lg font-black text-[#10213D]">문항 분석</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[380px] text-left text-xs">
                <thead><tr className="text-[#8CA0BD]"><th className="py-1 pr-2">번호</th><th className="py-1 pr-2">내 답</th><th className="py-1 pr-2">정답</th><th className="py-1 pr-2">배점</th><th className="py-1 pr-2">획득</th><th className="py-1 pr-2">영역</th></tr></thead>
                <tbody>
                  {data.responses.map((r) => (
                    <tr key={r.question_no} className={`border-t border-[#F1F3FA] ${r.is_recommended_for_next_grade ? "bg-[#EAF5FF]" : ""}`}>
                      <td className="py-1.5 pr-2 font-black text-[#10213D]">{r.question_no}{r.is_recommended_for_next_grade ? " ★" : ""}</td>
                      <td className={`py-1.5 pr-2 font-bold ${r.is_correct ? "text-[#17895E]" : "text-[#E25050]"}`}>{r.selected_answer ?? "-"}</td>
                      <td className="py-1.5 pr-2 font-bold text-[#10213D]">{r.correct_answer ?? "-"}</td>
                      <td className="py-1.5 pr-2 text-[#6E7F99]">{r.score_points ?? "-"}</td>
                      <td className="py-1.5 pr-2 text-[#6E7F99]">{r.awarded_points ?? 0}</td>
                      <td className="py-1.5 pr-2 text-[#8CA0BD]">{r.category ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 break-keep text-[11px] font-bold text-[#8CA0BD]">★ 표시는 다음 등급 도달에 가장 효율적인 회수 추천 문항입니다.</p>
          </section>
        )}

        {hasSolution && (
          <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <h2 className="break-keep text-lg font-black text-[#10213D]">해설</h2>
            {!data.is_solution_open ? (
              <p className="mt-2 break-keep text-sm font-bold text-[#8CA0BD]">아직 해설이 공개되지 않았습니다.</p>
            ) : !showSolution ? (
              <button onClick={() => setShowSolution(true)} className="mt-3 h-12 w-full break-keep rounded-2xl bg-[#10213D] text-sm font-black text-white">해설 보기</button>
            ) : (
              <div className="relative mt-3 overflow-hidden rounded-2xl ring-1 ring-[#DFEAF6]">
                <iframe src={solutionUrl} title="해설" className="h-[70vh] w-full" />
                <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-wrap content-center justify-center gap-x-12 gap-y-16 overflow-hidden opacity-[0.12]">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <span key={i} className="-rotate-[30deg] whitespace-nowrap text-sm font-black text-[#10213D]">{watermark}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </ScreenShell>
  );
}
