"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
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
type SubmissionInfo = { id: number; status: string; raw_score: number | null; max_score: number | null; correct_count: number | null } | null;
type DetailResponse = { exam: ExamInfo; submission: SubmissionInfo };

export default function SprintMockExamDetailPage() {
  const router = useRouter();
  const params = useParams<{ examId: string }>();
  const examId = Number(params.examId);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    void apiFetch<DetailResponse>(`/student/sprint/mock-exams/${examId}?student_id=${student.id}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : "시험 정보를 불러오지 못했습니다."));
  }, [router, examId]);

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[50vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  const { exam, submission } = data;
  const locked = submission && ["submitted", "graded", "confirmed"].includes(submission.status);
  const canOmr = exam.status === "open" || (exam.status === "closed" && !locked);

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href="/student/sprint/mock-exams" className="text-sm font-black text-[#2874E8]">← 모의고사 목록</Link>

        <section className="mt-6 rounded-[28px] bg-[#10213D] p-6 text-white shadow-[0_18px_40px_rgba(16,33,61,0.3)]">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black">{exam.round_no}회차</span>
            {exam.is_date_overridden && <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-black text-amber-200">일정 변경</span>}
          </div>
          <h1 className="mt-3 text-2xl font-black">{exam.title}</h1>
          <p className="mt-2 text-sm font-semibold text-white/70">{exam.exam_date} ({exam.weekday_label}) · {exam.subject} · {exam.question_count}문항</p>
          {exam.is_date_overridden && exam.original_exam_date && (
            <p className="mt-1 text-xs font-bold text-amber-300">원래 {exam.original_exam_date} → 변경 {exam.exam_date}</p>
          )}
          <p className="mt-3 text-xs font-bold text-white/55">제출 마감 {new Date(exam.submission_deadline_at).toLocaleString("ko-KR")}</p>
        </section>

        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <section className="mt-6 rounded-[24px] bg-white/95 p-5 shadow-card ring-1 ring-[#DFEAF6]">
          {submission?.status === "graded" || submission?.status === "confirmed" ? (
            <>
              <p className="text-sm font-bold text-[#6E7F99]">채점 완료</p>
              <p className="mt-2 text-3xl font-black text-[#2874E8]">{submission.raw_score}점</p>
              <p className="mt-1 text-sm font-semibold text-[#8CA0BD]">{submission.correct_count} / {exam.question_count} 문항 정답</p>
              <Link href={`/student/sprint/mock-exams/${exam.id}/result`} className="mt-4 block rounded-2xl bg-[#2874E8] px-4 py-3 text-center text-sm font-black text-white">결과 상세 보기</Link>
            </>
          ) : submission?.status === "submitted" ? (
            <>
              <p className="font-black text-[#10213D]">제출 완료 · 채점 대기 중</p>
              <p className="mt-2 text-sm text-[#6E7F99]">채점이 완료되면 이곳에서 점수를 확인할 수 있어요.</p>
            </>
          ) : canOmr ? (
            <>
              <p className="font-black text-[#10213D]">{submission?.status === "draft" ? "작성 중인 답안이 있어요" : "아직 응시하지 않았어요"}</p>
              <p className="mt-2 text-sm text-[#6E7F99]">OMR 화면에서 답안을 작성하고 제출하세요.</p>
              <Link href={`/student/sprint/mock-exams/${exam.id}/omr`} className="mt-4 block rounded-2xl bg-[#FF6B4A] px-4 py-3 text-center text-sm font-black text-white">
                {submission?.status === "draft" ? "이어서 작성하기" : "OMR 작성하기"}
              </Link>
            </>
          ) : (
            <p className="font-black text-[#8CA0BD]">{exam.status === "scheduled" ? "아직 시험 기간이 아니에요." : "마감되어 더 이상 응시할 수 없어요."}</p>
          )}
        </section>
      </div>
    </ScreenShell>
  );
}
