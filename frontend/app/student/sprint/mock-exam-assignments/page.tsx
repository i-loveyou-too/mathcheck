"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type Assignment = {
  id: number;
  exam_date: string;
  status: "not_started" | "draft" | "submitted" | "graded" | "confirmed";
  is_started: boolean;
  is_result_open: boolean;
  raw_score: number | null;
  catalog: { id: number; title: string; subject: string; question_count: number; total_score: number };
};

const statusLabels: Record<string, string> = {
  not_started: "응시 전", draft: "작성 중", submitted: "제출 완료", graded: "채점 완료", confirmed: "확정",
};
const statusTone: Record<string, string> = {
  not_started: "text-[#2874E8] bg-[#EAF5FF]", draft: "text-[#2874E8] bg-[#EAF5FF]",
  submitted: "text-[#E18A00] bg-[#FFF6E2]", graded: "text-[#17895E] bg-[#EAF8F1]", confirmed: "text-[#17895E] bg-[#EAF8F1]",
};

export default function StudentMockExamAssignmentsPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) { router.push("/login"); return; }
    void apiFetch<Assignment[]>(`/student/sprint/mock-exam-assignments?student_id=${student.id}`)
      .then(setAssignments)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "모의고사 목록을 불러오지 못했습니다."));
  }, [router]);

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href="/student/sprint" className="break-keep text-sm font-black text-[#2874E8]">← SPRINT 홈</Link>
        <h1 className="mt-4 break-keep text-3xl font-black tracking-[-0.05em] text-[#10213D]">모의고사</h1>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <div className="mt-6 space-y-3">
          {assignments === null && !error && <p className="break-keep text-center text-sm font-bold text-[#8CA0BD]">불러오는 중...</p>}
          {assignments?.length === 0 && (
            <div className="rounded-[24px] bg-white/85 p-8 text-center shadow-[0_12px_28px_rgba(71,104,143,0.12)] ring-1 ring-[#DFEAF6]">
              <p className="break-keep text-sm font-bold text-[#8CA0BD]">배정된 모의고사가 없습니다.</p>
            </div>
          )}
          {assignments?.map((assignment) => (
            <Link
              key={assignment.id}
              href={`/student/sprint/mock-exam-assignments/${assignment.id}`}
              className="block rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="break-keep font-black text-[#10213D]">{assignment.catalog.title}</p>
                    <span className="shrink-0 break-keep rounded-full bg-[#EAF5FF] px-2 py-0.5 text-[10px] font-black text-[#2874E8]">{assignment.catalog.subject}</span>
                  </div>
                  <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">
                    시험일 {assignment.exam_date} · {assignment.catalog.question_count}문항
                    {assignment.is_result_open && assignment.raw_score !== null ? ` · ${assignment.raw_score}점` : ""}
                  </p>
                </div>
                <span className={`shrink-0 break-keep rounded-full px-3 py-1.5 text-xs font-black ${statusTone[assignment.status]}`}>{statusLabels[assignment.status]}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}
