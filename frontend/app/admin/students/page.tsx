"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { ProgressBar } from "@/components/progress-bar";
import { StudentCard } from "@/components/student-card";
import { apiFetch } from "@/lib/api";
import {
  AdminStudentCardProgress,
  loadAdminStudentCardProgress,
} from "@/lib/admin-student-progress";
import { getStudyDate } from "@/lib/study-date";
import { getAdmin } from "@/lib/storage";
import { AdminStudentSummary } from "@/lib/types";

type HomeworkDashboardStudent = {
  student_id: number;
  name: string;
  today_total: number;
  today_completed: number;
  today_completion_rate: number;
  overdue_count: number;
  week_total: number;
  week_completed: number;
};

type StudentRow = AdminStudentSummary & {
  subjectProgress: AdminStudentCardProgress["subjects"];
  homework: HomeworkDashboardStudent;
};

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStatus(progressPercentage: number) {
  if (progressPercentage <= 10) {
    return { label: "진도 낮음", className: "bg-red-50 text-red-500" };
  }
  if (progressPercentage < 25) {
    return { label: "체크 필요", className: "bg-orange-50 text-orange-500" };
  }
  return { label: "진행 중", className: "bg-emerald-50 text-emerald-600" };
}

function getTone(progressPercentage: number): "green" | "orange" | "blue" {
  if (progressPercentage >= 40) return "green";
  if (progressPercentage >= 15) return "orange";
  return "blue";
}

function SummaryCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: string;
}) {
  return (
    <article className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${tone}`}>{label}</span>
      <p className="mt-4 text-[2rem] font-black tracking-tight text-[#17213B]">{value}</p>
      <p className="mt-1 text-xs font-semibold text-[#98A2B3]">{helper}</p>
    </article>
  );
}

export default function AdminStudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [homeworkError, setHomeworkError] = useState("");

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }

    void apiFetch<AdminStudentSummary[]>("/admin/students")
      .then(async (data) => {
        const todayKey = getStudyDate();
        const [progressMap, homeworkData] = await Promise.all([
          loadAdminStudentCardProgress(data.map((student) => student.id)),
          apiFetch<{ date: string; students: HomeworkDashboardStudent[] }>(
            `/admin/homework-dashboard?date=${todayKey}`,
          ).catch(() => null),
        ]);
        const homeworkMap = new Map(
          (homeworkData?.students ?? []).map((student) => [student.student_id, student]),
        );
        setHomeworkError(homeworkData ? "" : "숙제 현황을 불러오지 못했어요.");

        setStudents(
          data.map((student) => ({
            ...student,
            progress_percentage: progressMap[student.id]?.progressPercentage ?? 0,
            subjectProgress: progressMap[student.id]?.subjects ?? [],
            homework:
              homeworkMap.get(student.id) ?? {
                student_id: student.id,
                name: student.name,
                today_total: 0,
                today_completed: 0,
                today_completion_rate: 0,
                overdue_count: 0,
                week_total: 0,
                week_completed: 0,
              },
          })),
        );
      })
      .catch(() => {
        setStudents([]);
        setHomeworkError("");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const summary = useMemo(() => {
    const lowProgress = students.filter((student) => student.progress_percentage <= 10).length;
    const checkNeeded = students.filter(
      (student) => student.progress_percentage > 10 && student.progress_percentage < 25,
    ).length;
    const incompleteHomework = students.filter((student) => student.progress_percentage < 100).length;

    return {
      total: students.length,
      lowProgress,
      checkNeeded,
      incompleteHomework,
    };
  }, [students]);

  return (
    <main className="min-h-screen bg-[#F4F6FA]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-32 sm:px-6 lg:px-8">
        <div className="space-y-5">
          <section className="rounded-[32px] border border-white/80 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#7C8799]">관리자</p>
                <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-[#17213B] sm:text-[2.3rem]">
                  학생 목록
                </h1>
                <p className="mt-2 text-sm leading-6 text-[#667085]">
                  학생을 선택하면 상세 현황을 볼 수 있어요.
                </p>
              </div>

              <div className="hidden items-center gap-3 sm:flex">
                <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                  <span className="text-lg text-[#17213B]">🔔</span>
                  <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-[#FF5A5F]" />
                </div>
                <div className="flex items-center gap-2 rounded-full bg-[#F8FAFC] px-3 py-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF2FF] text-xs font-black text-[#5C5FFF]">
                    A
                  </div>
                  <span className="text-sm font-bold text-[#17213B]">관리자님</span>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <SummaryCard
              helper="전체 학생 수"
              label="전체 학생"
              tone="bg-[#EEF2FF] text-[#4F46E5]"
              value={loading ? "-" : `${summary.total}명`}
            />
            <SummaryCard
              helper="진도 낮은 학생"
              label="진도 낮음"
              tone="bg-[#FFF1F2] text-[#EF4444]"
              value={loading ? "-" : `${summary.lowProgress}명`}
            />
            <SummaryCard
              helper="추가 확인 필요"
              label="체크 필요"
              tone="bg-[#FFF7ED] text-[#F97316]"
              value={loading ? "-" : `${summary.checkNeeded}명`}
            />
            <SummaryCard
              helper="진도 100% 미만"
              label="미완료 숙제"
              tone="bg-[#FEF2F2] text-[#F04438]"
              value={loading ? "-" : `${summary.incompleteHomework}명`}
            />
          </section>

          <section className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1 rounded-[22px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold text-[#98A2B3]">
                  검색, 학년 필터, 정렬은 기존 동작 로직이 아직 없어 이번 작업에서는 UI만 정리했어요.
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full bg-[#0F172A] px-4 py-2 text-xs font-black text-white"
                    type="button"
                  >
                    전체
                  </button>
                  {["고1", "고2", "고3", "재수"].map((grade) => (
                    <button
                      className="rounded-full bg-[#F4F6FA] px-4 py-2 text-xs font-black text-[#667085]"
                      key={grade}
                      type="button"
                    >
                      {grade}
                    </button>
                  ))}
                  <button
                    className="rounded-[18px] bg-[#F4F6FA] px-4 py-2 text-xs font-black text-[#667085]"
                    type="button"
                  >
                    진도 낮은순
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_180px]">
                <div className="flex items-center gap-3 rounded-[22px] border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
                  <span className="text-base text-[#98A2B3]">🔍</span>
                  <span className="text-sm font-semibold text-[#98A2B3]">학생 이름으로 검색</span>
                </div>
                <div className="flex items-center justify-between rounded-[22px] border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
                  <span className="text-sm font-bold text-[#344054]">전체 학년</span>
                  <span className="text-xs text-[#98A2B3]">▼</span>
                </div>
                <div className="flex items-center justify-between rounded-[22px] border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
                  <span className="text-sm font-bold text-[#344054]">진도 낮은순</span>
                  <span className="text-xs text-[#98A2B3]">▼</span>
                </div>
              </div>
            </div>

            {homeworkError ? (
              <div className="mt-4 rounded-[20px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-bold text-[#B42318]">
                {homeworkError}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-5 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div className="h-28 animate-pulse rounded-[28px] bg-[#F5F7FB]" key={i} />
                ))}
              </div>
            ) : students.length === 0 ? (
              <div className="mt-6 py-16 text-center">
                <p className="text-sm font-bold text-[#98A2B3]">등록된 학생이 없습니다.</p>
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-3 lg:hidden">
                  {students.map((student) => (
                    <div className="space-y-2" key={student.id}>
                      <StudentCard
                        grade={student.grade}
                        id={student.id}
                        name={student.name}
                        progressPercentage={student.progress_percentage}
                        subjects={student.subjectProgress}
                        variant="mobile"
                      />
                      <div className="rounded-[22px] border border-[#EEF2F7] bg-[#FBFCFE] px-4 py-3">
                        <div className="flex flex-wrap gap-2 text-xs font-black">
                          <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-[#4F46E5]">
                            숙제 완료율 {student.homework.today_completion_rate}%
                          </span>
                          <span className="rounded-full bg-[#FFF7ED] px-3 py-1 text-[#C4320A]">
                            오늘 미완료 {Math.max(student.homework.today_total - student.homework.today_completed, 0)}개
                          </span>
                          <span className="rounded-full bg-[#FEF2F2] px-3 py-1 text-[#B42318]">
                            밀린 숙제 {student.homework.overdue_count}개
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 hidden overflow-hidden rounded-[28px] border border-[#EEF2F7] lg:block">
                  <table className="min-w-full divide-y divide-[#EEF2F7]">
                    <thead className="bg-[#F8FAFC]">
                      <tr className="text-left text-sm font-black text-[#667085]">
                        <th className="px-6 py-4">학생</th>
                        <th className="px-4 py-4">학년</th>
                        <th className="px-4 py-4">전체 진도율</th>
                        <th className="px-4 py-4">교재 진도율</th>
                        <th className="px-4 py-4">최근 체크일</th>
                        <th className="px-4 py-4">상태</th>
                        <th className="px-6 py-4 text-right">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF2F7] bg-white">
                      {students.map((student) => {
                        const status = getStatus(student.progress_percentage);

                        return (
                          <tr className="transition hover:bg-[#FBFCFE]" key={student.id}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF2FF] text-sm font-black text-[#5C5FFF]">
                                  {student.name.slice(0, 1)}
                                </div>
                                <div>
                                  <p className="font-black text-[#17213B]">{student.name}</p>
                                  <p className="mt-0.5 text-xs font-semibold text-[#98A2B3]">
                                    학생 관리 페이지로 이동
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm font-bold text-[#475467]">{student.grade}</td>
                            <td className="px-4 py-4">
                              <div className="min-w-[190px]">
                                <p className="mb-2 text-sm font-black text-[#17213B]">
                                  {Math.round(student.progress_percentage)}%
                                </p>
                                <ProgressBar
                                  tone={getTone(student.progress_percentage)}
                                  value={student.progress_percentage}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex max-w-[280px] flex-wrap gap-2">
                                {student.subjectProgress.slice(0, 3).map((subject) => (
                                  <span
                                    className="rounded-full bg-[#F4F6FA] px-3 py-1 text-xs font-bold text-[#667085]"
                                    key={`${student.id}-${subject.id}`}
                                  >
                                    {subject.name} {Math.round(subject.progressPercentage)}%
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex max-w-[240px] flex-wrap gap-2">
                                <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-black text-[#4F46E5]">
                                  완료율 {student.homework.today_completion_rate}%
                                </span>
                                <span className="rounded-full bg-[#FFF7ED] px-3 py-1 text-xs font-black text-[#C4320A]">
                                  미완료 {Math.max(student.homework.today_total - student.homework.today_completed, 0)}개
                                </span>
                                <span className="rounded-full bg-[#FEF2F2] px-3 py-1 text-xs font-black text-[#B42318]">
                                  밀림 {student.homework.overdue_count}개
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`rounded-full px-3 py-1 text-xs font-black ${status.className}`}>
                                {status.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Link
                                className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#EEF2FF] px-4 text-sm font-black text-[#4F46E5] transition hover:bg-[#E3E9FF]"
                                href={`/admin/students/${student.id}`}
                              >
                                학생 관리하기
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <AdminBottomNav />
    </main>
  );
}
