"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type ResultQuestion = { id: number; order_index: number; english: string; input_answer: string; accepted_answers: string[]; is_correct: boolean };
type Result = { id: number; challenge_name: string; study_date: string; session_type: string; score: number; correct_count: number; total_count: number; questions: ResultQuestion[] };
type Session = { id: number; status: string };

export default function SprintVocabularyResultPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = Number(params.sessionId);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void apiFetch<Result>(`/student/vocabulary/results/${sessionId}?student_id=${student.id}`)
      .then(setResult)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "결과를 불러오지 못했습니다."));
  }, [router, sessionId]);

  const review = async () => {
    if (!studentId) return;
    setStarting(true);
    try {
      const session = await apiFetch<Session>("/student/vocabulary/review-sessions", { method: "POST", body: { student_id: studentId } });
      router.push(session.status === "submitted" ? `/student/sprint/vocabulary/result/${session.id}` : `/student/sprint/vocabulary/test/${session.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "오답 재시험을 시작하지 못했습니다.");
      setStarting(false);
    }
  };

  if (!result) return <main className="min-h-screen bg-[#F4F7F6] p-10 text-center font-bold text-[#7A859F]">{error || "채점 결과를 불러오는 중..."}</main>;

  const rate = Math.round(result.correct_count / result.total_count * 100);
  const questions = onlyWrong ? result.questions.filter((q) => !q.is_correct) : result.questions;

  const wrongCount = result.total_count - result.correct_count;

  return (
    <main className="min-h-screen bg-[#F4F7F6] pb-36">
      <div className="mx-auto max-w-[700px] px-5 py-7">
        <div className="flex items-center justify-between">
          <Link href="/student/sprint/vocabulary" className="text-sm font-black text-[#64748B]">‹ 영단어 시험 결과</Link>
          <span className="text-xs font-bold text-[#98A2B3]">{result.study_date}</span>
        </div>
        <section className="mt-5 overflow-hidden rounded-[30px] bg-[#17213B] p-6 text-white shadow-xl">
          <p className="text-sm font-bold text-[#9EA9FF]">{result.session_type === "review" ? "오답 재시험 결과" : "오늘의 채점 결과"}</p>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-black">{result.score}<span className="ml-1 text-base text-white/55">점</span></h1>
              <p className="mt-2 text-sm text-white/60">전체 {result.total_count}문항 중 <span className="font-black text-white">{result.correct_count}문항 정답</span></p>
              <p className="mt-1 text-xs text-white/45">정답 {result.correct_count} · 오답 {wrongCount}</p>
            </div>
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-[7px] border-[#65E6BA] text-lg font-black">{rate}%</div>
          </div>
        </section>
        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3"><Link href="/student/sprint/vocabulary/wrong-notes" className="rounded-2xl bg-white p-4 text-center text-sm font-black text-[#6478FF] shadow-sm">오답노트 보기</Link><button disabled={starting} onClick={() => void review()} className="rounded-2xl bg-[#FFF1C9] p-4 text-sm font-black text-[#9A6500] shadow-sm disabled:opacity-50">{starting ? "준비 중..." : "오답 재시험"}</button></div>
        <div className="mt-7 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#17213B]">문항별 결과</h2>
          <div className="flex rounded-full bg-[#E7EBF0] p-1">
            <button
              onClick={() => setOnlyWrong(false)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!onlyWrong ? "bg-white text-[#17213B] shadow-sm" : "text-[#8A94A6]"}`}
            >
              전체 {result.total_count}
            </button>
            <button
              onClick={() => setOnlyWrong(true)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${onlyWrong ? "bg-white text-[#E15B45] shadow-sm" : "text-[#8A94A6]"}`}
            >
              오답 {wrongCount}
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {questions.map((question) => (
            <article key={question.id} className="rounded-[20px] border border-[#EBEEF2] bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-[11px] font-semibold text-[#A0A8B8]">{String(question.order_index).padStart(2, "0")}</span>
                  <h3 className="truncate text-lg font-bold text-[#17213B]">{question.english}</h3>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${question.is_correct ? "bg-[#E3F7EF] text-[#12815F]" : "bg-[#FDEAE6] text-[#E15B45]"}`}>
                  {question.is_correct ? "정답" : "오답"}
                </span>
              </div>
              <p className="mt-1.5 truncate text-[13px] text-[#67748E]">{question.accepted_answers.join(" · ")}</p>
              <div className="mt-2 flex items-baseline gap-1.5 text-[13px]">
                <span className="font-medium text-[#98A2B3]">내 답안</span>
                <span className={`truncate font-bold ${question.input_answer ? (question.is_correct ? "text-[#12815F]" : "text-[#E15B45]") : "text-[#98A2B3]"}`}>
                  {question.input_answer || "미응답"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
