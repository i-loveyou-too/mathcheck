"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { ProgressBar } from "@/components/progress-bar";
import { apiFetch } from "@/lib/api";
import { AdminStudentCardProgress, loadAdminStudentCardProgress } from "@/lib/admin-student-progress";
import { getAdmin } from "@/lib/storage";
import { AdminStudentSummary, StudentCardSubjectProgress } from "@/lib/types";

type WeeklyTask = {
  id: number;
  status: "todo" | "in_progress" | "done";
};

type WeeklyDay = {
  date: string;
  summary: { total: number; done: number; todo: number; completion_rate: number };
  tasks: WeeklyTask[];
};

type WeeklyTasksResponse = {
  student_id: number;
  week_start: string;
  days: WeeklyDay[];
};

type DashboardStudent = AdminStudentSummary & {
  progressPercentage: number;
  subjectProgress: StudentCardSubjectProgress[];
  weeklyIncompleteTasks: number;
  weeklyDoneTasks: number;
  weeklyTotalTasks: number;
  hasInProgressTask: boolean;
};

function toLocalDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMondayOf(date: Date): Date {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  local.setDate(local.getDate() + (day === 0 ? -6 : 1 - day));
  return local;
}

function getProgressTone(value: number): "green" | "orange" | "blue" {
  if (value >= 40) return "green";
  if (value >= 15) return "orange";
  return "blue";
}

function normalizeSubjectName(name: string) {
  if (name === "수학1") return "수1";
  if (name === "수학2") return "수2";
  return name;
}

function getAttentionBadge(student: DashboardStudent) {
  if (student.weeklyIncompleteTasks > 0) {
    return { label: "숙제 미완료", className: "bg-red-50 text-red-500" };
  }
  if (student.hasInProgressTask) {
    return { label: "진행 중", className: "bg-emerald-50 text-emerald-600" };
  }
  if (student.progressPercentage <= 10) {
    return { label: "진도 낮음", className: "bg-amber-50 text-amber-600" };
  }
  return { label: "확인 필요", className: "bg-slate-100 text-slate-500" };
}

