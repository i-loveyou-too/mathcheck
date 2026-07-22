"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type ExamRecord = {
  round_no: number;
  exam_date: string;
  title: string;
  raw_score: number | null;
  max_score: number | null;
  correct_count: number | null;
  unanswered_count: number;
  score_change: number | null;
};
type RecordsResponse = { records: ExamRecord[]; average_score: number | null };
type CompletedGoal = { title: string; subject: string; completed_at: string };
type GoalRecordsResponse = { records: CompletedGoal[] };

export default function SprintRecordsPage() {
  const router = useRouter();
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [goalRecords, setGoalRecords] = useState<CompletedGoal[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    void apiFetch<RecordsResponse>(`/student/sprint/records/mock-exams?student_id=${student.id}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "기록을 불러오지 못했습니다."));
    void apiFetch<GoalRecordsResponse>(`/student/sprint/records/subject-goals?student_id=${student.id}`)
      .then((result) => setGoalRecords(result.records))
      .catch(() => setGoalRecords([]));
  }, [router]);

  const maxScore = data?.records.reduce((max, record) => Math.max(max, record.max_score ?? 0), 0) ?? 0;

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href="/student/sprint" className="text-sm font-black text-[#2874E8]">← SPRINT 홈</Link>
        <h1 className="mt-6 text-3xl font-black tracking-[-0.05em] text-[#10213D]">모의고사 학습 기록</h1>

        {!data ? (
          <p className="mt-8 rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</p>
        ) : data.records.length === 0 ? (
          <section className="mt-8 rounded-[28px] bg-white/95 p-7 text-center shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
            <h2 className="text-xl font-black text-[#10213D]">아직 채점된 모의고사가 없어요</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#6E7F99]">모의고사를 응시하고 채점이 완료되면 이곳에 성적 추이가 표시됩니다.</p>
            <Link href="/student/sprint/mock-exams" className="mt-6 inline-flex rounded-2xl bg-[#2874E8] px-5 py-3 text-sm font-black text-white">모의고사 보러가기</Link>
          </section>
        ) : (
          <>
            <section className="mt-6 rounded-[24px] bg-white/95 p-5 shadow-card ring-1 ring-[#DFEAF6]">
              <p className="text-sm font-bold text-[#6E7F99]">평균 점수</p>
              <p className="mt-1 text-3xl font-black text-[#2874E8]">{data.average_score}점</p>
            </section>

            <section className="mt-6 rounded-[24px] bg-white/95 p-5 shadow-card ring-1 ring-[#DFEAF6]">
              <p className="mb-4 text-sm font-black text-[#10213D]">회차별 점수</p>
              <div className="flex items-end gap-3 overflow-x-auto pb-2">
                {data.records.map((record) => (
                  <div key={record.round_no} className="flex flex-col items-center gap-1.5">
                    <div className="flex h-32 w-8 items-end rounded-full bg-[#F0F2F8]">
                      <div
                        className="w-full rounded-full bg-[#2874E8] transition-all"
                        style={{ height: `${maxScore ? Math.max(4, ((record.raw_score ?? 0) / maxScore) * 100) : 0}%` }}
                      />
                    </div>
                    <p className="text-xs font-black text-[#17213B]">{record.raw_score}</p>
                    <p className="text-[10px] font-bold text-[#98A2B3]">{record.round_no}회</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-6 space-y-2">
              {data.records.slice().reverse().map((record) => (
                <div key={record.round_no} className="rounded-[20px] bg-white/95 p-4 shadow-sm ring-1 ring-[#DFEAF6]">
                  <div className="flex items-center justify-between">
                    <p className="font-black text-[#10213D]">{record.round_no}회차 · {record.exam_date}</p>
                    <p className="text-lg font-black text-[#2874E8]">{record.raw_score}점</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-[#6E7F99]">
                    <span>정답 {record.correct_count}개</span>
                    <span>미응답 {record.unanswered_count}개</span>
                    {record.score_change !== null && (
                      <span className={record.score_change >= 0 ? "text-emerald-600" : "text-red-500"}>
                        이전 대비 {record.score_change >= 0 ? "+" : ""}{record.score_change}점
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        <section className="mt-8">
          <p className="mb-3 text-sm font-black text-[#10213D]">완료한 목표</p>
          {goalRecords.length === 0 ? (
            <div className="rounded-[20px] bg-white/80 p-5 text-center text-sm font-bold text-[#8CA0BD] shadow-sm ring-1 ring-[#DFEAF6]">아직 완료한 목표가 없어요.</div>
          ) : (
            <div className="space-y-2">
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
