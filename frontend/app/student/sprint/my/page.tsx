"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getStudent } from "@/lib/storage";

type Dashboard = {
  today: string;
  program: null | {
    title: string;
    start_date: string;
    end_date: string;
    daily_study_goal_minutes: number | null;
    day_info: { day_number: number; total_days: number; status: string };
  };
  strike_summary?: { effective: number; threshold: number };
};

function minutesText(minutes: number | null | undefined) {
  if (!minutes) return "미설정";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

export default function StudentSprintMyPage() {
  const router = useRouter();
  const [studentName, setStudentName] = useState("");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentName(student.name);
    void apiFetch<Dashboard>(`/student/sprint/dashboard?student_id=${student.id}&study_date=${getStudyDate()}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "SPRINT 정보를 불러오지 못했습니다."));
  }, [router]);

  const program = data?.program ?? null;

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black tracking-[0.18em] text-[#2874E8]">SPRINT MY</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-[#10213D]">나의 SPRINT</h1>
          </div>
          <Link href="/student" className="rounded-full bg-white px-4 py-3 text-xs font-black text-[#285EB8] shadow-[0_8px_20px_rgba(60,94,140,0.18)]">
            오늘도 해냄으로 전환
          </Link>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <section className="mt-6 rounded-[28px] bg-white/95 p-6 shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
          <p className="text-sm font-bold text-[#6E7F99]">학생</p>
          <h2 className="mt-1 text-2xl font-black text-[#10213D]">{studentName || "학생"}</h2>

          {!data ? (
            <p className="mt-5 text-sm font-bold text-[#8CA0BD]">불러오는 중...</p>
          ) : !program ? (
            <div className="mt-5 rounded-3xl bg-[#F1F7FF] p-5">
              <p className="font-black text-[#10213D]">참여 중인 SPRINT가 없습니다.</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#6E7F99]">관리자가 SPRINT를 배정하면 이 화면에서 기간과 현재 DAY를 확인할 수 있습니다.</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              <div className="rounded-3xl bg-[#F1F7FF] p-5">
                <p className="text-xs font-black text-[#2874E8]">참여 SPRINT</p>
                <p className="mt-2 text-xl font-black text-[#10213D]">{program.title}</p>
                <p className="mt-1 text-sm font-semibold text-[#6E7F99]">{program.start_date} ~ {program.end_date}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-[#E2EEFA]">
                  <p className="text-xs font-bold text-[#6E7F99]">현재 DAY</p>
                  <p className="mt-2 text-xl font-black text-[#2874E8]">{program.day_info.day_number || "-"}</p>
                </div>
                <div className="rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-[#E2EEFA]">
                  <p className="text-xs font-bold text-[#6E7F99]">스트라이크</p>
                  <p className="mt-2 text-xl font-black text-[#E25050]">{data.strike_summary?.effective ?? 0}/{data.strike_summary?.threshold ?? "-"}</p>
                </div>
                <div className="rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-[#E2EEFA]">
                  <p className="text-xs font-bold text-[#6E7F99]">목표시간</p>
                  <p className="mt-2 text-lg font-black text-[#10213D]">{minutesText(program.daily_study_goal_minutes)}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </ScreenShell>
  );
}
