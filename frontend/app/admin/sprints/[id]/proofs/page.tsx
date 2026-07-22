"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

type ImageItem = { id: number };
type Submission = {
  id: number;
  workflow_status: string;
  timing_status: string;
  submitted_at: string | null;
  review_note: string | null;
  memo: string | null;
  images: ImageItem[];
};
type ProofItem = {
  learning_date: string;
  proof_type: "planner" | "seat_check";
  deadline_time: string | null;
  workflow_status: string;
  timing_status: string;
  submission: Submission | null;
};
type ResponseData = {
  program: {
    id: number; title: string; student_name: string;
    planner_deadline_time: string | null; seat_check_deadline_time: string | null;
    planner_strike_on_late: boolean; planner_strike_on_missing: boolean;
    seat_check_strike_on_late: boolean; seat_check_strike_on_missing: boolean;
  };
  pending_count: number;
  missing_count: number;
  items: ProofItem[];
};

const proofLabels = { planner: "플래너", seat_check: "착석" };
const workflowLabels: Record<string, string> = { all: "전체 상태", draft: "임시저장", pending: "검토 대기", approved: "승인", rejected: "반려", cancelled: "취소", missing: "미제출" };

export default function AdminSprintProofsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const programId = Number(params.id);
  const [data, setData] = useState<ResponseData | null>(null);
  const [proofType, setProofType] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<number | "judge" | "settings" | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});

  const buildQuery = (overrides: { proofType?: string; workflowFilter?: string; dateFilter?: string } = {}) => {
    const type = overrides.proofType ?? proofType;
    const workflow = overrides.workflowFilter ?? workflowFilter;
    const dateValue = overrides.dateFilter ?? dateFilter;
    const query = new URLSearchParams({ proof_type: type });
    if (workflow !== "all") query.set("workflow_status", workflow);
    if (dateValue) query.set("learning_date", dateValue);
    return query.toString();
  };

  const load = async (overrides: { proofType?: string; workflowFilter?: string; dateFilter?: string } = {}) => {
    setData(await apiFetch<ResponseData>(`/admin/sprints/${programId}/daily-proofs?${buildQuery(overrides)}`));
  };

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "인증 목록을 불러오지 못했습니다."));
  }, [programId, router]);

  const commentFor = (submission: Submission) => comments[submission.id] ?? submission.review_note ?? "";

  const run = async (id: number | "judge" | "settings", action: () => Promise<unknown>, message: string) => {
    if (busyId !== null) return;
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const approve = (submission: Submission, override = false) => {
    const body: Record<string, unknown> = { comment: commentFor(submission).trim() || null };
    if (override) {
      const timing = window.prompt("판정 override: on_time / late", submission.timing_status);
      if (timing !== "on_time" && timing !== "late") return;
      const reason = window.prompt("override 사유");
      if (!reason?.trim()) return;
      body.timing_override = timing;
      body.timing_override_reason = reason.trim();
    }
    void run(submission.id, () => apiFetch(`/admin/sprint-daily-proofs/${submission.id}/approve`, { method: "POST", body }), "승인했습니다.");
  };

  const reject = (submission: Submission) => {
    const comment = commentFor(submission).trim();
    if (!comment) {
      setError("반려 시 학생에게 남길 코멘트를 입력해주세요.");
      return;
    }
    void run(submission.id, () => apiFetch(`/admin/sprint-daily-proofs/${submission.id}/reject`, { method: "POST", body: { comment } }), "반려했습니다.");
  };

  const cancelApproval = (submission: Submission) => {
    const reason = window.prompt("취소 사유를 입력하세요.");
    if (!reason?.trim()) return;
    void run(submission.id, () => apiFetch(`/admin/sprint-daily-proofs/${submission.id}/cancel`, { method: "POST", body: { comment: reason.trim() } }), "승인을 취소했습니다.");
  };

  const judgeMissing = () => {
    const learningDate = window.prompt("미제출 판정 학습일(YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!learningDate) return;
    void run("judge", () => apiFetch(`/admin/sprints/${programId}/daily-proofs/judge-missing`, {
      method: "POST",
      body: { learning_date: learningDate, proof_type: proofType === "all" ? "all" : proofType },
    }), "미제출 판정을 실행했습니다.");
  };

  const patchProgram = (body: Record<string, unknown>) =>
    run("settings", () => apiFetch(`/admin/sprints/${programId}`, { method: "PATCH", body }), "설정을 저장했습니다.");

  const imageUrl = (id: number) => `${API_BASE_URL}/admin/sprint-proof-images/${id}`;

  if (!data) return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error || "불러오는 중..."}</main>;

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href={`/admin/sprints/${programId}`} className="text-sm font-bold text-[#64748B]">← SPRINT 상세</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#FF6B4A]">DAILY PROOFS</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">플래너·착석 인증</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">{data.program.title} · {data.program.student_name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={proofType} onChange={(event) => { setProofType(event.target.value); void load({ proofType: event.target.value }); }} className="h-11 rounded-2xl border border-[#E5EAF1] bg-white px-4 text-sm font-black text-[#17213B]">
              <option value="all">전체 유형</option>
              <option value="planner">플래너</option>
              <option value="seat_check">착석</option>
            </select>
            <select value={workflowFilter} onChange={(event) => { setWorkflowFilter(event.target.value); void load({ workflowFilter: event.target.value }); }} className="h-11 rounded-2xl border border-[#E5EAF1] bg-white px-4 text-sm font-black text-[#17213B]">
              {Object.entries(workflowLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="date" value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); void load({ dateFilter: event.target.value }); }} className="h-11 rounded-2xl border border-[#E5EAF1] bg-white px-3 text-sm font-black text-[#17213B]" />
            {dateFilter && <button onClick={() => { setDateFilter(""); void load({ dateFilter: "" }); }} className="h-11 rounded-2xl bg-[#F0F2F8] px-3 text-sm font-black text-[#64748B]">날짜 초기화</button>}
            <button disabled={busyId !== null} onClick={judgeMissing} className="h-11 rounded-2xl bg-[#17213B] px-4 text-sm font-black text-white disabled:opacity-50">{busyId === "judge" ? "처리 중..." : "미제출 판정"}</button>
          </div>
        </div>
        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] bg-white p-5 shadow-card"><p className="text-xs font-bold text-[#98A2B3]">검토 대기</p><p className="mt-2 text-2xl font-black text-[#17213B]">{data.pending_count}</p></div>
          <div className="rounded-[22px] bg-white p-5 shadow-card"><p className="text-xs font-bold text-[#98A2B3]">미제출</p><p className="mt-2 text-2xl font-black text-[#17213B]">{data.missing_count}</p></div>
        </section>

        <section className="mt-6 rounded-[24px] bg-white p-5 shadow-card">
          <h2 className="text-lg font-black text-[#17213B]">학생별 제출 설정</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold text-[#7A859F]">
            <label>플래너 마감<input type="time" defaultValue={data.program.planner_deadline_time ?? ""} onBlur={(event) => event.target.value !== (data.program.planner_deadline_time ?? "") && void patchProgram({ planner_deadline_time: event.target.value || null })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            <label>착석 마감<input type="time" defaultValue={data.program.seat_check_deadline_time ?? ""} onBlur={(event) => event.target.value !== (data.program.seat_check_deadline_time ?? "") && void patchProgram({ seat_check_deadline_time: event.target.value || null })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            <button onClick={() => void patchProgram({ planner_strike_on_late: !data.program.planner_strike_on_late })} className={`rounded-xl px-3 py-2.5 text-xs font-black ${data.program.planner_strike_on_late ? "bg-[#5C63FF] text-white" : "bg-[#F0F2F8] text-[#98A2B3]"}`}>플래너 지각</button>
            <button onClick={() => void patchProgram({ planner_strike_on_missing: !data.program.planner_strike_on_missing })} className={`rounded-xl px-3 py-2.5 text-xs font-black ${data.program.planner_strike_on_missing ? "bg-[#5C63FF] text-white" : "bg-[#F0F2F8] text-[#98A2B3]"}`}>플래너 미제출</button>
            <button onClick={() => void patchProgram({ seat_check_strike_on_late: !data.program.seat_check_strike_on_late })} className={`rounded-xl px-3 py-2.5 text-xs font-black ${data.program.seat_check_strike_on_late ? "bg-[#5C63FF] text-white" : "bg-[#F0F2F8] text-[#98A2B3]"}`}>착석 지각</button>
            <button onClick={() => void patchProgram({ seat_check_strike_on_missing: !data.program.seat_check_strike_on_missing })} className={`rounded-xl px-3 py-2.5 text-xs font-black ${data.program.seat_check_strike_on_missing ? "bg-[#5C63FF] text-white" : "bg-[#F0F2F8] text-[#98A2B3]"}`}>착석 미제출</button>
          </div>
        </section>

        <section className="mt-6 space-y-3">
          {data.items.length === 0 && <div className="rounded-[22px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">조건에 맞는 제출이 없습니다.</div>}
          {data.items.map((item) => {
            const submission = item.submission;
            const comment = submission ? commentFor(submission) : "";
            const submissionBusy = submission ? busyId === submission.id : false;
            return (
              <article key={`${item.learning_date}-${item.proof_type}`} className="rounded-[24px] bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-[240px] flex-1">
                    <h2 className="text-lg font-black text-[#17213B]">{item.learning_date} · {proofLabels[item.proof_type]}</h2>
                    <p className="mt-1 text-sm font-bold text-[#7A859F]">마감 {item.deadline_time ?? "-"} · {workflowLabels[item.workflow_status] ?? item.workflow_status} · {item.timing_status}</p>
                    {submission?.submitted_at && <p className="mt-1 text-xs font-bold text-[#98A2B3]">제출 {new Date(submission.submitted_at).toLocaleString("ko-KR")}</p>}
                    {submission?.memo && <p className="mt-2 text-sm font-semibold text-[#475569]">{submission.memo}</p>}
                    {submission?.review_note && <p className="mt-2 rounded-xl bg-[#F7F8FB] px-3 py-2 text-xs font-bold text-[#64748B]">선생님 코멘트: {submission.review_note}</p>}
                  </div>
                  {submission && (
                    <div className="w-full max-w-sm space-y-2">
                      <textarea
                        value={comment}
                        onChange={(event) => setComments((current) => ({ ...current, [submission.id]: event.target.value }))}
                        maxLength={500}
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-[#E5EAF1] bg-[#F8FAFC] p-3 text-sm font-semibold text-[#17213B] outline-none focus:border-[#5C63FF]"
                        placeholder="학생에게 전달할 내용을 입력해주세요."
                      />
                      <div className="flex flex-wrap gap-2">
                        {submission.workflow_status === "approved" ? (
                          <button disabled={submissionBusy || busyId !== null} onClick={() => cancelApproval(submission)} className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-700 disabled:opacity-40">{submissionBusy ? "처리 중..." : "승인취소"}</button>
                        ) : (
                          <button disabled={!submission.images.length || submissionBusy || busyId !== null} onClick={() => approve(submission)} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white disabled:opacity-40">{submissionBusy ? "처리 중..." : "승인"}</button>
                        )}
                        <button disabled={!submission.images.length || submissionBusy || busyId !== null} onClick={() => approve(submission, true)} className="rounded-xl bg-[#17213B] px-3 py-2 text-xs font-black text-white disabled:opacity-40">판정변경</button>
                        <button disabled={submission.workflow_status === "approved" || submissionBusy || busyId !== null || !comment.trim()} onClick={() => reject(submission)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-40">반려</button>
                      </div>
                    </div>
                  )}
                </div>
                {submission?.images.length ? (
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {submission.images.map((image) => <a key={image.id} href={imageUrl(image.id)} target="_blank" rel="noreferrer"><img src={imageUrl(image.id)} alt="proof" className="aspect-square rounded-2xl object-cover" /></a>)}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
      <AdminBottomNav />
    </main>
  );
}
