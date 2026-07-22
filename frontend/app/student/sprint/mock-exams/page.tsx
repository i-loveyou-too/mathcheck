"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type ExamInfo = {
  id: number;
  round_no: number;
  title: string;
  exam_date: string;
  weekday_label: string;
  start_time: string | null;
  submission_deadline_at: string;
  subject: string;
  question_count: number;
  status: "scheduled" | "open" | "closed";
  is_date_overridden: boolean;
  original_exam_date: string | null;
};
type SubmissionInfo = { status: string; raw_score: number | null; max_score: number | null; correct_count: number | null } | null;
type ExamEntry = { exam: ExamInfo; submission: SubmissionInfo };
type ListResponse = {
  available: boolean;
  today?: string;
  next_exam: ExamEntry | null;
  available_exams: ExamEntry[];
  submitted: ExamEntry[];
  graded: ExamEntry[];
  past: ExamEntry[];
};

const statusLabels: Record<string, string> = {
  scheduled: "예정", open: "응시 가능", closed: "마감",
};

function DDay({ examDate }: { examDate: string }) {
  const [y, m, d] = examDate.split("-").map(Number);
  const today = new Date();
  const target = new Date(y, m - 1, d);
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((target.getTime() - todayLocal.getTime()) / 86400000);
  if (diff > 0) return <span>D-{diff}</span>;
  if (diff === 0) return <span>D-DAY</span>;
  return <span>종료</span>;
}

function ExamCard({ entry }: { entry: ExamEntry }) {
  const { exam, submission } = entry;
  const actionLabel = submission?.status === "confirmed" || submission?.status === "graded"
    ? `결과 보기 · ${submission.raw_score}점`
    : submission?.status === "submitted"
      ? "채점 대기"
      : submission?.status === "draft"
        ? "이어서 응시하기"
        : exam.status === "open"
          ? "OMR 제출하기"
          : exam.status === "scheduled"
            ? "응시 전"
            : "미제출";
  const href = submission?.status === "graded" || submission?.status === "confirmed"
    ? `/student/sprint/mock-exams/${exam.id}/result`
    : `/student/sprint/mock-exams/${exam.id}`;

  return (
    <Link href={href} className="block rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#EAF5FF] px-2 py-0.5 text-[11px] font-black text-[#2874E8]">{exam.round_no}회차</span>
            {exam.is_date_overridden && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">일정 변경</span>}
          </div>
          <p className="mt-1.5 font-black text-[#10213D]">{exam.title}</p>
          <p className="mt-1 text-sm font-semibold text-[#6E7F99]">
            {exam.exam_date} ({exam.weekday_label}) · {exam.subject} · {exam.question_count}문항
          </p>
          {exam.is_date_overridden && exam.original_exam_date && (
            <p className="mt-1 text-xs font-bold text-amber-600">{exam.original_exam_date} → {exam.exam_date}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-black text-[#2874E8]"><DDay examDate={exam.exam_date} /></p>
          <p className="mt-1 text-xs font-bold text-[#8CA0BD]">{statusLabels[exam.status]}</p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-[#A9CBFA] px-4 py-2.5 text-center text-sm font-black text-[#2874E8]">{actionLabel}</div>
    </Link>
  );
}

export default function SprintMockExamsPage() {
  const router = useRouter();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    void apiFetch<ListResponse>(`/student/sprint/mock-exams?student_id=${student.id}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "모의고사 목록을 불러오지 못했습니다."));
  }, [router]);

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[50vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href="/student/sprint" className="text-sm font-black text-[#2874E8]">← SPRINT 홈</Link>
        <h1 className="mt-6 text-3xl font-black tracking-[-0.05em] text-[#10213D]">SPRINT 모의고사</h1>

        {!data.available ? (
          <section className="mt-8 rounded-[28px] bg-white/95 p-7 text-center shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF5FF] text-2xl font-black text-[#2E7BEA]">M</div>
            <h2 className="mt-5 text-xl font-black text-[#10213D]">등록된 모의고사가 없어요</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#6E7F99]">관리자가 모의고사 시리즈를 등록하면 이곳에 표시됩니다.</p>
          </section>
        ) : (
          <>
            {data.next_exam && (
              <section className="mt-6">
                <p className="mb-2 text-xs font-black tracking-widest text-[#2874E8]">다음 시험</p>
                <ExamCard entry={data.next_exam} />
              </section>
            )}
            {data.available_exams.length > 0 && (
              <section className="mt-8">
                <p className="mb-3 text-sm font-black text-[#10213D]">응시 가능</p>
                <div className="space-y-3">{data.available_exams.map((entry) => <ExamCard key={entry.exam.id} entry={entry} />)}</div>
              </section>
            )}
            {data.submitted.length > 0 && (
              <section className="mt-8">
                <p className="mb-3 text-sm font-black text-[#10213D]">제출 완료 (채점 대기)</p>
                <div className="space-y-3">{data.submitted.map((entry) => <ExamCard key={entry.exam.id} entry={entry} />)}</div>
              </section>
            )}
            {data.graded.length > 0 && (
              <section className="mt-8">
                <p className="mb-3 text-sm font-black text-[#10213D]">성적 확인</p>
                <div className="space-y-3">{data.graded.map((entry) => <ExamCard key={entry.exam.id} entry={entry} />)}</div>
              </section>
            )}
            {data.past.length > 0 && (
              <section className="mt-8">
                <p className="mb-3 text-sm font-black text-[#8CA0BD]">지난 시험</p>
                <div className="space-y-3 opacity-80">{data.past.map((entry) => <ExamCard key={entry.exam.id} entry={entry} />)}</div>
              </section>
            )}
            {!data.next_exam && data.available_exams.length === 0 && data.submitted.length === 0 && data.graded.length === 0 && data.past.length === 0 && (
              <section className="mt-8 rounded-[28px] bg-white/95 p-7 text-center shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
                <h2 className="text-xl font-black text-[#10213D]">예정된 모의고사가 없어요</h2>
              </section>
            )}
          </>
        )}
      </div>
    </ScreenShell>
  );
}
