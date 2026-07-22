"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type ExamInfo = {
  id: number;
  round_no: number;
  title: string;
  exam_date: string;
  question_count: number;
  status: "scheduled" | "open" | "closed";
};
type AnswerItem = { question_no: number; selected_answer: number | null };
type OmrResponse = { exam: ExamInfo; submission_id: number | null; answers: AnswerItem[] };

export default function SprintMockExamOmrPage() {
  const router = useRouter();
  const params = useParams<{ examId: string }>();
  const examId = Number(params.examId);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [current, setCurrent] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingUnanswered, setConfirmingUnanswered] = useState<number[] | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void apiFetch<OmrResponse>(`/student/sprint/mock-exams/${examId}/omr?student_id=${student.id}`)
      .then((result) => {
        setExam(result.exam);
        const map: Record<number, number | null> = {};
        result.answers.forEach((item) => { map[item.question_no] = item.selected_answer; });
        setAnswers(map);
      })
      .catch((reason) => {
        if (reason instanceof ApiError && reason.status === 400) {
          setLocked(true);
          return;
        }
        setError(reason instanceof Error ? reason.message : "OMR 정보를 불러오지 못했습니다.");
      });
  }, [router, examId]);

  const unansweredNos = useMemo(
    () => (exam ? Array.from({ length: exam.question_count }, (_, i) => i + 1).filter((q) => answers[q] == null) : []),
    [exam, answers],
  );

  const selectAnswer = async (questionNo: number, value: number) => {
    if (!studentId || saving) return;
    setAnswers((prev) => ({ ...prev, [questionNo]: value }));
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/student/sprint/mock-exams/${examId}/omr`, {
        method: "PUT",
        body: { student_id: studentId, answers: [{ question_no: questionNo, selected_answer: value }] },
      });
      setNotice("저장됨");
      setTimeout(() => setNotice(""), 1000);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "임시저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const doSubmit = async (force: boolean) => {
    if (!studentId) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/student/sprint/mock-exams/${examId}/submit`, {
        method: "POST",
        body: { student_id: studentId, force },
      });
      router.push(`/student/sprint/mock-exams/${examId}/result`);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setConfirmingUnanswered(unansweredNos);
        return;
      }
      setError(reason instanceof ApiError ? reason.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (locked) {
    return (
      <ScreenShell withBottomNav>
        <div className="mt-10 rounded-[28px] bg-white p-8 text-center shadow-card">
          <h2 className="text-xl font-black text-[#17213B]">이미 제출된 시험입니다</h2>
          <p className="mt-2 text-sm text-[#7A859F]">제출 후에는 답안을 수정할 수 없어요.</p>
          <button onClick={() => router.push(`/student/sprint/mock-exams/${examId}`)} className="mt-6 h-12 w-full rounded-2xl bg-[#2874E8] text-sm font-black text-white">시험 상세로 돌아가기</button>
        </div>
      </ScreenShell>
    );
  }

  if (!exam) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[50vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell withBottomNav>
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-[#FF6B4A]">OMR</p>
          <h1 className="mt-1 text-xl font-black text-[#17213B]">{exam.round_no}회차 · {exam.title}</h1>
        </div>
        <Link href={`/student/sprint/mock-exams/${examId}`} className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#5C63FF] shadow-sm">나가기</Link>
      </div>

      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
      {notice && <p className="text-right text-xs font-bold text-emerald-600">{notice}</p>}

      <section className="rounded-[28px] bg-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <button disabled={current <= 1} onClick={() => setCurrent((c) => Math.max(1, c - 1))} className="h-10 w-10 rounded-full bg-[#F0F2F8] text-lg font-black text-[#17213B] disabled:opacity-30">‹</button>
          <p className="text-lg font-black text-[#17213B]">문항 {current} / {exam.question_count}</p>
          <button disabled={current >= exam.question_count} onClick={() => setCurrent((c) => Math.min(exam.question_count, c + 1))} className="h-10 w-10 rounded-full bg-[#F0F2F8] text-lg font-black text-[#17213B] disabled:opacity-30">›</button>
        </div>

        <div className="mt-6 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((option) => (
            <button
              key={option}
              onClick={() => void selectAnswer(current, option)}
              className={`h-16 rounded-2xl text-xl font-black transition ${answers[current] === option ? "bg-[#FF6B4A] text-white" : "bg-[#F0F2F8] text-[#17213B]"}`}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] bg-white p-5 shadow-card">
        <p className="mb-3 text-sm font-black text-[#17213B]">전체 답안표 {unansweredNos.length > 0 && <span className="text-[#E5533C]">(미응답 {unansweredNos.length}개)</span>}</p>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {Array.from({ length: exam.question_count }, (_, i) => i + 1).map((questionNo) => (
            <button
              key={questionNo}
              onClick={() => setCurrent(questionNo)}
              className={`aspect-square rounded-xl text-xs font-black ${
                questionNo === current
                  ? "bg-[#17213B] text-white"
                  : answers[questionNo] != null
                    ? "bg-[#EAF5FF] text-[#2874E8]"
                    : "bg-red-50 text-red-500"
              }`}
            >
              {questionNo}
            </button>
          ))}
        </div>
      </section>

      {confirmingUnanswered && (
        <section className="rounded-[28px] bg-amber-50 p-5 shadow-card ring-1 ring-amber-200">
          <p className="font-black text-amber-800">미응답 문항이 {confirmingUnanswered.length}개 있어요</p>
          <p className="mt-1 text-sm text-amber-700">문항 {confirmingUnanswered.join(", ")}. 그대로 제출할까요?</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmingUnanswered(null)} className="h-11 rounded-2xl bg-white text-sm font-black text-amber-800">다시 확인하기</button>
            <button disabled={submitting} onClick={() => { setConfirmingUnanswered(null); void doSubmit(true); }} className="h-11 rounded-2xl bg-amber-600 text-sm font-black text-white disabled:opacity-50">그대로 제출</button>
          </div>
        </section>
      )}

      <button disabled={submitting} onClick={() => void doSubmit(false)} className="h-14 w-full rounded-2xl bg-[#FF6B4A] text-base font-black text-white disabled:opacity-50">
        {submitting ? "제출 중..." : "최종 제출"}
      </button>
    </ScreenShell>
  );
}
