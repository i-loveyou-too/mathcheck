"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type CompletedGoal = { title: string; subject: string; completed_at: string };
type GoalRecordsResponse = { records: CompletedGoal[] };

export default function SprintRecordsPage() {
  const router = useRouter();
  const [goalRecords, setGoalRecords] = useState<CompletedGoal[]>([]);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    void apiFetch<GoalRecordsResponse>(`/student/sprint/records/subject-goals?student_id=${student.id}`)
      .then((result) => setGoalRecords(result.records))
      .catch(() => setGoalRecords([]));
  }, [router]);

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href="/student/sprint" className="text-sm font-black text-[#2874E8]">
          ← SPRINT 홈
        </Link>
        <h1 className="mt-6 text-3xl font-black text-[#10213D]">SPRINT 학습 기록</h1>

        <section className="mt-8">
          <p className="mb-3 text-sm font-black text-[#10213D]">완료한 목표</p>
          {goalRecords.length === 0 ? (
            <div className="rounded-[20px] bg-white/80 p-5 text-center text-sm font-bold text-[#8CA0BD] shadow-sm ring-1 ring-[#DFEAF6]">
              아직 완료한 목표가 없어요.
            </div>
          ) : (
            <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
              {goalRecords.map((goal, index) => (
                <div key={`${goal.title}-${index}`} className="flex items-center justify-between rounded-[18px] bg-white/95 px-4 py-3 shadow-sm ring-1 ring-[#DFEAF6]">
                  <div className="min-w-0">
                    <p className="truncate font-black text-[#10213D]">{goal.title}</p>
                    <p className="mt-0.5 text-xs font-bold text-[#8CA0BD]">{goal.subject}</p>
                  </div>
                  <p className="shrink-0 text-xs font-bold text-emerald-600">{goal.completed_at.slice(0, 10)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ScreenShell>
  );
}
