"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getStudent } from "@/lib/storage";
import { getYouTubeEmbedUrl } from "@/lib/youtube";

type Task = {
  code: string;
  title?: string;
  type: "workbook" | "concept_recall" | "formula_quiz" | "concept_review" | "literature_video";
  content_type?: "novel" | "poetry" | "special";
  importance?: "AA" | "A";
  genre?: string;
  author?: string;
  textbook?: string;
  page?: number;
  series?: string;
  video_url?: string;
  note?: string;
  subject?: string;
  chapter?: string;
  level?: number;
  problem_count: number;
  completed: boolean;
  checkable: boolean;
  manual_checkable: boolean;
};

type Day = {
  day: number;
  title: string;
  scheduled_date: string | null;
  tasks: Task[];
  total_tasks: number;
  completed_tasks: number;
  progress_rate: number;
  total_problems: number;
  locked?: boolean;
  concept_summary: { total: number; completed: number; progress_rate: number } | null;
  formula_summary: { total: number; answered: number; correct: number; score_rate: number; completed: boolean } | null;
};

type Assignment = {
  id: number;
  student_id: number;
  challenge_type: string;
  challenge_title: string;
  challenge_short_title: string;
  start_date: string;
  status: "active";
  current_day: number;
  selected_day: number;
  total_days: number;
  schedule_ends_on: string;
  schedule_finished: boolean;
  is_rest_day: boolean;
  rest_dates: string[];
  overall_total_tasks: number;
  overall_completed_tasks: number;
  overall_progress_rate: number;
  aa_total_tasks?: number;
  aa_completed_tasks?: number;
  today: Day;
  days: Day[];
};

type Summary = {
  assignment: Assignment | null;
  assignments?: Assignment[];
};

function subjectLabel(subject?: string) {
  if (subject === "math1") return "수학Ⅰ";
  if (subject === "math2") return "수학Ⅱ";
  if (subject === "probability") return "확률과 통계";
  return "";
}

function taskLabel(task: Task) {
  if (task.type === "literature_video") return task.title ?? "";
  if (task.type !== "workbook") return task.title ?? "";
  return `${subjectLabel(task.subject)} · ${task.chapter} · Level ${task.level} · ${task.problem_count}문제`;
}

function literatureTypeLabel(contentType?: string) {
  if (contentType === "special") return "AA SPECIAL · 극·수필";
  return contentType === "novel" ? "오늘의 소설" : "오늘의 시가";
}

function literatureCompleteLabel(task: Task) {
  if (task.content_type === "novel") return "✓ 소설 완료";
  if (task.content_type === "special") return "완료";
  return "✓ 시가 완료";
}

