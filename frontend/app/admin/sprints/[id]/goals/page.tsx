"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const SUBJECTS = ["국어", "수학", "영어", "탐구", "기타"] as const;

type Goal = {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  target_date: string | null;
  completed_at: string | null;
  is_completed: boolean;
  order_index: number;
  target_status: string;
};
type SubjectSummary = { subject: string; total: number; completed: number; completion_rate: number };
type GoalsResponse = { goals: Goal[]; subjects: SubjectSummary[] };

const statusLabels: Record<string, string> = { in_progress: "진행 중", due_today: "오늘까지", overdue: "지연", completed: "완료" };

export default function AdminSprintGoalsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const programId = Number(params.id);
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject: "수학", title: "", description: "", target_date: "" });

  const load = async () => {
    setData(await apiFetch<GoalsResponse>(`/admin/sprints/${programId}/subject-goals`));
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "목표를 불러오지 못했습니다."));
  }, [programId, router]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(""); setNotice("");
    try { await action(); await load(); setNotice(message); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "요청을 처리하지 못했습니다."); }
  };

  const createGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await run(() => apiFetch(`/admin/sprints/${programId}/subject-goals`, {
        method: "POST",
        body: {
          subject: form.subject, title: form.title,
          description: form.description || null,
          target_date: form.target_date || null,
        },
      }), "목표를 추가했습니다.");
      setForm({ subject: form.subject, title: "", description: "", target_date: "" });
    } finally {
      setSaving(false);
    }
  };

  const toggleCompleted = (goal: Goal) =>
    run(() => apiFetch(`/admin/sprints/${programId}/subject-goals/${goal.id}`, {
      method: "PATCH", body: { is_completed: !goal.is_completed },
    }), "완료 상태를 변경했습니다.");

  const move = (goal: Goal, direction: -1 | 1) =>
    run(() => apiFetch(`/admin/sprints/${programId}/subject-goals/${goal.id}`, {
      method: "PATCH", body: { order_index: goal.order_index + direction },
    }), "순서를 변경했습니다.");

  const editGoal = (goal: Goal) => {
    const title = window.prompt("목표명", goal.title);
    if (!title) return;
    const description = window.prompt("메모(선택)", goal.description ?? "") ?? goal.description ?? "";
    const targetDate = window.prompt("완료 예정일 (YYYY-MM-DD, 비우면 없음)", goal.target_date ?? "") ?? "";
    void run(() => apiFetch(`/admin/sprints/${programId}/subject-goals/${goal.id}`, {
      method: "PATCH",
      body: { title, description: description || null, target_date: targetDate || null },
    }), "목표를 수정했습니다.");
  };

  const deleteGoal = (goal: Goal) => {
    if (!window.confirm(goal.is_completed ? "완료된 목표입니다. 비활성화할까요? (기록은 보존됩니다)" : "목표를 삭제할까요?")) return;
    void run(() => apiFetch(`/admin/sprints/${programId}/subject-goals/${goal.id}`, { method: "DELETE" }), "처리했습니다.");
  };

  if (!data) return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error || "불러오는 중..."}</main>;

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href={`/admin/sprints/${programId}`} className="text-sm font-bold text-[#64748B]">← SPRINT 상세</Link>
        <div className="mt-4">
          <p className="text-sm font-bold text-[#FF6B4A]">SUBJECT GOALS</p>
          <h1 className="mt-1 text-3xl font-black text-[#17213B]">과목별 목표</h1>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <div className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
          <form onSubmit={createGoal} className="h-fit rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">목표 추가</h2>
            <div className="mt-4 space-y-3 text-xs font-bold text-[#7A859F]">
              <label className="block">과목<select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]">{SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label className="block">목표명<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" placeholder="예: EBS 수특 문학 완강" /></label>
              <label className="block">메모 (선택)<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">완료 예정일 (선택)<input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            </div>
            <button disabled={saving} className="mt-5 h-12 w-full rounded-2xl bg-[#5C63FF] text-sm font-black text-white disabled:opacity-50">{saving ? "추가 중..." : "목표 추가"}</button>
          </form>

          <section className="space-y-5">
            {data.subjects.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">등록된 목표가 없습니다.</div>}
            {data.subjects.map((subjectSummary) => (
              <article key={subjectSummary.subject} className="rounded-[24px] bg-white p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black text-[#17213B]">{subjectSummary.subject}</h2>
                  <span className="text-sm font-bold text-[#7A859F]">{subjectSummary.completed} / {subjectSummary.total} · {subjectSummary.completion_rate}%</span>
                </div>
                <div className="mt-4 space-y-2">
                  {data.goals.filter((goal) => goal.subject === subjectSummary.subject).map((goal) => (
                    <div key={goal.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${goal.is_completed ? "border-emerald-100 bg-emerald-50/40" : "border-[#EEF1F7]"}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-[#17213B]">{goal.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${goal.is_completed ? "bg-emerald-100 text-emerald-700" : goal.target_status === "overdue" ? "bg-red-50 text-red-500" : "bg-[#F1F3FF] text-[#5C63FF]"}`}>{statusLabels[goal.target_status]}</span>
                        </div>
                        <p className="mt-0.5 text-xs font-bold text-[#98A2B3]">
                          {goal.target_date && `예정 ${goal.target_date}`}{goal.completed_at && ` · 완료 ${goal.completed_at.slice(0, 10)}`}{goal.description && ` · ${goal.description}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => move(goal, -1)} className="rounded-lg bg-[#F0F2F8] px-2 py-1.5 text-xs font-bold text-[#17213B]">↑</button>
                        <button onClick={() => move(goal, 1)} className="rounded-lg bg-[#F0F2F8] px-2 py-1.5 text-xs font-bold text-[#17213B]">↓</button>
                        <button onClick={() => toggleCompleted(goal)} className={`rounded-lg px-2.5 py-1.5 text-xs font-black ${goal.is_completed ? "bg-gray-100 text-gray-600" : "bg-emerald-500 text-white"}`}>{goal.is_completed ? "완료 취소" : "완료 처리"}</button>
                        <button onClick={() => editGoal(goal)} className="rounded-lg bg-[#EAF5FF] px-2.5 py-1.5 text-xs font-black text-[#2874E8]">수정</button>
                        <button onClick={() => deleteGoal(goal)} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-black text-red-600">삭제</button>
                      </div>
                    </div>
                  ))}
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
