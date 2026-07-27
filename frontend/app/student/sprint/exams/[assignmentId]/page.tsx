"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { ApiError, apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type AttemptSummary = {
  id: number;
  attempt_no: number;
  status: "started" | "submitted" | "scored" | "voided";
  started_at: string | null;
  submitted_at: string | null;
  scored_at: string | null;
};

type AssignmentDetail = {
  assignment: {
    id: number;
    status: string;
    computed_status: "available" | "upcoming" | "completed" | "expired";
    available_from: string | null;
    due_at: string | null;
    assigned_at: string | null;
    attempt_count: number;
    base_attempt_count: number;
    attempt_limit: number;
    can_start: boolean;
    needs_retake_approval: boolean;
    available_retake_approval_count: number;
  };
  exam: { id: number; title: string; exam_date: string | null };
  papers: Array<{ assignment_paper_id: number; subject_code: string; subject_name: string; score_group_name: string }>;
  active_attempt: AttemptSummary | null;
  latest_attempt: AttemptSummary | null;
  attempts: AttemptSummary[];
};

type StartResponse = {
  attempt: AttemptSummary;
  created: boolean;
  start_type: "base" | "retake_approval";
};

const assignmentStatusLabels: Record<string, string> = {
  available: "응시 가능",
  upcoming: "응시 예정",
  completed: "제출 완료",
  expired: "응시 마감",
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function StateCard({ title, desc, tone }: { title: string; desc: string; tone: "blue" | "green" | "orange" | "red" }) {
  const classes = {
    blue: "bg-[#EAF5FF] text-[#2874E8]",
    green: "bg-[#EAF8F1] text-[#17895E]",
    orange: "bg-[#FFF6E2] text-[#D68B00]",
    red: "bg-[#FFF0F0] text-[#E25050]",
  };
  return (
    <div className="rounded-[24px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
      <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ${classes[tone]}`}>{title}</span>
      <p className="mt-3 break-keep text-sm font-bold leading-6 text-[#6E7F99]">{desc}</p>
    </div>
  );
}

export default function StudentSprintExamAssignmentDetailPage() {
  const router = useRouter();
  const params = useParams<{ assignmentId: string }>();
  const assignmentId = Number(params.assignmentId);
  const [data, setData] = useState<AssignmentDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const result = await apiFetch<AssignmentDetail>(`/student/sprint-exam-v2/assignments/${assignmentId}`);
    setData(result);
  };

  useEffect(() => {
    if (!getStudent()) {
      router.push("/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "시험 정보를 불러오지 못했습니다."));
  }, [router, assignmentId]);

  const totalQuestions = useMemo(() => data?.papers.length ?? 0, [data]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const started = await apiFetch<StartResponse>(`/student/sprint-exam-v2/assignments/${assignmentId}/start`, { method: "POST" });
      router.push(`/student/sprint/exams/attempts/${started.attempt.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "시험을 시작하지 못했습니다.");
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

  const latest = data.latest_attempt;
  const active = data.active_attempt;
  const canStartAfterVoided = latest?.status === "voided" && data.assignment.can_start;

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <div className="flex items-center justify-between">
          <Link href="/student/sprint/exams" className="break-keep text-sm font-black text-[#2874E8]">← 모의고사 목록</Link>
          <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-black text-[#2874E8] ring-1 ring-[#DCEBFA]">
            {assignmentStatusLabels[data.assignment.computed_status] ?? data.assignment.computed_status}
          </span>
        </div>

        <section className="mt-5 rounded-[28px] bg-white/95 p-6 shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-black tracking-[0.18em] text-[#2874E8]">EXAM DETAIL</p>
              <h1 className="mt-2 break-keep text-2xl font-black tracking-[-0.04em] text-[#10213D]">{data.exam.title}</h1>
            </div>
            {data.exam.exam_date && <span className="shrink-0 rounded-2xl bg-[#EAF5FF] px-3 py-2 text-xs font-black text-[#2874E8]">{data.exam.exam_date}</span>}
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="font-bold text-[#6E7F99]">응시 시작</dt><dd className="text-right font-black text-[#10213D]">{formatDateTime(data.assignment.available_from)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-bold text-[#6E7F99]">제출 마감</dt><dd className="text-right font-black text-[#10213D]">{formatDateTime(data.assignment.due_at)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-bold text-[#6E7F99]">과목</dt><dd className="text-right font-black text-[#10213D]">{data.papers.length}개</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-bold text-[#6E7F99]">응시 횟수</dt><dd className="text-right font-black text-[#10213D]">{data.assignment.base_attempt_count} / {data.assignment.attempt_limit}</dd></div>
          </dl>
        </section>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <section className="mt-4 rounded-[24px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
          <h2 className="break-keep text-lg font-black text-[#10213D]">배정 과목</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.papers.map((paper) => (
              <span key={paper.assignment_paper_id} className="rounded-full bg-[#F2F7FF] px-3 py-2 text-xs font-black text-[#2874E8]">{paper.subject_name}</span>
            ))}
          </div>
          <p className="mt-4 break-keep rounded-2xl bg-[#FFF8E8] px-4 py-3 text-xs font-bold leading-5 text-[#9A6500]">시험지는 종이 또는 별도 자료로 제공됩니다. 앱에서는 문항 번호별 답안만 직접 체크합니다.</p>
        </section>

        <div className="mt-4 space-y-3">
          {active && (
            <StateCard title="응시 중" desc={`#${active.attempt_no} 응시가 진행 중입니다. 저장된 답안을 이어서 입력할 수 있습니다.`} tone="blue" />
          )}
          {!active && latest?.status === "submitted" && (
            <StateCard title="제출 완료" desc="답안 제출이 완료되었습니다. 선생님의 채점과 결과 공개를 기다려주세요." tone="orange" />
          )}
          {!active && latest?.status === "scored" && (
            <StateCard title="채점 완료" desc="결과가 공개되었는지 확인할 수 있습니다. 공개 전이면 대기 화면이 표시됩니다." tone="green" />
          )}
          {!active && latest?.status === "voided" && (
            <StateCard title="무효 처리" desc={canStartAfterVoided ? "새 응시가 가능합니다." : "새 응시는 관리자 승인 또는 배정 정책이 필요합니다."} tone="red" />
          )}
        </div>

        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 px-5 md:max-w-[760px] lg:max-w-[1180px] lg:px-6">
          {active ? (
            <Link href={`/student/sprint/exams/attempts/${active.id}`} className="block h-14 rounded-[20px] bg-[#2874E8] text-center text-base font-black leading-[3.5rem] text-white shadow-[0_16px_35px_rgba(40,116,232,0.28)]">OMR 이어서 입력</Link>
          ) : latest?.status === "submitted" ? (
            <Link href={`/student/sprint/exams/attempts/${latest.id}/result`} className="block h-14 rounded-[20px] bg-[#10213D] text-center text-base font-black leading-[3.5rem] text-white shadow-[0_16px_35px_rgba(16,33,61,0.24)]">제출 상태 확인</Link>
          ) : latest?.status === "scored" ? (
            <Link href={`/student/sprint/exams/attempts/${latest.id}/result`} className="block h-14 rounded-[20px] bg-[#2874E8] text-center text-base font-black leading-[3.5rem] text-white shadow-[0_16px_35px_rgba(40,116,232,0.28)]">결과 확인</Link>
          ) : data.assignment.can_start || canStartAfterVoided ? (
            <button onClick={() => void start()} disabled={busy || totalQuestions === 0} className="h-14 w-full rounded-[20px] bg-[#2874E8] text-base font-black text-white shadow-[0_16px_35px_rgba(40,116,232,0.28)] disabled:opacity-45">{busy ? "준비 중..." : "시험 시작하기"}</button>
          ) : (
            <button disabled className="h-14 w-full rounded-[20px] bg-[#B8C4D6] text-base font-black text-white">응시할 수 없습니다</button>
          )}
        </div>
      </div>
    </ScreenShell>
  );
}
