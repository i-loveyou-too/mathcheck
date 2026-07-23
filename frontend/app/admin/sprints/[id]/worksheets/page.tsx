"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);

type SubmissionFile = { id: number; file_kind: "pdf" | "image"; original_filename: string | null; admin_url: string };
type Submission = {
  id: number;
  submission_method: string | null;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  files: SubmissionFile[];
};
type Assignment = {
  id: number;
  title: string;
  subject: string | null;
  assigned_date: string;
  due_date: string | null;
  is_active: boolean;
  original_filename: string | null;
  admin_file_url: string;
  submission_status: string;
  submission: Submission | null;
};

const statusLabels: Record<string, string> = { not_submitted: "제출 전", draft: "작성 중", pending: "검토 대기", approved: "승인", rejected: "반려" };

export default function AdminSprintWorksheetsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const programId = Number(params.id);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", subject: "수학", assigned_date: today, due_date: "" });
  const [file, setFile] = useState<File | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  const load = async () => {
    setAssignments(await apiFetch<Assignment[]>(`/admin/sprints/${programId}/worksheets`));
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다."));
  }, [programId, router]);

  const createWorksheet = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("PDF 파일을 선택하세요.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.append("title", form.title);
      if (form.subject) body.append("subject", form.subject);
      body.append("assigned_date", form.assigned_date);
      if (form.due_date) body.append("due_date", form.due_date);
      body.append("file", file);
      const response = await fetch(`${API_BASE_URL}/admin/sprints/${programId}/worksheets`, {
        method: "POST",
        body,
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "문제지를 배정하지 못했습니다.");
      }
      setForm({ title: "", subject: "수학", assigned_date: today, due_date: "" });
      setFile(null);
      await load();
      setNotice("문제지를 배정했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문제지를 배정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (submissionId: number) => {
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/sprint-worksheet-submissions/${submissionId}/approve`, {
        method: "POST",
        body: { review_note: reviewNotes[submissionId] || null },
      });
      await load();
      setNotice("제출을 승인했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "승인하지 못했습니다.");
    }
  };

  const reject = async (submissionId: number) => {
    const note = reviewNotes[submissionId]?.trim();
    if (!note) {
      setError("반려 사유를 입력하세요.");
      return;
    }
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/sprint-worksheet-submissions/${submissionId}/reject`, {
        method: "POST",
        body: { review_note: note },
      });
      await load();
      setNotice("제출을 반려했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "반려하지 못했습니다.");
    }
  };

  const remove = async (assignmentId: number) => {
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/sprint-worksheets/${assignmentId}`, { method: "DELETE" });
      await load();
      setNotice("배정을 삭제했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "삭제하지 못했습니다. 학생 제출 파일이 있으면 비활성화만 가능합니다.");
    }
  };

  const toggleActive = async (assignment: Assignment) => {
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/sprint-worksheets/${assignment.id}`, { method: "PATCH", body: { is_active: !assignment.is_active } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "변경하지 못했습니다.");
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href={`/admin/sprints/${programId}`} className="text-sm font-bold text-[#64748B]">← SPRINT 상세</Link>
        <div className="mt-4">
          <p className="text-sm font-bold text-[#FF6B4A]">WORKSHEETS</p>
          <h1 className="mt-1 text-3xl font-black text-[#17213B]">문제지 배정 및 제출 검수</h1>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <div className="mt-6 grid gap-5 lg:grid-cols-[380px_1fr]">
          <form onSubmit={createWorksheet} className="h-fit rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">문제지 배정</h2>
            <div className="mt-4 space-y-3 text-xs font-bold text-[#7A859F]">
              <label className="block">제목<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">과목<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">배정일<input type="date" required value={form.assigned_date} onChange={(e) => setForm({ ...form, assigned_date: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">제출 마감일 (선택)<input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">문제지 PDF<input required type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" /></label>
            </div>
            <button disabled={saving} className="mt-5 h-12 w-full rounded-2xl bg-[#5C63FF] text-sm font-black text-white disabled:opacity-50">{saving ? "배정 중..." : "문제지 배정하기"}</button>
          </form>

          <section className="space-y-4">
            {assignments.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">배정된 문제지가 없습니다.</div>}
            {assignments.map((assignment) => (
              <article key={assignment.id} className="rounded-[24px] bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-[#17213B]">{assignment.title}</h2>
                      {!assignment.is_active && <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">비활성</span>}
                    </div>
                    <p className="mt-1 text-sm font-bold text-[#7A859F]">
                      {assignment.subject ? `${assignment.subject} · ` : ""}배정일 {assignment.assigned_date}{assignment.due_date ? ` · 마감 ${assignment.due_date}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`${API_BASE_URL}${assignment.admin_file_url}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#F0F2F8] px-3 py-2 text-xs font-black text-[#17213B]">문제지 PDF</a>
                    <button onClick={() => void toggleActive(assignment)} className="rounded-xl bg-[#F0F2F8] px-3 py-2 text-xs font-black text-[#17213B]">{assignment.is_active ? "비활성화" : "활성화"}</button>
                    <button onClick={() => void remove(assignment.id)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-500">삭제</button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[#EEF1F7] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-[#17213B]">제출 상태</span>
                    <span className="rounded-md bg-[#F1F3FF] px-2 py-0.5 text-[10px] font-black text-[#5C63FF]">{statusLabels[assignment.submission_status] ?? assignment.submission_status}</span>
                  </div>
                  {assignment.submission && assignment.submission.files.length > 0 && (
                    <>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {assignment.submission.files.map((submissionFile) => (
                          <a key={submissionFile.id} href={`${API_BASE_URL}${submissionFile.admin_url}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">
                            {submissionFile.file_kind === "pdf" ? "제출 PDF" : "사진"}{submissionFile.original_filename ? ` · ${submissionFile.original_filename}` : ""}
                          </a>
                        ))}
                      </div>
                      {assignment.submission.status === "pending" && (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={reviewNotes[assignment.submission.id] ?? ""}
                            onChange={(e) => setReviewNotes({ ...reviewNotes, [assignment.submission!.id]: e.target.value })}
                            rows={2}
                            placeholder="반려 시 사유 입력 (승인 시 선택)"
                            className="w-full resize-none rounded-xl bg-[#F5F6FA] p-2 text-xs text-[#17213B]"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => void approve(assignment.submission!.id)} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-white">승인</button>
                            <button onClick={() => void reject(assignment.submission!.id)} className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-black text-white">반려</button>
                          </div>
                        </div>
                      )}
                      {assignment.submission.review_note && assignment.submission.status !== "pending" && (
                        <p className="mt-2 text-xs font-bold text-[#7A859F]">코멘트: {assignment.submission.review_note}</p>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
