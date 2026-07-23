"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getStudent } from "@/lib/storage";

type Assignment = {
  id: number;
  title: string;
  subject: string | null;
  assigned_date: string;
  due_date: string | null;
  submission_status: "not_submitted" | "draft" | "pending" | "approved" | "rejected";
};
// SPRINT DAY/스트라이크와의 연결 표시용 — 기존 대시보드 조회 API를 읽기 전용으로 재사용한다.
type SprintContext = { dayNumber: number | null; strikeEffective: number; strikeThreshold: number };

const statusLabels: Record<string, string> = {
  not_submitted: "제출 전", draft: "작성 중", pending: "검토 대기", approved: "승인 완료", rejected: "반려됨",
};

const statusTone: Record<string, string> = {
  not_submitted: "text-[#2874E8] bg-[#EAF5FF]",
  draft: "text-[#2874E8] bg-[#EAF5FF]",
  pending: "text-[#E18A00] bg-[#FFF6E2]",
  approved: "text-[#17895E] bg-[#EAF8F1]",
  rejected: "text-[#E25050] bg-[#FFF0F0]",
};

export default function StudentSprintWorksheetsPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState("");
  const [sprintContext, setSprintContext] = useState<SprintContext | null>(null);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void apiFetch<Assignment[]>(`/student/sprint/worksheets?student_id=${student.id}`)
      .then(setAssignments)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "문제지 목록을 불러오지 못했습니다."));
    void apiFetch<{ program: { day_info: { day_number: number } } | null; strike_summary?: { effective: number; threshold: number } }>(
      `/student/sprint/dashboard?student_id=${student.id}&study_date=${getStudyDate()}`,
    )
      .then((dashboard) => {
        if (!dashboard.program) return;
        setSprintContext({
          dayNumber: dashboard.program.day_info?.day_number ?? null,
          strikeEffective: dashboard.strike_summary?.effective ?? 0,
          strikeThreshold: dashboard.strike_summary?.threshold ?? 3,
        });
      })
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

        <h1 className="mt-4 break-keep text-3xl font-black tracking-[-0.05em] text-[#10213D]">문제지</h1>
        {sprintContext && (
          <p className="mt-2 break-keep text-sm font-bold text-[#6E7F99]">풀이를 제출하면 SPRINT 진행률에 반영돼요. 스트라이크 {sprintContext.strikeEffective}/{sprintContext.strikeThreshold}</p>
        )}

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <div className="mt-6 space-y-3">
          {assignments === null && !error && <p className="break-keep text-center text-sm font-bold text-[#8CA0BD]">불러오는 중...</p>}
          {assignments?.length === 0 && (
            <div className="rounded-[24px] bg-white/85 p-8 text-center shadow-[0_12px_28px_rgba(71,104,143,0.12)] ring-1 ring-[#DFEAF6]">
              <p className="break-keep text-sm font-bold text-[#8CA0BD]">배정된 문제지가 없습니다.</p>
            </div>
          )}
          {assignments?.map((assignment) => (
            <Link
              key={assignment.id}
              href={`/student/sprint/worksheets/${assignment.id}`}
              className="block rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-keep font-black text-[#10213D]">{assignment.title}</p>
                  <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">
                    {assignment.subject ? `${assignment.subject} · ` : ""}배정일 {assignment.assigned_date}
                    {assignment.due_date ? ` · 마감 ${assignment.due_date}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 break-keep rounded-full px-3 py-1.5 text-xs font-black ${statusTone[assignment.submission_status]}`}>
                  {statusLabels[assignment.submission_status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}
