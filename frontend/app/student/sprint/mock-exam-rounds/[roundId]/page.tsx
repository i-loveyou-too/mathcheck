"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

const INQUIRY_SUBJECT_OPTIONS = [
  { code: "life_ethics", label: "생활과 윤리" },
  { code: "ethics_thought", label: "윤리와 사상" },
  { code: "social_culture", label: "사회문화" },
  { code: "east_asian_history", label: "동아시아사" },
];

type Paper = { id: number; subject_code: string; question_count: number; total_score: number; media: { media_type: string }[] };
type ParticipantPaper = {
  id: number; paper_id: number | null; subject_slot: string; slot_label: string; subject_label: string | null; status: string;
  raw_score: number | null; max_score: number | null; correct_count: number | null; paper: Paper | null;
};
type Participant = { id: number; status: string; papers: ParticipantPaper[] };
type Round = { id: number; round_no: number; title: string; exam_date: string; status: string; participant: Participant };

const STATUS_LABELS: Record<string, string> = {
  needs_selection: "선택과목 설정 필요", not_started: "미응시", draft: "작성 중", submitted: "제출됨", graded: "결과 보기", confirmed: "확정",
};
const SLOT_ORDER = ["korean", "math", "english", "inquiry_1", "inquiry_2"];

export default function StudentMockExamRoundDetailPage() {
  const router = useRouter();
  const params = useParams<{ roundId: string }>();
  const roundId = Number(params.roundId);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingInquiry, setSavingInquiry] = useState(false);

  const load = async (id: number) => {
    const result = await apiFetch<Round>(`/student/sprint/mock-exam-rounds/${roundId}?student_id=${id}`);
    setRound(result);
  };

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void load(student.id).catch((reason) => setError(reason instanceof ApiError ? reason.message : "회차 정보를 불러오지 못했습니다."));
  }, [router, roundId]);

  const inquirySlots = round?.participant.papers.filter((p) => p.subject_slot === "inquiry_1" || p.subject_slot === "inquiry_2") ?? [];
  const inquiryNeedsSelection = inquirySlots.some((p) => p.status === "needs_selection");
  const [inquiry1, setInquiry1] = useState("");
  const [inquiry2, setInquiry2] = useState("");

  const saveInquirySubjects = async () => {
    if (!studentId || !inquiry1 || !inquiry2) {
      setError("탐구 선택과목 2개를 모두 선택해주세요.");
      return;
    }
    if (inquiry1 === inquiry2) {
      setError("탐구 선택과목 두 개는 서로 달라야 합니다.");
      return;
    }
    setSavingInquiry(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/student/sprint/inquiry-subjects", {
        method: "PATCH",
        body: { student_id: studentId, inquiry_subject_1: inquiry1, inquiry_subject_2: inquiry2 },
      });
      await load(studentId);
      setNotice("탐구 선택과목을 설정했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "탐구 선택과목을 저장하지 못했습니다.");
    } finally {
      setSavingInquiry(false);
    }
  };

  if (!round) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[70vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  const slots = [...round.participant.papers].sort((a, b) => SLOT_ORDER.indexOf(a.subject_slot) - SLOT_ORDER.indexOf(b.subject_slot));

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href="/student/sprint/mock-exam-rounds" className="break-keep text-sm font-black text-[#2874E8]">← 회차 목록</Link>
        <h1 className="mt-4 break-keep text-2xl font-black tracking-[-0.05em] text-[#10213D]">{round.round_no}회차 · {round.title}</h1>
        <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">시험일 {round.exam_date}</p>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 break-keep rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        {inquiryNeedsSelection && (
          <section className="mt-6 rounded-[24px] bg-white/95 p-5 shadow-[0_18px_36px_rgba(49,89,130,0.18)] ring-1 ring-[#DCEBFA]">
            <p className="break-keep text-sm font-black text-[#10213D]">탐구 선택과목을 설정해주세요</p>
            <p className="mt-1 break-keep text-xs font-bold text-[#6E7F99]">선택과목을 정해야 탐구 시험지가 배정되고 회차를 완료할 수 있어요.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select value={inquiry1} onChange={(e) => setInquiry1(e.target.value)} className="h-11 rounded-xl border border-[#DFEAF6] px-3 text-sm text-[#10213D]">
                <option value="">탐구 1 선택</option>
                {INQUIRY_SUBJECT_OPTIONS.filter((opt) => opt.code !== inquiry2).map((opt) => <option key={opt.code} value={opt.code}>{opt.label}</option>)}
              </select>
              <select value={inquiry2} onChange={(e) => setInquiry2(e.target.value)} className="h-11 rounded-xl border border-[#DFEAF6] px-3 text-sm text-[#10213D]">
                <option value="">탐구 2 선택</option>
                {INQUIRY_SUBJECT_OPTIONS.filter((opt) => opt.code !== inquiry1).map((opt) => <option key={opt.code} value={opt.code}>{opt.label}</option>)}
              </select>
            </div>
            <button disabled={savingInquiry} onClick={() => void saveInquirySubjects()} className="mt-3 h-11 w-full break-keep rounded-2xl bg-[#2874E8] text-sm font-black text-white disabled:opacity-40">{savingInquiry ? "저장 중..." : "선택과목 저장"}</button>
          </section>
        )}

        <div className="mt-4 space-y-3">
          {slots.map((slot) => {
            const isDone = slot.status === "graded" || slot.status === "confirmed";
            const isLocked = slot.status === "submitted";
            const canEnter = slot.paper_id != null && slot.status !== "needs_selection";
            return (
              <div key={slot.id} className="rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="break-keep font-black text-[#10213D]">{slot.slot_label}{slot.subject_label && slot.subject_label !== slot.slot_label ? ` · ${slot.subject_label}` : ""}</p>
                    <p className="mt-1 break-keep text-xs font-bold text-[#8CA0BD]">
                      {slot.paper ? `${slot.paper.question_count}문항 · ${slot.paper.total_score}점` : "시험지 미등록"}
                      {isDone && slot.raw_score != null ? ` · ${slot.raw_score}점 (${slot.correct_count}문항 정답)` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 break-keep rounded-full px-3 py-1.5 text-xs font-black ${isDone ? "bg-emerald-50 text-emerald-600" : slot.status === "needs_selection" ? "bg-amber-50 text-amber-700" : "bg-[#EAF5FF] text-[#2874E8]"}`}>
                    {STATUS_LABELS[slot.status] ?? slot.status}
                  </span>
                </div>
                {canEnter && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {isDone ? (
                      <Link href={`/student/sprint/mock-exam-rounds/${round.id}/papers/${slot.id}/result`} className="col-span-2 block h-11 break-keep rounded-2xl bg-[#2874E8] text-center text-sm font-black leading-[2.75rem] text-white">결과 보기</Link>
                    ) : (
                      <>
                        {slot.paper && studentId && (
                          <a href={`${API_BASE_URL}/student/sprint/mock-exam-papers/${slot.paper.id}/paper-file?student_id=${studentId}`} target="_blank" rel="noopener noreferrer" className="block h-11 break-keep rounded-2xl bg-[#EAF5FF] text-center text-sm font-black leading-[2.75rem] text-[#2874E8]">문제지 받기</a>
                        )}
                        <Link href={`/student/sprint/mock-exam-rounds/${round.id}/papers/${slot.id}/omr`} className="block h-11 break-keep rounded-2xl bg-[#10213D] text-center text-sm font-black leading-[2.75rem] text-white">{isLocked ? "채점 대기" : "OMR 입력하기"}</Link>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ScreenShell>
  );
}