function getQuickActionTone(tone: "blue" | "mint" | "purple") {
  if (tone === "mint") {
    return "from-[#F2FBF7] to-[#ECFDF5] text-[#166534]";
  }
  if (tone === "purple") {
    return "from-[#F6F4FF] to-[#F3F0FF] text-[#4F46E5]";
  }
  return "from-[#F4F7FF] to-[#EEF2FF] text-[#1D4ED8]";
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [students, setStudents] = useState<DashboardStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const baseStudents = await apiFetch<AdminStudentSummary[]>("/admin/students");
        const progressMap = await loadAdminStudentCardProgress(baseStudents.map((student) => student.id));
        const weekStart = toLocalDateKey(getMondayOf(new Date()));

        const weeklyEntries = await Promise.all(
          baseStudents.map(async (student) => {
            try {
              const weekly = await apiFetch<WeeklyTasksResponse>(
                `/student/weekly-tasks?student_id=${student.id}&week_start=${weekStart}`,
              );

              const weeklyTotalTasks = weekly.days.reduce((sum, day) => sum + day.summary.total, 0);
              const weeklyDoneTasks = weekly.days.reduce((sum, day) => sum + day.summary.done, 0);
              const weeklyIncompleteTasks = weekly.days.reduce((sum, day) => sum + day.summary.todo, 0);
              const hasInProgressTask = weekly.days.some((day) =>
                day.tasks.some((task) => task.status === "in_progress"),
              );

              return [
                student.id,
                {
                  weeklyTotalTasks,
                  weeklyDoneTasks,
                  weeklyIncompleteTasks,
                  hasInProgressTask,
                },
              ] as const;
            } catch {
              return [
                student.id,
                {
                  weeklyTotalTasks: 0,
                  weeklyDoneTasks: 0,
                  weeklyIncompleteTasks: 0,
                  hasInProgressTask: false,
                },
              ] as const;
            }
          }),
        );

        const weeklyMap = Object.fromEntries(weeklyEntries);

        setStudents(
          baseStudents.map((student) => ({
            ...student,
            progressPercentage: progressMap[student.id]?.progressPercentage ?? 0,
            subjectProgress: progressMap[student.id]?.subjects ?? [],
            weeklyIncompleteTasks: weeklyMap[student.id]?.weeklyIncompleteTasks ?? 0,
            weeklyDoneTasks: weeklyMap[student.id]?.weeklyDoneTasks ?? 0,
            weeklyTotalTasks: weeklyMap[student.id]?.weeklyTotalTasks ?? 0,
            hasInProgressTask: weeklyMap[student.id]?.hasInProgressTask ?? false,
          })),
        );
      } catch (error) {
        setStudents([]);
        setLoadError(error instanceof Error ? error.message : "관리자 홈 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const averageProgress = useMemo(() => {
    if (students.length === 0) return 0;
    return Math.round(
      students.reduce((sum, student) => sum + student.progressPercentage, 0) / students.length,
    );
  }, [students]);

  const studentsNeedingCheck = useMemo(
    () =>
      students.filter(
        (student) =>
          student.weeklyIncompleteTasks > 0 || student.hasInProgressTask || student.progressPercentage <= 10,
      ).length,
    [students],
  );

  const incompleteHomeworkCount = useMemo(
    () => students.reduce((sum, student) => sum + student.weeklyIncompleteTasks, 0),
    [students],
  );

  const spotlightStudents = useMemo(
    () =>
      [...students]
        .sort((a, b) => {
          if ((b.weeklyIncompleteTasks > 0 ? 1 : 0) !== (a.weeklyIncompleteTasks > 0 ? 1 : 0)) {
            return (b.weeklyIncompleteTasks > 0 ? 1 : 0) - (a.weeklyIncompleteTasks > 0 ? 1 : 0);
          }
          if ((b.hasInProgressTask ? 1 : 0) !== (a.hasInProgressTask ? 1 : 0)) {
            return (b.hasInProgressTask ? 1 : 0) - (a.hasInProgressTask ? 1 : 0);
          }
          if (a.progressPercentage !== b.progressPercentage) {
            return a.progressPercentage - b.progressPercentage;
          }
          return b.weeklyIncompleteTasks - a.weeklyIncompleteTasks;
        })
        .slice(0, 4),
    [students],
  );

  return (
    <main className="min-h-screen bg-[#F4F6FA]">
      <div className="mx-auto max-w-7xl px-4 pb-32 pt-7 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#7C8799]">관리자</p>
              <h1 className="mt-2 text-[2rem] font-black tracking-tight text-[#17213B] sm:text-[2.4rem]">
                학생 진도 현황
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085] sm:text-base">
                오늘의 학생 학습 흐름을 한눈에 확인하고 관리하세요.
              </p>
            </div>

            <div className="flex items-center gap-3 self-start">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg shadow-card">
                <span className="relative inline-flex h-5 w-5 items-center justify-center text-[#17213B]">
                  ⌁
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#FF5A5F]" />
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-full bg-white px-3 py-2 shadow-card">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-sm font-black text-[#5C5FFF]">
                  A
                </div>
                <span className="text-sm font-bold text-[#17213B]">관리자님</span>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                title: "등록 학생",
                value: loading ? "-" : `${students.length}명`,
                description: "전체 학생 수",
                icon: "◔",
                iconClass: "bg-[#EEF2FF] text-[#4F46E5]",
              },
              {
                title: "전체 평균 진도율",
                value: loading ? "-" : `${averageProgress}%`,
                description: "학생 상세 기준 평균",
                icon: "↗",
                iconClass: "bg-[#F2EEFF] text-[#7C3AED]",
              },
              {
                title: "체크 필요 학생",
                value: loading ? "-" : `${studentsNeedingCheck}명`,
                description: "이번 주 미완료/저진도 기준",
                icon: "✓",
                iconClass: "bg-[#FFF4E8] text-[#F97316]",
              },
              {
                title: "미완료 숙제",
                value: loading ? "-" : `${incompleteHomeworkCount}건`,
                description: "이번 주 남은 숙제",
                icon: "!",
                iconClass: "bg-[#FFF1F2] text-[#EF4444]",
              },
            ].map((card) => (
              <article
                className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                key={card.title}
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black ${card.iconClass}`}
                >
                  {card.icon}
                </div>
                <p className="mt-4 text-sm font-bold text-[#475467]">{card.title}</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-[#17213B]">{card.value}</p>
                <p className="mt-2 text-sm text-[#98A2B3]">{card.description}</p>
              </article>
            ))}
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <h2 className="text-2xl font-black tracking-tight text-[#17213B]">빠른 실행</h2>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {[
                {
                  href: "/admin/daily-tasks",
                  eyebrow: "숙제 관리",
                  title: "숙제 배정",
                  description: "학생별 숙제를 배정하고 학습 계획을 관리하세요.",
                  tone: "blue" as const,
                },
                {
                  href: "/admin/textbooks-management",
                  eyebrow: "교재 관리",
                  title: "교재 등록",
                  description: "새로운 교재와 문항을 등록하고 목록을 관리하세요.",
                  tone: "mint" as const,
                },
                {
                  href: "/admin/students",
                  eyebrow: "학생 관리",
                  title: "학생 목록",
                  description: "전체 학생 목록을 확인하고 개별 학생을 관리하세요.",
                  tone: "purple" as const,
                },
              ].map((action) => (
                <Link
                  className={`rounded-[26px] border border-[#EEF2F7] bg-gradient-to-br p-5 shadow-sm transition hover:-translate-y-0.5 ${getQuickActionTone(action.tone)}`}
                  href={action.href}
                  key={action.href}
                >
                  <p className="text-sm font-bold">{action.eyebrow}</p>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-[1.5rem] font-black tracking-tight text-[#17213B]">
                        {action.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#667085]">{action.description}</p>
                    </div>
                    <span className="pt-1 text-2xl font-bold text-current">›</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-[#17213B]">먼저 확인할 학생</h2>
                <p className="mt-1 text-sm text-[#98A2B3]">
                  미완료 숙제, 진행 중, 전체 진도율을 기준으로 우선 확인 순서를 정했습니다.
                </p>
              </div>
              <Link className="shrink-0 text-sm font-bold text-[#4F46E5]" href="/admin/students">
                전체 보기
              </Link>
            </div>

            {loading ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div className="h-[250px] animate-pulse rounded-[28px] bg-[#F5F7FB]" key={i} />
                ))}
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {spotlightStudents.map((student) => {
                  const badge = getAttentionBadge(student);
                  return (
                    <article
                      className="rounded-[28px] border border-[#EEF2F7] bg-white p-5 shadow-sm"
                      key={student.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                        <p className="text-3xl font-black tracking-tight text-[#17213B]">
                          {student.progressPercentage}%
                        </p>
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF2FF] text-sm font-black text-[#5C5FFF]">
                          {student.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xl font-black tracking-tight text-[#17213B]">
                            {student.name}
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-[#98A2B3]">{student.grade}</p>
                        </div>
                      </div>

                      <div className="mt-5">
                        <ProgressBar
                          tone={getProgressTone(student.progressPercentage)}
                          value={student.progressPercentage}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {student.subjectProgress.slice(0, 3).map((subject) => (
                          <span
                            className="rounded-full bg-[#F4F6FA] px-3 py-1 text-xs font-bold text-[#667085]"
                            key={`${student.id}-${subject.id}`}
                          >
                            {normalizeSubjectName(subject.name)} {Math.round(subject.progressPercentage)}%
                          </span>
                        ))}
                        {student.subjectProgress.length === 0 ? (
                          <span className="rounded-full bg-[#F4F6FA] px-3 py-1 text-xs font-bold text-[#98A2B3]">
                            진도 데이터 없음
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl bg-[#F8FAFC] px-3 py-3">
                          <p className="text-xs font-bold text-[#98A2B3]">미완료 숙제</p>
                          <p className="mt-1 text-xl font-black text-[#17213B]">
                            {student.weeklyIncompleteTasks}건
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#F8FAFC] px-3 py-3">
                          <p className="text-xs font-bold text-[#98A2B3]">이번 주 완료</p>
                          <p className="mt-1 text-xl font-black text-[#17213B]">
                            {student.weeklyDoneTasks}/{student.weeklyTotalTasks}
                          </p>
                        </div>
                      </div>

                      <Link
                        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#EEF2FF] text-sm font-black text-[#4F46E5] transition hover:bg-[#E3E9FF]"
                        href={`/admin/students/${student.id}`}
                      >
                        학생 관리하기
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-[#17213B]">전체 학생 진도</h2>
                <p className="mt-1 text-sm text-[#98A2B3]">
                  전체 진도율은 학생 상세 페이지와 같은 기준을 사용합니다.
                </p>
              </div>
              <p className="text-xs font-bold text-[#98A2B3]">
                최근 체크일 / 검색 / 학년 필터는 현재 홈 API만으로는 표시하지 않았습니다.
              </p>
            </div>

            {loadError ? (
              <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">
                {loadError}
              </div>
            ) : null}

            <div className="mt-5 hidden overflow-hidden rounded-[24px] border border-[#EEF2F7] lg:block">
              <table className="min-w-full divide-y divide-[#EEF2F7]">
                <thead className="bg-[#F8FAFC]">
                  <tr className="text-left text-sm font-bold text-[#667085]">
                    <th className="px-6 py-3">학생</th>
                    <th className="px-4 py-3">학년</th>
                    <th className="px-4 py-3">전체 진도율</th>
                    <th className="px-4 py-3">주요 진도율</th>
                    <th className="px-4 py-3">최근 체크일</th>
                    <th className="px-6 py-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F7] bg-white">
                  {students.map((student) => (
                    <tr className="transition hover:bg-[#FBFCFE]" key={student.id}>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-xs font-black text-[#5C5FFF]">
                            {student.name.slice(0, 1)}
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="whitespace-nowrap font-bold text-[#17213B]">{student.name}</p>
                            {student.weeklyIncompleteTasks > 0 && (
                              <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-400">
                                미완료 {student.weeklyIncompleteTasks}건
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-[#475467]">{student.grade}</td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[160px] items-center gap-2.5">
                          <span className="w-9 shrink-0 text-sm font-black tabular-nums text-[#17213B]">
                            {student.progressPercentage}%
                          </span>
                          <div className="flex-1">
                            <div className={`h-2 overflow-hidden rounded-full ${student.progressPercentage >= 40 ? "bg-emerald-100" : student.progressPercentage >= 15 ? "bg-orange-100" : "bg-indigo-100"}`}>
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${student.progressPercentage >= 40 ? "bg-emerald-500" : student.progressPercentage >= 15 ? "bg-orange-400" : "bg-indigo-500"}`}
                                style={{ width: `${Math.min(student.progressPercentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {student.subjectProgress.slice(0, 3).map((subject) => (
                            <span
                              className="whitespace-nowrap rounded-full bg-[#F4F6FA] px-2.5 py-1 text-xs font-bold text-[#667085]"
                              key={`${student.id}-${subject.id}`}
                            >
                              {normalizeSubjectName(subject.name)} {Math.round(subject.progressPercentage)}%
                            </span>
                          ))}
                          {student.subjectProgress.length === 0 ? (
                            <span className="text-xs font-bold text-[#98A2B3]">-</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-[#98A2B3]">-</td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#EEF2FF] px-4 text-sm font-black text-[#4F46E5] transition hover:bg-[#E3E9FF]"
                          href={`/admin/students/${student.id}`}
                        >
                          관리하기
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 space-y-3 lg:hidden">
              {students.map((student) => (
                <article
                  className="rounded-[24px] border border-[#EEF2F7] bg-white p-4 shadow-sm"
                  key={student.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EEF2FF] text-sm font-black text-[#5C5FFF]">
                        {student.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="font-bold text-[#17213B]">{student.name}</p>
                        <p className="mt-0.5 text-xs text-[#98A2B3]">{student.grade}</p>
                      </div>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-[#17213B]">
                      {student.progressPercentage}%
                    </p>
                  </div>

                  <div className="mt-4">
                    <ProgressBar
                      tone={getProgressTone(student.progressPercentage)}
                      value={student.progressPercentage}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {student.subjectProgress.slice(0, 3).map((subject) => (
                      <span
                        className="rounded-full bg-[#F4F6FA] px-3 py-1 text-xs font-bold text-[#667085]"
                        key={`${student.id}-${subject.id}`}
                      >
                        {normalizeSubjectName(subject.name)} {Math.round(subject.progressPercentage)}%
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs font-bold text-[#98A2B3]">
                    <span>이번 주 미완료 {student.weeklyIncompleteTasks}건</span>
                    <span>최근 체크일 -</span>
                  </div>

                  <Link
                    className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-2xl bg-[#EEF2FF] text-sm font-black text-[#4F46E5] transition hover:bg-[#E3E9FF]"
                    href={`/admin/students/${student.id}`}
                  >
                    관리하기
                  </Link>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>

      <AdminBottomNav />
    </main>
  );
}