function addDays(dateKey: string, offset: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function StudentSuteukChallengeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [savingCode, setSavingCode] = useState("");
  const [openVideoCodes, setOpenVideoCodes] = useState<Set<string>>(new Set());

  const loadAssignment = async (studentIdValue: number, assignmentId: number, dayNumber?: number) => {
    const queryDay = dayNumber ? `&day_number=${dayNumber}` : "";
    const detail = await apiFetch<Assignment>(
      `/student/suteuk-challenge/assignments/${assignmentId}?student_id=${studentIdValue}&study_date=${getStudyDate()}${queryDay}`,
    );
    setSelectedDay(detail.selected_day);
    setAssignment(detail);
  };

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    const requestedAssignmentId = Number(params.get("assignment_id") || 0);
    const requestedDay = Number(params.get("day") || 0);

    const load = async () => {
      const summary = await apiFetch<Summary>(
        `/student/suteuk-challenge/summary?student_id=${student.id}&study_date=${getStudyDate()}`,
      );
      const target = requestedAssignmentId
        ? (summary.assignments ?? []).find((item) => item.id === requestedAssignmentId)
        : summary.assignment;
      if (!target) {
        setAssignment(null);
        setError("배정된 수특 챌린지가 없습니다.");
        return;
      }
      await loadAssignment(student.id, target.id, requestedDay || target.current_day);
    };
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "챌린지를 불러오지 못했습니다."));
  }, [params, router]);

  const day = assignment?.today ?? null;
  const isLiteratureChallenge = assignment?.challenge_type === "ebs_literature_9mo";
  const actualCurrentDay = assignment?.current_day ?? 1;
  const actualSelectedDay = selectedDay ?? assignment?.selected_day ?? actualCurrentDay;
  const selectedDaySummary = useMemo(
    () => assignment?.days.find((item) => item.day === actualSelectedDay) ?? day,
    [assignment, actualSelectedDay, day],
  );
  const currentDaySummary = useMemo(
    () => assignment?.days.find((item) => item.day === actualCurrentDay) ?? null,
    [assignment, actualCurrentDay],
  );

  const selectDay = async (dayNumber: number) => {
    if (!assignment || !studentId) return;
    setError("");
    await loadAssignment(studentId, assignment.id, dayNumber).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "DAY 정보를 불러오지 못했습니다."),
    );
  };

  const toggleTask = async (task: Task) => {
    if (!assignment || !studentId || !day || !task.manual_checkable) return;
    setSavingCode(task.code);
    setError("");
    try {
      const updated = await apiFetch<Assignment>("/student/suteuk-challenge/progress", {
        method: "PATCH",
        body: {
          student_id: studentId,
          assignment_id: assignment.id,
          day_number: day.day,
          task_code: task.code,
          completed: !task.completed,
        },
      });
      setSelectedDay(updated.selected_day);
      setAssignment(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "체크 상태를 저장하지 못했습니다.");
    } finally {
      setSavingCode("");
    }
  };

  const toggleVideo = (taskCode: string) => {
    setOpenVideoCodes((current) => {
      const next = new Set(current);
      if (next.has(taskCode)) {
        next.delete(taskCode);
      } else {
        next.add(taskCode);
      }
      return next;
    });
  };

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[#FFF7F7] px-5 pb-28 pt-7">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#E13D3D]">{assignment?.challenge_short_title ?? "수특 챌린지"}</p>
            <h1 className="mt-1 break-keep text-3xl font-black tracking-tight text-[#17213B]">
              {assignment?.challenge_title ?? "수특 챌린지"}
            </h1>
          </div>
          <Link href="/student" className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#17213B] shadow-sm">
            홈
          </Link>
        </header>

        {error ? <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p> : null}

        {!assignment || !day ? (
          <div className="rounded-[28px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3]">챌린지 정보를 불러오는 중입니다.</div>
        ) : assignment.is_rest_day ? (
          <section className="rounded-[28px] bg-white p-8 text-center shadow-[0_16px_36px_rgba(225,61,61,0.12)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0F0] text-xl font-black text-[#E13D3D]">休</div>
            <h2 className="mt-5 text-2xl font-black text-[#17213B]">오늘은 쉬는날이에요</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[#7A859F]">오늘은 수특 챌린지 Day를 진행하지 않습니다. 다음 학습일에 DAY {actualCurrentDay}부터 이어집니다.</p>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {assignment.days.map((item) => (
                <div key={item.day} className="rounded-2xl bg-[#FFF7F7] px-2 py-3 text-center text-xs font-black text-[#17213B]">
                  <span className="block">DAY {item.day}</span>
                  <span className="mt-1 block text-[11px] text-[#98A2B3]">{item.scheduled_date?.slice(5).replace("-", "/") ?? addDays(assignment.start_date, item.day - 1)}</span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="mb-4 rounded-[28px] bg-white p-5 shadow-[0_16px_36px_rgba(225,61,61,0.12)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black text-[#E13D3D]">{assignment.start_date} 시작</p>
                  <h2 className="mt-1 text-2xl font-black text-[#17213B]">
                    {assignment.schedule_finished ? "챌린지 기간 종료" : `오늘은 DAY ${actualCurrentDay}`}
                  </h2>
                  <p className="mt-2 text-sm font-bold text-[#7A859F]">
                    선택한 DAY {actualSelectedDay} · 전체 {assignment.overall_completed_tasks} / {assignment.overall_total_tasks} task 완료
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-bold text-[#98A2B3]">전체 진행률</p>
                  <p className="text-3xl font-black text-[#E13D3D]">{assignment.overall_progress_rate}%</p>
                </div>
              </div>
              <div className="mt-4 h-3 rounded-full bg-[#FFE3E3]">
                <div className="h-full rounded-full bg-[#FF5A5F]" style={{ width: `${assignment.overall_progress_rate}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 text-center text-sm font-black sm:grid-cols-3">
                <div className="rounded-2xl bg-[#FFF7F7] px-3 py-3 text-[#17213B]">
                  선택 DAY {day.completed_tasks} / {day.total_tasks}
                </div>
                <div className="rounded-2xl bg-[#FFF7F7] px-3 py-3 text-[#17213B]">
                  오늘 DAY {currentDaySummary?.completed_tasks ?? 0} / {currentDaySummary?.total_tasks ?? 0}
                </div>
                <div className="rounded-2xl bg-[#FFF7F7] px-3 py-3 text-[#17213B]">
                  {isLiteratureChallenge && assignment.aa_total_tasks ? `AA ${assignment.aa_completed_tasks ?? 0} / ${assignment.aa_total_tasks}` : `전체 ${assignment.overall_completed_tasks} / ${assignment.overall_total_tasks}`}
                </div>
              </div>
            </section>

            <section className="mb-4 grid grid-cols-5 gap-2">
              {assignment.days.map((item) => {
                const isSelected = item.day === day.day;
                const isToday = item.day === actualCurrentDay && !assignment.schedule_finished;
                const isFuture = item.day > actualCurrentDay && !assignment.schedule_finished;
                const isComplete = item.total_tasks > 0 && item.completed_tasks === item.total_tasks;
                return (
                  <button
                    key={item.day}
                    type="button"
                    disabled={Boolean(item.locked)}
                    onClick={() => void selectDay(item.day)}
                    className={`min-h-[78px] rounded-2xl px-2 py-3 text-center text-xs font-black transition active:scale-[0.99] ${
                      isSelected
                        ? "bg-[#E13D3D] text-white shadow-[0_10px_22px_rgba(225,61,61,0.2)]"
                        : isComplete
                          ? "bg-white text-[#E13D3D] ring-1 ring-[#FFD1D1]"
                          : "bg-white text-[#17213B] ring-1 ring-[#F1DADA]"
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    <span className="block">DAY {item.day}</span>
                    <span className="mt-1 block text-[11px] opacity-75">{item.scheduled_date?.slice(5).replace("-", "/") ?? addDays(assignment.start_date, item.day - 1)}</span>
                    <span className="mt-1 block text-[11px]">
                      {item.locked ? "잠김" : isComplete ? "✓ 완료" : isToday ? "● 오늘" : isFuture ? "예정" : `${item.completed_tasks}/${item.total_tasks}`}
                    </span>
                  </button>
                );
              })}
            </section>

            <section className="mb-4 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-[#F1DADA]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black text-[#E13D3D]">
                    DAY {day.day}
                    {day.day === actualCurrentDay && !assignment.schedule_finished ? " · 오늘" : day.day > actualCurrentDay && !assignment.schedule_finished ? " · 미리 학습" : ""}
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-[#17213B]">
                    {day.day === actualCurrentDay && !assignment.schedule_finished ? "오늘 해야 할 분량" : "선택한 DAY 분량"}
                  </h2>
                  <p className="mt-1 text-sm font-bold text-[#7A859F]">
                    {isLiteratureChallenge ? "하루 소설 1작품 + 시가 1작품" : `DAY ${day.day} · 총 ${day.total_problems}문제`}
                  </p>
                </div>
                <p className="text-sm font-black text-[#17213B]">
                  {isLiteratureChallenge ? `${day.completed_tasks} / ${day.total_tasks} 작품 완료` : `${day.day === actualCurrentDay && !assignment.schedule_finished ? "오늘 진행" : "선택 DAY 진행"} ${day.completed_tasks} / ${day.total_tasks} task 완료`}
                </p>
              </div>
            </section>

            <section className={isLiteratureChallenge ? "grid gap-3 md:grid-cols-2" : "space-y-3"}>
              {day.tasks.map((task) => {
                if (task.type === "literature_video") {
                  const embedUrl = task.video_url ? getYouTubeEmbedUrl(task.video_url) : null;
                  const isVideoOpen = openVideoCodes.has(task.code);
                  return (
                    <article key={task.code} className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-[#F1DADA]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-[#E13D3D]">
                            {task.content_type === "special" ? "🎭 AA SPECIAL" : literatureTypeLabel(task.content_type)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs font-black">
                            <span className="rounded-full bg-[#FFF0F0] px-2.5 py-1 text-[#E13D3D]">
                              {task.content_type === "special" ? "AA SPECIAL" : `🔥 ${task.importance}`}
                            </span>
                            <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[#667085]">{task.genre}</span>
                          </div>
                        </div>
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg font-black ${task.completed ? "bg-[#E13D3D] text-white" : "bg-[#FFF0F0] text-[#C44]"}`}>
                          {task.completed ? "✓" : ""}
                        </span>
                      </div>
                      <p className="mt-4 text-sm font-bold text-[#7A859F]">{task.author}</p>
                      <h3 className="mt-1 break-keep text-2xl font-black text-[#17213B]">
                        {task.content_type === "special" ? `「${task.title}」` : task.title}
                      </h3>
                      <p className="mt-2 text-sm font-bold text-[#7A859F]">{task.textbook} p.{task.page} · {task.series}</p>
                      {task.note ? <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">{task.note}</p> : null}
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        {embedUrl ? (
                          <button
                            type="button"
                            onClick={() => toggleVideo(task.code)}
                            className="flex min-h-11 items-center justify-center rounded-2xl bg-[#17213B] px-3 text-center text-sm font-black text-white"
                          >
                            {isVideoOpen ? "영상 접기" : "▶ 영상 재생"}
                          </button>
                        ) : (
                          task.video_url ? (
                            <a href={task.video_url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-2xl bg-[#F1F5F9] px-3 text-center text-sm font-black text-[#667085]">
                              YouTube에서 열기
                            </a>
                          ) : (
                            <span className="flex min-h-11 items-center justify-center rounded-2xl bg-[#F1F5F9] px-3 text-center text-sm font-black text-[#98A2B3]">
                              영상 확인중
                            </span>
                          )
                        )}
                        <button
                          type="button"
                          disabled={!task.manual_checkable || savingCode === task.code}
                          onClick={() => toggleTask(task)}
                          className="min-h-11 rounded-2xl bg-[#E13D3D] px-3 text-sm font-black text-white disabled:bg-[#F1DADA] disabled:text-[#B98B8B]"
                        >
                          {task.completed ? "완료 해제" : literatureCompleteLabel(task)}
                        </button>
                      </div>
                      {embedUrl && isVideoOpen ? (
                        <div className="mt-4 overflow-hidden rounded-2xl bg-black shadow-[0_14px_30px_rgba(16,33,61,0.16)]">
                          <iframe
                            src={embedUrl}
                            title={`${task.title ?? "문학"} 영상`}
                            className="aspect-video w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                      ) : null}
                    </article>
                  );
                }
                const content = (
                  <>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg font-black ${task.completed ? "bg-[#E13D3D] text-white" : "bg-[#FFF0F0] text-[#C44]"}`}>
                      {task.completed ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-keep text-[15px] font-black text-[#17213B]">{taskLabel(task)}</span>
                      {task.type === "concept_recall" && day.concept_summary ? (
                        <span className="mt-1 block text-xs font-bold text-[#E13D3D]">{day.concept_summary.completed} / {day.concept_summary.total} 개념</span>
                      ) : null}
                      {task.type === "formula_quiz" && day.formula_summary ? (
                        <span className="mt-1 block text-xs font-bold text-[#E13D3D]">{day.formula_summary.answered} / {day.formula_summary.total} 문항 · {day.formula_summary.correct}정답</span>
                      ) : null}
                    </span>
                  </>
                );
                if (task.type === "concept_recall") {
                  return (
                    <Link key={task.code} href={`/student/suteuk-challenge/concept-recall?assignment_id=${assignment.id}&day=${day.day}`} className="flex w-full items-center gap-4 rounded-[24px] bg-white p-4 text-left shadow-sm ring-1 ring-[#F1DADA] transition hover:bg-[#FFF7F7] active:scale-[0.99]">
                      {content}
                    </Link>
                  );
                }
                if (task.type === "formula_quiz") {
                  return (
                    <Link key={task.code} href={`/student/suteuk-challenge/formula-check?assignment_id=${assignment.id}&day=${day.day}`} className="flex w-full items-center gap-4 rounded-[24px] bg-white p-4 text-left shadow-sm ring-1 ring-[#F1DADA] transition hover:bg-[#FFF7F7] active:scale-[0.99]">
                      {content}
                    </Link>
                  );
                }
                return (
                  <button
                    key={task.code}
                    type="button"
                    disabled={!task.manual_checkable || savingCode === task.code}
                    onClick={() => toggleTask(task)}
                    className="flex w-full items-center gap-4 rounded-[24px] bg-white p-4 text-left shadow-sm ring-1 ring-[#F1DADA] transition hover:bg-[#FFF7F7] active:scale-[0.99] disabled:opacity-60"
                  >
                    {content}
                  </button>
                );
              })}
            </section>
          </>
        )}
      </div>
      <StudentBottomNav />
    </ScreenShell>
  );
}

export default function StudentSuteukChallengePage() {
  return (
    <Suspense fallback={<ScreenShell withBottomNav><div className="p-8 text-center font-bold text-[#98A2B3]">챌린지를 불러오는 중입니다.</div></ScreenShell>}>
      <StudentSuteukChallengeContent />
    </Suspense>
  );
}
