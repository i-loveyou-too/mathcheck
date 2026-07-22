"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type Goal = {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  target_date: string | null;
  completed_at: string | null;
  is_completed: boolean;
  created_by_type: "admin" | "student";
  target_status: "in_progress" | "due_today" | "overdue" | "completed";
};
type SubjectSummary = { subject: string; total: number; completed: number; completion_rate: number };
type GoalsResponse = {
  available: boolean;
  goals: Goal[];
  subjects: SubjectSummary[];
  total: number;
  completed: number;
  completion_rate: number | null;
};

const statusLabels: Record<string, string> = {
  in_progress: "진행 중",
  due_today: "오늘까지",
  overdue: "지연",
  completed: "완료",
};
const statusStyles: Record<string, string> = {
  in_progress: "bg-[#EAF5FF] text-[#2874E8]",
  due_today: "bg-amber-50 text-amber-700",
  overdue: "bg-red-50 text-red-500",
  completed: "bg-emerald-50 text-emerald-600",
};

function GoalCard({ goal, onToggle, busy }: { goal: Goal; onToggle: (goal: Goal) => void; busy: boolean }) {
  return (
    <div className={`flex items-start gap-3 rounded-[20px] bg-white p-4 shadow-sm ring-1 ring-[#DFEAF6] ${goal.is_completed ? "opacity-70" : ""}`}>
      <button
        disabled={busy}
        onClick={() => onToggle(goal)}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black transition ${
          goal.is_completed ? "border-[#2874E8] bg-[#2874E8] text-white" : "border-[#C9DDF8] text-transparent"
        }`}
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        <p className={`font-black text-[#10213D] ${goal.is_completed ? "line-through" : ""}`}>{goal.title}</p>
        {goal.description && <p className="mt-1 text-xs font-semibold text-[#8CA0BD]">{goal.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
          {goal.target_date && <span className="text-[#8CA0BD]">예정 {goal.target_date}</span>}
          {goal.completed_at && <span className="text-emerald-600">완료 {goal.completed_at.slice(0, 10)}</span>}
          <span className={`rounded-full px-2 py-0.5 ${statusStyles[goal.target_status]}`}>{statusLabels[goal.target_status]}</span>
        </div>
      </div>
    </div>
  );
}

export default function SprintProgressPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newGoal, setNewGoal] = useState({ subject: "수학", title: "", description: "", target_date: "" });

  const load = async (id: number) => {
    const result = await apiFetch<GoalsResponse>(`/student/sprint/subject-goals?student_id=${id}`);
    setData(result);
  };

  const addGoal = async () => {
    if (!studentId || !newGoal.title.trim()) return;
    setError("");
    try {
      await apiFetch(`/student/sprint/subject-goals?student_id=${studentId}`, {
        method: "POST",
        body: {
          subject: newGoal.subject,
          title: newGoal.title.trim(),
          description: newGoal.description.trim() || null,
          target_date: newGoal.target_date || null,
        },
      });
      setNewGoal({ subject: "수학", title: "", description: "", target_date: "" });
      await load(studentId);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "목표를 추가하지 못했습니다.");
    }
  };

  const editOwnGoal = async (goal: Goal) => {
    if (!studentId || goal.created_by_type !== "student") return;
    const title = window.prompt("목표 제목", goal.title);
    if (!title?.trim()) return;
    const description = window.prompt("메모", goal.description ?? "") ?? "";
    const targetDate = window.prompt("목표일 YYYY-MM-DD", goal.target_date ?? "") ?? "";
    await apiFetch(`/student/sprint/subject-goals/${goal.id}?student_id=${studentId}`, {
      method: "PATCH",
      body: { title: title.trim(), description: description.trim() || null, target_date: targetDate || null },
    });
    await load(studentId);
  };

  const deleteOwnGoal = async (goal: Goal) => {
    if (!studentId || goal.created_by_type !== "student") return;
    if (!window.confirm("이 목표를 삭제할까요?")) return;
    await apiFetch(`/student/sprint/subject-goals/${goal.id}?student_id=${studentId}`, { method: "DELETE" });
    await load(studentId);
  };

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void load(student.id).catch((reason) => setError(reason instanceof Error ? reason.message : "목표를 불러오지 못했습니다."));
  }, [router]);

  const toggle = async (goal: Goal) => {
    if (!studentId || busyId !== null) return;
    setBusyId(goal.id);
    setError("");
    try {
      const path = goal.is_completed ? "uncomplete" : "complete";
      await apiFetch(`/student/sprint/subject-goals/${goal.id}/${path}`, {
        method: "POST",
        body: { student_id: studentId },
      });
      await load(studentId);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

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
        <h1 className="mt-6 text-3xl font-black tracking-[-0.05em] text-[#10213D]">SPRINT 목표</h1>
        <p className="mt-2 text-sm font-semibold text-[#6E7F99]">이번 SPRINT에서 이루고 싶은 목표를 확인해요.</p>

        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        {data.available && (
          <section className="mt-6 rounded-[24px] bg-white/95 p-5 shadow-card ring-1 ring-[#DFEAF6]">
            <p className="text-sm font-black text-[#2874E8]">내가 세운 목표 추가</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[110px_1fr_130px_auto]">
              <select value={newGoal.subject} onChange={(event) => setNewGoal({ ...newGoal, subject: event.target.value })} className="h-11 rounded-xl border border-[#E5EAF1] px-3 text-sm font-bold text-[#10213D]"><option>국어</option><option>수학</option><option>영어</option><option>탐구</option><option>기타</option></select>
              <input value={newGoal.title} onChange={(event) => setNewGoal({ ...newGoal, title: event.target.value })} placeholder="목표 제목" className="h-11 rounded-xl border border-[#E5EAF1] px-3 text-sm font-bold text-[#10213D]" />
              <input type="date" value={newGoal.target_date} onChange={(event) => setNewGoal({ ...newGoal, target_date: event.target.value })} className="h-11 rounded-xl border border-[#E5EAF1] px-3 text-sm font-bold text-[#10213D]" />
              <button onClick={() => void addGoal()} disabled={!newGoal.title.trim()} className="h-11 rounded-xl bg-[#2874E8] px-4 text-sm font-black text-white disabled:opacity-40">추가</button>
            </div>
            <input value={newGoal.description} onChange={(event) => setNewGoal({ ...newGoal, description: event.target.value })} placeholder="메모 선택" className="mt-2 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 text-sm font-bold text-[#10213D]" />
          </section>
        )}

        {!data.available || data.total === 0 ? (
          <section className="mt-8 rounded-[28px] bg-white/95 p-7 text-center shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF5FF] text-2xl font-black text-[#2E7BEA]">G</div>
            <h2 className="mt-5 text-xl font-black text-[#10213D]">등록된 목표가 없어요</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#6E7F99]">관리자가 목표를 등록하면 이곳에 표시됩니다.</p>
          </section>
        ) : (
          <>
            <section className="mt-6 rounded-[24px] bg-white/95 p-5 shadow-card ring-1 ring-[#DFEAF6]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#6E7F99]">전체 완료</p>
                  <p className="mt-1 text-2xl font-black text-[#10213D]">{data.completed} / {data.total}</p>
                </div>
                <p className="text-3xl font-black text-[#2874E8]">{data.completion_rate}%</p>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-[#F0F2F8]"><div className="h-full rounded-full bg-[#2874E8] transition-all" style={{ width: `${data.completion_rate ?? 0}%` }} /></div>
            </section>

            {data.subjects.map((subjectSummary) => (
              <section key={subjectSummary.subject} className="mt-8">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-black text-[#10213D]">{subjectSummary.subject}</h2>
                  <p className="text-sm font-bold text-[#6E7F99]">{subjectSummary.completed} / {subjectSummary.total} · {subjectSummary.completion_rate}%</p>
                </div>
                <div className="space-y-2">
                  {data.goals.filter((goal) => goal.subject === subjectSummary.subject).map((goal) => (
                    <div key={goal.id} className="space-y-2">
                      <GoalCard goal={goal} onToggle={toggle} busy={busyId === goal.id} />
                      {goal.created_by_type === "student" && (
                        <div className="flex justify-end gap-2 px-1">
                          <button
                            type="button"
                            onClick={() => editOwnGoal(goal)}
                            className="rounded-full border border-[#CFE0F5] px-3 py-1 text-xs font-black text-[#2874E8]"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteOwnGoal(goal)}
                            className="rounded-full border border-[#F4B8B8] px-3 py-1 text-xs font-black text-[#EF4444]"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </ScreenShell>
  );
}
