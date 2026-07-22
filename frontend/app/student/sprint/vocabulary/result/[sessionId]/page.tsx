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

  return (
    <main className="min-h-screen bg-[#F4F7F6] pb-32">
      <div className="mx-auto max-w-[700px] px-5 py-7">
        <div className="flex items-center justify-between"><Link href="/student/sprint/vocabulary" className="text-sm font-black text-[#64748B]">챌린지 홈</Link><span className="text-xs font-bold text-[#98A2B3]">{result.study_date}</span></div>
        <section className="mt-5 overflow-hidden rounded-[30px] bg-[#17213B] p-6 text-white shadow-xl"><p className="text-sm font-bold text-[#9EA9FF]">{result.session_type === "review" ? "오답 재시험 결과" : "오늘의 채점 결과"}</p><div className="mt-3 flex items-end justify-between"><div><h1 className="text-3xl font-black">{result.score}<span className="ml-1 text-base text-white/55">점</span></h1><p className="mt-2 text-sm text-white/60">{result.correct_count} / {result.total_count} 정답</p></div><div className="flex h-20 w-20 items-center justify-center rounded-full border-[7px] border-[#65E6BA] text-lg font-black">{rate}%</div></div></section>
        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3"><Link href="/student/sprint/vocabulary/wrong-notes" className="rounded-2xl bg-white p-4 text-center text-sm font-black text-[#6478FF] shadow-sm">오답노트 보기</Link><button disabled={starting} onClick={() => void review()} className="rounded-2xl bg-[#FFF1C9] p-4 text-sm font-black text-[#9A6500] shadow-sm disabled:opacity-50">{starting ? "준비 중..." : "오답 재시험"}</button></div>
        <div className="mt-7 flex items-center justify-between"><h2 className="text-xl font-black text-[#17213B]">문항별 결과</h2><button onClick={() => setOnlyWrong(!onlyWrong)} className={`rounded-full px-3 py-2 text-xs font-black ${onlyWrong ? "bg-[#17213B] text-white" : "bg-white text-[#667085]"}`}>오답만 보기</button></div>
        <div className="mt-3 space-y-3">
          {questions.map((question) => (
            <article key={question.id} className={`rounded-[22px] border-l-4 bg-white p-5 shadow-sm ${question.is_correct ? "border-l-[#45D3A2]" : "border-l-[#F27A63]"}`}>
              <div className="flex items-start justify-between"><div><p className="text-xs font-black text-[#A0A8B8]">{String(question.order_index).padStart(2, "0")}</p><h3 className="mt-1 text-xl font-black text-[#17213B]">{question.english}</h3></div><span className={`rounded-full px-3 py-1 text-xs font-black ${question.is_correct ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>{question.is_correct ? "정답" : "오답"}</span></div>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div className="rounded-xl bg-[#F7F9FB] p-3"><p className="text-[11px] font-bold text-[#98A2B3]">내 답안</p><p className={`mt-1 font-black ${question.is_correct ? "text-[#12815F]" : "text-[#D95D48]"}`}>{question.input_answer || "(빈 답안)"}</p></div><div className="rounded-xl bg-[#F0FAF6] p-3"><p className="text-[11px] font-bold text-[#75A394]">허용 정답</p><p className="mt-1 font-black text-[#276B58]">{question.accepted_answers.join(" · ")}</p></div></div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
