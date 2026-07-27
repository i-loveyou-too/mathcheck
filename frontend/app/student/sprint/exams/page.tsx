"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type AttemptSummary = {
  id: number;
  attempt_no: number;
  status: "started" | "submitted" | "scored" | "voided";
  started_at: string | null;
  submitted_at: string | null;
  scored_at: string | null;
};

type Assignment = {
  id: number;
  exam_title: string | null;
  status: string;
  computed_status: "available" | "upcoming" | "completed" | "expired";
  paper_count: number;
  attempt_count: number;
  base_attempt_count: number;
  available_retake_approval_count: number;
  attempt_limit: number;
  available_from: string | null;
  due_at: string | null;
  latest_attempt: AttemptSummary | null;
};

type ListResponse = { items: Assignment[] };

const statusLabels: Record<string, string> = {
  available: "응시 가능",
  upcoming: "예정",
  completed: "제출 완료",
  expired: "마감",
  assigned: "배정됨",
  in_progress: "응시 중",
  submitted: "제출 완료",
  closed: "종료",
};

const attemptLabels: Record<AttemptSummary["status"], string> = {
  started: "응시 중",
  submitted: "채점 대기",
  scored: "결과 확인",
  voided: "무효 처리",
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusTone(status: string) {
  if (status === "available" || status === "started") return "bg-[#EAF5FF] text-[#2874E8]";
  if (status === "submitted" || status === "completed") return "bg-[#FFF6E2] text-[#D68B00]";
  if (status === "scored") return "bg-[#EAF8F1] text-[#17895E]";
  if (status === "voided" || status === "expired") return "bg-[#FFF0F0] text-[#E25050]";
  return "bg-[#F0F3F8] text-[#667085]";
}

export default function StudentSprintExamAssignmentsPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    void apiFetch<ListResponse>("/student/sprint-exam-v2/assignments")
      .then((result) => setAssignments(result.items))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "모의고사 목록을 불러오지 못했습니다."));
  }, [router]);

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <div className="flex items-center justify-between">
          <Link href="/student/sprint" className="break-keep text-sm font-black text-[#2874E8]">← SPRINT 홈</Link>
          <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-black text-[#2874E8] ring-1 ring-[#DCEBFA]">OMR 입력</span>
        </div>

        <header className="mt-5">
          <p className="text-sm font-black tracking-[0.18em] text-[#2874E8]">SPRINT EXAM</p>
          <h1 className="mt-1 break-keep text-3xl font-black tracking-[-0.05em] text-[#10213D]">모의고사</h1>
          <p className="mt-2 break-keep text-sm font-bold leading-6 text-[#6E7F99]">종이 시험지로 문제를 풀고, 앱에서는 OMR 답안만 직접 체크해 제출합니다.</p>
        </header>

        {error && <p className="mt-5 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <div className="mt-6 space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:gap-4">
          {assignments === null && !error && <p className="py-12 text-center text-sm font-bold text-[#8CA0BD] md:col-span-2">배정된 시험을 불러오는 중...</p>}
          {assignments?.length === 0 && (
            <section className="rounded-[28px] bg-white/90 p-8 text-center shadow-[0_18px_36px_rgba(49,89,130,0.14)] ring-1 ring-[#DCEBFA] md:col-span-2">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#EAF5FF] text-2xl font-black text-[#2874E8]">OMR</div>
              <h2 className="mt-5 break-keep text-xl font-black text-[#10213D]">배정된 모의고사가 없습니다.</h2>
              <p className="mt-2 break-keep text-sm font-semibold leading-6 text-[#6E7F99]">관리자가 시험을 배정하면 이곳에서 응시할 수 있습니다.</p>
            </section>
          )}
          {assignments?.map((assignment) => {
            const latest = assignment.latest_attempt;
            const badge = latest ? attemptLabels[latest.status] : statusLabels[assignment.computed_status] ?? assignment.status;
            return (
              <Link
                key={assignment.id}
                href={`/student/sprint/exams/${assignment.id}`}
                className="block h-full rounded-[24px] bg-white/95 p-5 shadow-[0_14px_32px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-keep text-lg font-black text-[#10213D]">{assignment.exam_title ?? "모의고사"}</p>
                    <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">
                      과목 {assignment.paper_count}개 · 응시 {assignment.base_attempt_count}/{assignment.attempt_limit}
                    </p>
                  </div>
                  <span className={`shrink-0 break-keep rounded-full px-3 py-1.5 text-xs font-black ${statusTone(latest?.status ?? assignment.computed_status)}`}>{badge}</span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 text-xs font-bold text-[#6E7F99] sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#F6FAFF] px-3 py-2">시작 {formatDateTime(assignment.available_from)}</div>
                  <div className="rounded-2xl bg-[#F6FAFF] px-3 py-2">마감 {formatDateTime(assignment.due_at)}</div>
                </div>
                {latest && <p className="mt-3 text-xs font-bold text-[#8CA0BD]">최근 응시 #{latest.attempt_no} · {attemptLabels[latest.status]}</p>}
              </Link>
            );
          })}
        </div>
      </div>
    </ScreenShell>
  );
}
