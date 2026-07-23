"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getStudent } from "@/lib/storage";

type ParticipantPaper = { id: number; subject_slot: string; slot_label: string; subject_label: string | null; status: string; raw_score: number | null };
type Participant = { id: number; status: string; papers: ParticipantPaper[] };
type Round = { id: number; round_no: number; title: string; exam_date: string; status: string; participant: Participant };

const ROUND_STATUS_LABELS: Record<string, string> = { scheduled: "예정", open: "응시 가능", closed: "마감" };
const PARTICIPANT_STATUS_LABELS: Record<string, string> = { not_started: "미응시", in_progress: "진행 중", completed: "완료" };
const SLOT_ORDER = ["korean", "math", "english", "inquiry_1", "inquiry_2"];

export default function StudentMockExamRoundsPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [error, setError] = useState("");
  const [sprintContext, setSprintContext] = useState<{ dayNumber: number | null } | null>(null);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void apiFetch<Round[]>(`/student/sprint/mock-exam-rounds?student_id=${student.id}`)
      .then(setRounds)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : "회차 목록을 불러오지 못했습니다."));
    void apiFetch<{ program: { day_info: { day_number: number } } | null }>(`/student/sprint/dashboard?student_id=${student.id}&study_date=${getStudyDate()}`)
      .then((dashboard) => setSprintContext({ dayNumber: dashboard.program?.day_info?.day_number ?? null }))
      .catch(() => null);
  }, [router]);

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <div className="flex items-center justify-between">
          <Link href="/student/sprint" className="break-keep text-sm font-black text-[#2874E8]">← SPRINT 홈</Link>
          {sprintContext?.dayNumber != null && (
            <span className="shrink-0 break-keep rounded-full bg-white/80 px-3 py-1.5 text-xs font-black text-[#2874E8] ring-1 ring-[#DCEBFA]">DAY {sprintContext.dayNumber}</span>
          )}
        </div>

        <h1 className="mt-4 break-keep text-3xl font-black tracking-[-0.05em] text-[#10213D]">SPRINT 모의고사</h1>
        <p className="mt-2 break-keep text-sm font-bold text-[#6E7F99]">국어·수학·영어·탐구 2과목, 총 5과목을 모두 제출하면 회차가 완료돼요.</p>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <div className="mt-6 space-y-3">
          {rounds === null && !error && <p className="break-keep text-center text-sm font-bold text-[#8CA0BD]">불러오는 중...</p>}
          {rounds?.length === 0 && (
            <div className="rounded-[24px] bg-white/85 p-8 text-center shadow-[0_12px_28px_rgba(71,104,143,0.12)] ring-1 ring-[#DFEAF6]">
              <p className="break-keep text-sm font-bold text-[#8CA0BD]">배정된 모의고사 회차가 없습니다.</p>
            </div>
          )}
          {rounds?.map((round) => {
            const slots = [...round.participant.papers].sort((a, b) => SLOT_ORDER.indexOf(a.subject_slot) - SLOT_ORDER.indexOf(b.subject_slot));
            const doneCount = slots.filter((s) => s.status === "graded" || s.status === "confirmed").length;
            return (
              <Link
                key={round.id}
                href={`/student/sprint/mock-exam-rounds/${round.id}`}
                className="block rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="break-keep font-black text-[#10213D]">{round.round_no}회차 · {round.title}</p>
                    <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">시험일 {round.exam_date} · {ROUND_STATUS_LABELS[round.status] ?? round.status}</p>
                  </div>
                  <span className="shrink-0 break-keep rounded-full bg-[#EAF5FF] px-3 py-1.5 text-xs font-black text-[#2874E8]">{PARTICIPANT_STATUS_LABELS[round.participant.status] ?? round.participant.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {slots.map((slot) => (
                    <span key={slot.id} className={`break-keep rounded-full px-2.5 py-1 text-[11px] font-black ${slot.status === "graded" || slot.status === "confirmed" ? "bg-emerald-50 text-emerald-600" : slot.status === "needs_selection" ? "bg-amber-50 text-amber-700" : "bg-[#F5F8FC] text-[#8CA0BD]"}`}>
                      {slot.slot_label}{slot.raw_score != null ? ` ${slot.raw_score}점` : ""}
                    </span>
                  ))}
                </div>
                <p className="mt-3 break-keep text-xs font-bold text-[#8CA0BD]">{doneCount} / 5과목 완료</p>
              </Link>
            );
          })}
        </div>
      </div>
    </ScreenShell>
  );
}
