"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

type Media = { media_type: string };
type Paper = { id: number; subject_code: string; subject_label: string; question_count: number; total_score: number; media: Media[] };
type ParticipantPaper = { id: number; status: string; slot_label: string; paper: Paper | null };
type OmrData = { participant_paper: ParticipantPaper; answers: { question_no: number; selected_answer: number | null }[] };

export default function StudentMockExamOmrPage() {
  const router = useRouter();
  const params = useParams<{ roundId: string; participantPaperId: string }>();
  const participantPaperId = Number(params.participantPaperId);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [data, setData] = useState<OmrData | null>(null);
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState<number | null>(null);

  const load = async (id: number) => {
    const result = await apiFetch<OmrData>(`/student/sprint/mock-exam-participant-papers/${participantPaperId}/omr?student_id=${id}`);
    setData(result);
    const next: Record<number, number | null> = {};
    result.answers.forEach((a) => { next[a.question_no] = a.selected_answer; });
    setAnswers(next);
  };

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void load(student.id).catch((reason) => setError(reason instanceof ApiError ? reason.message : "답안 정보를 불러오지 못했습니다."));
  }, [router, participantPaperId]);

  const saveDraft = async () => {
    if (!studentId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/student/sprint/mock-exam-participant-papers/${participantPaperId}/omr`, {
        method: "PUT",
        body: {
          student_id: studentId,
          answers: Object.entries(answers).map(([question_no, selected_answer]) => ({ question_no: Number(question_no), selected_answer })),
        },
      });
      setNotice("임시저장했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "임시저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (force = false) => {
    if (!studentId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveDraft();
      await apiFetch(`/student/sprint/mock-exam-participant-papers/${participantPaperId}/submit`, {
        method: "POST",
        body: { student_id: studentId, force },
      });
      router.push(`/student/sprint/mock-exam-rounds/${params.roundId}/papers/${participantPaperId}/result`);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setConfirmSubmit((reason.body as { detail?: string })?.detail ? 1 : 1);
        setError((reason.body as { detail?: string })?.detail ?? "미응답 문항이 있습니다.");
      } else {
        setError(reason instanceof ApiError ? reason.message : "제출에 실패했습니다.");
      }
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

  const paper = data.participant_paper.paper;
  if (!paper) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[70vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">시험지가 아직 배정되지 않았습니다.</div>
      </ScreenShell>
    );
  }
  const audio = paper.media.find((m) => m.media_type === "listening_audio");
  const locked = data.participant_paper.status !== "draft" && data.participant_paper.status !== "not_started";
  const answeredCount = Object.values(answers).filter((v) => v != null).length;

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href={`/student/sprint/mock-exam-rounds/${params.roundId}`} className="break-keep text-sm font-black text-[#2874E8]">← 회차로 돌아가기</Link>
        <h1 className="mt-4 break-keep text-2xl font-black tracking-[-0.05em] text-[#10213D]">{paper.subject_label} OMR</h1>
        <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">{paper.question_count}문항 · {paper.total_score}점 · {answeredCount}/{paper.question_count} 응답</p>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 break-keep rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        {audio && studentId && (
          <section className="mt-4 rounded-[22px] bg-white/95 p-4 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <p className="break-keep text-xs font-black text-[#6E7F99]">영어듣기</p>
            <audio controls preload="metadata" src={`${API_BASE_URL}/student/sprint/mock-exam-papers/${paper.id}/listening-audio?student_id=${studentId}`} className="mt-2 w-full" />
          </section>
        )}

        {locked ? (
          <div className="mt-4 rounded-[22px] bg-white/95 p-5 text-center shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <p className="break-keep text-sm font-bold text-[#6E7F99]">이미 제출된 과목입니다.</p>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              {Array.from({ length: paper.question_count }, (_, i) => i + 1).map((qno) => (
                <div key={qno} className="flex items-center gap-2 rounded-[18px] bg-white/95 p-3 shadow-[0_8px_20px_rgba(71,104,143,0.10)] ring-1 ring-[#DFEAF6]">
                  <span className="w-8 shrink-0 break-keep text-sm font-black text-[#10213D]">{qno}번</span>
                  <div className="grid flex-1 grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map((choice) => (
                      <button
                        key={choice}
                        onClick={() => setAnswers((prev) => ({ ...prev, [qno]: prev[qno] === choice ? null : choice }))}
                        className={`h-9 rounded-lg text-sm font-black ${answers[qno] === choice ? "bg-[#2874E8] text-white" : "bg-[#F5F8FC] text-[#40516D]"}`}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => void saveDraft()} className="h-12 break-keep rounded-2xl bg-[#EAF5FF] text-sm font-black text-[#2874E8] disabled:opacity-40">임시저장</button>
              <button disabled={busy} onClick={() => void submit(confirmSubmit != null)} className="h-12 break-keep rounded-2xl bg-[#2874E8] text-sm font-black text-white disabled:opacity-40">
                {confirmSubmit != null ? "그래도 제출" : "최종 제출"}
              </button>
            </div>
          </>
        )}
      </div>
    </ScreenShell>
  );
}
