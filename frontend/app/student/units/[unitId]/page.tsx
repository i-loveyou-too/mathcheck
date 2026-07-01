"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { Header } from "@/components/header";
import { ProgressBar } from "@/components/progress-bar";
import { ScreenShell } from "@/components/screen-shell";
import { TaskCheckbox } from "@/components/task-checkbox";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { ProgressCheckResponse, StudentSummary, TaskWithProgress } from "@/lib/types";

export default function UnitChecklistPage() {
  const params = useParams<{ unitId: string }>();
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskWithProgress[]>([]);
  const [unitName, setUnitName] = useState("단원");
  const [progress, setProgress] = useState(0);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    setStudentId(student.id);

    const load = async () => {
      const [taskData, summary] = await Promise.all([
        apiFetch<TaskWithProgress[]>(`/units/${params.unitId}/tasks?student_id=${student.id}`),
        apiFetch<StudentSummary>(`/students/${student.id}/summary`),
      ]);

      setTasks(taskData);

      const unit = summary.subjects
        .flatMap((subject) => subject.units)
        .find((item) => item.id === Number(params.unitId));

      if (unit) {
        setUnitName(unit.name);
        setProgress(unit.progress_percentage);
      }
    };

    void load();
  }, [params.unitId, router]);

  const completedCount = useMemo(() => tasks.filter((task) => task.is_done).length, [tasks]);

  const handleToggle = async (taskId: number) => {
    if (!studentId) return;

    const current = tasks.find((task) => task.id === taskId);
    if (!current) return;

    const nextValue = !current.is_done;

    setSavingTaskId(taskId);
    setTasks((previous) =>
      previous.map((task) => (task.id === taskId ? { ...task, is_done: nextValue } : task))
    );

    try {
      const updated = await apiFetch<ProgressCheckResponse>("/progress/check", {
        method: "POST",
        body: {
          student_id: studentId,
          task_id: taskId,
          is_done: nextValue,
        },
      });

      setTasks((previous) =>
        previous.map((task) =>
          task.id === taskId
            ? { ...task, is_done: updated.is_done, done_at: updated.done_at }
            : task
        )
      );
    } catch {
      setTasks((previous) =>
        previous.map((task) => (task.id === taskId ? { ...task, is_done: current.is_done } : task))
      );
    } finally {
      setSavingTaskId(null);
    }
  };

  useEffect(() => {
    if (tasks.length === 0) {
      setProgress(0);
      return;
    }
    setProgress((completedCount / tasks.length) * 100);
  }, [completedCount, tasks.length]);

  const progressRounded = Math.round(progress);
  const isAllDone = tasks.length > 0 && completedCount === tasks.length;

  return (
    <ScreenShell withBottomNav>
      <Header backHref="/student" logoutType="student" subtitle="체크할수록 진도가 쌓여요" title={unitName} />

      {/* Progress summary card */}
      <div
        className={`rounded-3xl p-6 transition-colors duration-500 ${
          isAllDone ? "bg-emerald-50" : "bg-white shadow-card"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">단원 진도</p>
            <p
              className={`mt-2 text-4xl font-black tracking-tight ${
                isAllDone ? "text-emerald-600" : "text-gray-900"
              }`}
            >
              {progressRounded}%
            </p>
          </div>
          <div
            className={`rounded-2xl px-4 py-3 text-center ${
              isAllDone ? "bg-emerald-100" : "bg-gray-100"
            }`}
          >
            <p className={`text-xs ${isAllDone ? "text-emerald-600" : "text-gray-400"}`}>완료</p>
            <p className={`mt-1 text-xl font-black ${isAllDone ? "text-emerald-700" : "text-gray-900"}`}>
              {completedCount}/{tasks.length}
            </p>
          </div>
        </div>
        <div className="mt-5">
          <ProgressBar tone={isAllDone ? "green" : "blue"} value={progress} />
        </div>
      </div>

      {/* Task checklist */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-gray-900">학습 체크리스트</h2>
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCheckbox
              checked={task.is_done}
              disabled={savingTaskId === task.id}
              key={task.id}
              onToggle={() => void handleToggle(task.id)}
              title={task.title}
            />
          ))}
        </div>
      </div>

      <StudentBottomNav />
    </ScreenShell>
  );
}
