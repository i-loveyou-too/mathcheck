"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type OmrAnswer = { question_no: number; selected_answer: number | null };
type OmrData = {
  assignment: { id: number; catalog: { title: string; subject: string; question_count: number } };
  answers: OmrAnswer[];
};

export default function StudentMockExamOmrPage() {
  const router = useRouter();
  const params = useParams<{ assignmentId: string }>();
  const assignmentId = Number(params.assignmentId);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [data, setData] = useState<OmrData | null>(null);
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const student = getStudent();
    if (!student) { router.push("/login"); return; }
    setStudentId(student.id);
    void apiFetch<OmrData>(`/student/sprint/mock-exam-assignments/${assignmentId}/omr?student_id=${student.id}`)
      .then((result) => {
        setData(result);
        setAnswers(Object.fromEntries(result.answers.map((a) => [a.question_no, a.selected_answer])));
      })
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : "답안을 불러오지 못했습니다."));
  }, [router, assignmentId]);

  const saveDraft = async (silent = false) => {
    if (!studentId || !data) return false;
    if (!silent) { setBusy(true); setError(""); setNotice(""); }
    try {
      await apiFetch(`/student/sprint/mock-exam-assignments/${assignmentId}/omr`, {
        method: "PUT",
        body: { student_id: studentId, answers: Object.entries(answers).map(([q, a]) => ({ question_no: Number(q), selected_answer: a })) },
      });
      if (!silent) setNotice("임시저장했습니다.");
      return true;
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "저장에 실패했습니다.");
      return false;
    } finally {
      if (!silent) setBusy(false);
    }
  };

  const submit = async () => {
    if (!studentId || !data) return;
    const answered = Object.values(answers).filter((a) => a !== null).length;
    const total = data.assignment.catalog.question_count;
    const confirmMsg = answered < total
      ? `미응답 문항이 ${total - answered}개 있습니다. 제출하면 채점되며 더 이상 수정할 수 없습니다. 제출할까요?`
      : "제출하면 자동 채점되며 더 이상 수정할 수 없습니다. 제출할까요?";
    if (!window.confirm(confirmMsg)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await saveDraft(true);
      if (!saved) return;
      await apiFetch(`/student/sprint/mock-exam-assignments/${assignmentId}/submit`, {
        method: "POST",
        body: { student_id: studentId, force: true },
      });
      router.push(`/student/sprint/mock-exam-assignments/${assignmentId}/result`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "제출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[70vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  const total = data.assignment.catalog.question_count;
  const answeredCount = Object.values(answers).filter((a) => a !== null).length;

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-40 pt-10">
        <Link href={`/student/sprint/mock-exam-assignments/${assignmentId}`} className="break-keep text-sm font-black text-[#2874E8]">← 시험 화면</Link>
        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="break-keep text-2xl font-black tracking-[-0.05em] text-[#10213D]">{data.assignment.catalog.title}</h1>
          <span className="shrink-0 break-keep rounded-full bg-[#EAF5FF] px-3 py-1.5 text-xs font-black text-[#2874E8]">{answeredCount}/{total}</span>
        </div>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 break-keep rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-6 rounded-[28px] bg-white/95 p-4 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
          <div className="space-y-1.5">
            {Array.from({ length: total }, (_, i) => i + 1).map((qno) => (
              <div key={qno} className="flex items-center gap-2 rounded-xl px-1 py-1">
                <span className="w-8 shrink-0 break-keep text-sm font-black text-[#6E7F99]">{qno}</span>
                <div className="flex flex-1 gap-1.5">
                  {[1, 2, 3, 4, 5].map((choice) => {
                    const selected = answers[qno] === choice;
                    return (
                      <button
                        key={choice}
                        onClick={() => setAnswers((prev) => ({ ...prev, [qno]: selected ? null : choice }))}
                        className={`flex h-9 flex-1 items-center justify-center break-keep rounded-lg text-sm font-black transition ${selected ? "bg-[#2874E8] text-white" : "bg-[#F5F8FC] text-[#8CA0BD]"}`}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="fixed bottom-6 left-1/2 z-20 flex w-[calc(100%-2.5rem)] max-w-[400px] -translate-x-1/2 gap-2">
          <button disabled={busy} onClick={() => void saveDraft()} className="h-12 flex-1 break-keep rounded-2xl bg-white text-sm font-black text-[#2874E8] shadow-[0_8px_20px_rgba(60,94,140,0.18)] disabled:opacity-40">임시저장</button>
          <button disabled={busy} onClick={() => void submit()} className="h-12 flex-1 break-keep rounded-2xl bg-[#2874E8] text-sm font-black text-white shadow-[0_8px_20px_rgba(40,116,232,0.3)] disabled:opacity-40">최종 제출</button>
        </div>
      </div>
    </ScreenShell>
  );
}
