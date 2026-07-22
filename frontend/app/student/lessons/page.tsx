"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type LessonEvent = {
  id: number | null; event_date: string; weekday_label: string; start_time: string; end_time: string;
  event_type: string; status: string; title: string | null; location: string | null;
};
type LessonData = { today: string; next_lesson: LessonEvent | null; events: LessonEvent[] };

const typeLabels: Record<string, string> = { regular: "정규", extra: "추가", makeup: "보강", trial: "체험", other: "기타" };
const statusLabels: Record<string, string> = { scheduled: "예정", completed: "완료", cancelled: "휴강", rescheduled: "변경됨" };
const statusStyles: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-600", completed: "bg-gray-100 text-gray-500",
  cancelled: "bg-red-50 text-red-500", rescheduled: "bg-amber-50 text-amber-600",
};

export default function StudentLessonsPage() {
  const router = useRouter();
  const [data, setData] = useState<LessonData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) { router.push("/login"); return; }
    void apiFetch<LessonData>(`/student/lessons?student_id=${student.id}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "수업 일정을 불러오지 못했습니다."));
  }, [router]);

  if (!data) return <ScreenShell withBottomNav><p className="py-20 text-center font-bold text-[#7A859F]">{error || "수업 일정을 불러오는 중..."}</p><StudentBottomNav /></ScreenShell>;

  const next = data.next_lesson;
  const upcoming = data.events.filter((e) => e.event_date >= data.today);

  return (
    <ScreenShell withBottomNav>
      <div className="flex items-center justify-between pt-2">
        <div><p className="text-sm font-black tracking-[0.15em] text-[#0E9F6E]">LESSONS</p><h1 className="mt-0.5 text-[1.8rem] font-black text-[#17213B]">수업 일정</h1></div>
        <Link href="/student" className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#5C63FF] shadow-sm">← 홈</Link>
      </div>

      {/* 다음 수업 */}
      {next ? (
        <section className="relative overflow-hidden rounded-[28px] bg-[#0F2E24] p-6 text-white shadow-[0_22px_50px_rgba(15,46,36,.25)]">
          <div className="absolute -right-10 -top-8 h-32 w-32 rounded-full bg-[#4ADE80]/20 blur-2xl" />
          <p className="relative text-sm font-bold text-[#7FE9AD]">다음 수업</p>
          <h2 className="relative mt-2 text-2xl font-black">{next.event_date} ({next.weekday_label})</h2>
          <p className="relative mt-1 text-lg font-black text-white/90">{next.start_time} ~ {next.end_time}</p>
          <div className="relative mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/15 px-2 py-1 text-xs font-black">{typeLabels[next.event_type]}</span>
            {next.status === "makeup" || next.event_type === "makeup" ? <span className="rounded-md bg-[#FBBF24]/25 px-2 py-1 text-xs font-black text-[#FDE68A]">보강</span> : null}
            {next.location && <span className="text-sm text-white/70">📍 {next.location}</span>}
          </div>
          {next.title && <p className="relative mt-2 text-sm text-white/60">{next.title}</p>}
        </section>
      ) : (
        <section className="rounded-[28px] bg-white p-8 text-center shadow-card">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#E7F8EF] text-2xl">📅</div>
          <h2 className="mt-5 text-xl font-black text-[#17213B]">예정된 수업이 없어요</h2>
          <p className="mt-2 text-sm text-[#7A859F]">관리자가 수업을 등록하면 여기에 표시됩니다.</p>
        </section>
      )}

      {/* 예정 수업 목록 */}
      <section>
        <h2 className="mb-3 text-lg font-black text-[#17213B]">앞으로의 수업</h2>
        {upcoming.length === 0 ? (
          <div className="rounded-[20px] bg-white p-6 text-center text-sm font-bold text-[#98A2B3] shadow-card">표시할 수업이 없어요.</div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((ev, i) => (
              <div key={`${ev.event_date}-${ev.id ?? i}`} className={`flex items-center gap-3 rounded-[18px] bg-white px-4 py-3 shadow-sm ${ev.status === "cancelled" ? "opacity-60" : ""}`}>
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#F0F5F2] text-[#0E9F6E]">
                  <span className="text-[10px] font-bold">{ev.weekday_label}</span>
                  <span className="text-sm font-black">{ev.event_date.slice(8, 10)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black text-[#17213B] ${ev.status === "cancelled" ? "line-through" : ""}`}>{ev.start_time} ~ {ev.end_time}</p>
                  <p className="truncate text-xs font-semibold text-[#7A859F]">{[typeLabels[ev.event_type], ev.title, ev.location].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-black ${statusStyles[ev.status]}`}>{statusLabels[ev.status]}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <StudentBottomNav />
    </ScreenShell>
  );
}
