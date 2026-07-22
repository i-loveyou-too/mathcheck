"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

type ImageItem = { id: number; original_filename: string | null; size_bytes: number; width: number | null; height: number | null };
type Submission = {
  id: number;
  student_id: number;
  learning_date: string;
  total_minutes: number;
  subject_breakdown: Record<string, number>;
  memo: string | null;
  status: "draft" | "pending" | "approved" | "rejected" | "cancelled";
  approved_minutes: number | null;
  review_note: string | null;
  images: ImageItem[];
};
type ResponseData = {
  program: { id: number; title: string; student_name: string; daily_study_goal_minutes: number | null };
  stats: { today_approved_minutes: number; week_approved_minutes: number; sprint_approved_minutes: number; achievement_rate: number | null; pending_days: number; rejected_days: number };
  submissions: Submission[];
};

function minutesLabel(minutes: number | null | undefined) {
  if (!minutes) return "0분";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}시간 ${m}분` : `${m}분`;
}

export default function AdminSprintStudyTimePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const programId = Number(params.id);
  const [data, setData] = useState<ResponseData | null>(null);
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [comments, setComments] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async (nextStatus = status) => {
    setData(await apiFetch<ResponseData>(`/admin/sprints/${programId}/study-submissions?status=${nextStatus}`));
  };

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "제출 목록을 불러오지 못했습니다."));
  }, [programId, router]);

  const commentFor = (submission: Submission) => comments[submission.id] ?? submission.review_note ?? "";

  const run = async (submissionId: number, action: () => Promise<unknown>, message: string) => {
    if (busyId !== null) return;
    setBusyId(submissionId);
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

  const approve = (submission: Submission, adjust = false) => {
    const raw = adjust ? window.prompt("승인 시간(분)", String(submission.total_minutes)) : String(submission.total_minutes);
    if (raw === null) return;
    const comment = commentFor(submission).trim();
    void run(submission.id, () => apiFetch(`/admin/sprint-study-submissions/${submission.id}/approve`, {
      method: "POST",
      body: { approved_minutes: Number(raw), comment: comment || null },
    }), "승인했습니다.");
  };

  const reject = (submission: Submission) => {
    const comment = commentFor(submission).trim();
    if (!comment) {
      setError("반려 시 학생에게 남길 코멘트를 입력해주세요.");
      return;
    }
    void run(submission.id, () => apiFetch(`/admin/sprint-study-submissions/${submission.id}/reject`, {
      method: "POST",
      body: { comment },
    }), "반려했습니다.");
  };

  const cancel = (submission: Submission) => {
    const reason = window.prompt("취소 사유");
    if (!reason?.trim()) return;
    void run(submission.id, () => apiFetch(`/admin/sprint-study-submissions/${submission.id}/cancel`, {
      method: "POST",
      body: { comment: reason.trim() },
    }), "취소했습니다.");
  };

  const imageUrl = (imageId: number) => `${API_BASE_URL}/admin/sprint-study-images/${imageId}`;

  if (!data) {
    return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error || "불러오는 중..."}</main>;
  }

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href={`/admin/sprints/${programId}`} className="text-sm font-bold text-[#64748B]">← SPRINT 상세</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#FF6B4A]">STUDY TIME REVIEW</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">공부시간 인증 검수</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">{data.program.title} · {data.program.student_name} · 목표 {minutesLabel(data.program.daily_study_goal_minutes)}</p>
          </div>
          <select value={status} onChange={(event) => { setStatus(event.target.value); void load(event.target.value); }} className="h-11 rounded-2xl border border-[#E5EAF1] bg-white px-4 text-sm font-black text-[#17213B]">
            {["all", "pending", "approved", "rejected", "cancelled", "draft"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-[22px] bg-white p-5 shadow-card"><p className="text-xs font-bold text-[#98A2B3]">오늘 승인</p><p className="mt-2 text-xl font-black text-[#17213B]">{minutesLabel(data.stats.today_approved_minutes)}</p></div>
          <div className="rounded-[22px] bg-white p-5 shadow-card"><p className="text-xs font-bold text-[#98A2B3]">이번 주</p><p className="mt-2 text-xl font-black text-[#17213B]">{minutesLabel(data.stats.week_approved_minutes)}</p></div>
          <div className="rounded-[22px] bg-white p-5 shadow-card"><p className="text-xs font-bold text-[#98A2B3]">SPRINT 누적</p><p className="mt-2 text-xl font-black text-[#17213B]">{minutesLabel(data.stats.sprint_approved_minutes)}</p></div>
          <div className="rounded-[22px] bg-white p-5 shadow-card"><p className="text-xs font-bold text-[#98A2B3]">달성률</p><p className="mt-2 text-xl font-black text-[#17213B]">{data.stats.achievement_rate ?? "-"}%</p></div>
        </section>

        <section className="mt-6 space-y-4">
          {data.submissions.length === 0 && <div className="rounded-[28px] bg-white p-10 text-center text-sm font-bold text-[#98A2B3]">제출 내역이 없습니다.</div>}
          {data.submissions.map((submission) => {
            const comment = commentFor(submission);
            const busy = busyId === submission.id;
            return (
              <article key={submission.id} className="rounded-[28px] bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-[240px] flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-[#17213B]">{submission.learning_date}</h2>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-black ${submission.status === "approved" ? "bg-emerald-50 text-emerald-600" : submission.status === "pending" ? "bg-amber-50 text-amber-700" : submission.status === "rejected" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>{submission.status}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-[#7A859F]">제출 {minutesLabel(submission.total_minutes)} · 승인 {minutesLabel(submission.approved_minutes)}</p>
                    {submission.memo && <p className="mt-2 text-sm text-[#475569]">{submission.memo}</p>}
                    {Object.keys(submission.subject_breakdown ?? {}).length > 0 && <p className="mt-2 text-xs font-bold text-[#98A2B3]">{Object.entries(submission.subject_breakdown).map(([key, value]) => `${key} ${value}분`).join(" · ")}</p>}
                    {submission.review_note && <p className="mt-2 rounded-xl bg-[#F7F8FB] px-3 py-2 text-xs font-bold text-[#64748B]">선생님 코멘트: {submission.review_note}</p>}
                  </div>
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
                      <button disabled={!submission.images.length || submission.status === "approved" || busyId !== null} onClick={() => approve(submission)} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white disabled:opacity-40">{busy ? "처리 중..." : "승인"}</button>
                      <button disabled={!submission.images.length || submission.status === "approved" || busyId !== null} onClick={() => approve(submission, true)} className="rounded-xl bg-[#17213B] px-3 py-2 text-xs font-black text-white disabled:opacity-40">조정승인</button>
                      <button disabled={submission.status === "approved" || busyId !== null || !comment.trim()} onClick={() => reject(submission)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-40">반려</button>
                      <button disabled={busyId !== null} onClick={() => cancel(submission)} className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-600 disabled:opacity-40">취소</button>
                    </div>
                  </div>
                </div>
                {submission.images.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {submission.images.map((image) => <a key={image.id} href={imageUrl(image.id)} target="_blank" rel="noreferrer"><img src={imageUrl(image.id)} alt="study proof" className="aspect-square rounded-2xl object-cover" /></a>)}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
      <AdminBottomNav />
    </main>
  );
}
