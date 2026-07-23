"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getStudent } from "@/lib/storage";

type DayInfo = { status: "scheduled" | "active" | "completed"; total_days: number; day_number: number; days_elapsed: number; days_remaining: number };
type Program = {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  daily_study_goal_minutes: number | null;
  day_info: DayInfo;
};
type StrikeSummary = {
  threshold: number;
  effective: number;
  latest_strike_type?: string | null;
  latest_learning_date?: string | null;
};
type StudyStats = {
  today_approved_minutes: number;
  week_approved_minutes: number;
  daily_goal_minutes: number | null;
  goal_achieved_days: number;
};
type StudySubmission = { status: "draft" | "pending" | "approved" | "rejected" | "cancelled"; approved_minutes: number | null } | null;
type ProofSummary = {
  enabled: boolean;
  available: boolean;
  deadline_time: string | null;
  workflow_status: "draft" | "pending" | "approved" | "rejected" | "cancelled" | null;
  timing_status: "on_time" | "late" | "missing" | "not_due" | "disabled";
  path: string;
};
type VocabularySummary = {
  available: boolean;
  status: "none" | "not_started" | "draft" | "submitted";
  day_number?: number;
  question_count?: number | null;
  latest_score?: number | null;
  path: string;
};
type WeeklySummary = {
  study_minutes: number;
  study_goal_achieved_days: number;
  seat_check_submitted_days: number | null;
  planner_submitted_days: number | null;
  vocabulary_average_score: number | null;
};
type MockExamCardInfo = {
  id: number;
  round_no: number;
  title: string;
  exam_date: string;
  weekday_label: string;
  question_count: number;
  status: "scheduled" | "open" | "closed";
  is_date_overridden: boolean;
};
type MockExamSummary = {
  available: boolean;
  status: "coming_soon" | "none" | "scheduled" | "open";
  exam?: MockExamCardInfo | null;
  days_remaining?: number;
  submission_status?: string;
  path: string;
};
type MockRoundCardInfo = { id: number; round_no: number; title: string; exam_date: string; status: "scheduled" | "open" | "closed" };
type MockRoundSummary = {
  available: boolean;
  status: "none" | "scheduled" | "open";
  round?: MockRoundCardInfo | null;
  days_remaining?: number;
  participant_status?: string;
  path: string;
};
type SubjectGoalNext = { title: string; subject: string; target_date: string };
type SubjectGoalSummary = {
  available: boolean;
  total: number;
  completed: number;
  completion_rate: number | null;
  next_goal: SubjectGoalNext | null;
  path: string;
};
type WorksheetSummary = {
  available: boolean;
  assigned_count: number;
  pending_action_count: number;
  in_review_count: number;
  approved_count: number;
  path: string;
};
type Dashboard = {
  today: string;
  program: Program | null;
  empty_state: "upcoming_only" | "past_only" | "none" | null;
  upcoming: Program | null;
  past_count: number;
  overall_goal_progress: number | null;
  strike_summary?: StrikeSummary;
  study_time_stats?: StudyStats;
  study_time_submission?: StudySubmission;
  proof_summaries?: { seat_check: ProofSummary; planner: ProofSummary };
  vocabulary_summary?: VocabularySummary;
  mock_exam_summary?: MockExamSummary;
  mock_round_summary?: MockRoundSummary;
  progress_summary?: SubjectGoalSummary;
  worksheet_summary?: WorksheetSummary;
  weekly_summary?: WeeklySummary;
};

const strikeReasonLabels: Record<string, string> = {
  planner_missing: "플래너 미제출",
  planner_late: "플래너 지각",
  seat_check_missing: "착석 인증 미제출",
  seat_check_late: "착석 인증 지각",
  study_time_missing: "공부시간 미제출",
  study_time_shortage: "공부시간 목표 미달",
  vocabulary_missing: "영단어 미응시",
  mock_exam_missing: "모의고사 미응시",
  mock_exam_late: "모의고사 지각",
  manual: "관리자 부여",
};

function strikeReasonLabel(strikeType: string | null | undefined) {
  if (!strikeType) return null;
  return strikeReasonLabels[strikeType] ?? "기타 사유";
}

const proofLabels: Record<string, string> = {
  pending: "검토 대기",
  approved: "승인 완료",
  rejected: "반려됨",
  draft: "임시저장",
  cancelled: "취소됨",
  missing: "미제출 확정",
  not_due: "미제출",
  disabled: "비활성",
  late: "지각",
  on_time: "정상",
};

function minutesText(minutes: number | null | undefined) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function Icon({ name }: { name: "bell" | "seat" | "planner" | "timer" | "book" | "goals" | "exam" | "clock" | "target" | "doc" }) {
  const paths = {
    bell: <path d="M12 22a2.7 2.7 0 0 0 2.6-2h-5.2A2.7 2.7 0 0 0 12 22Zm8-6.2-2-2.2V9a6 6 0 0 0-4.7-5.9 1.4 1.4 0 0 0-2.6 0A6 6 0 0 0 6 9v4.6l-2 2.2V18h16v-2.2Z" />,
    doc: <path d="M6 2h8l4 4v16H6V2Zm7 1.5V7h3.5L13 3.5ZM8 11h8v2H8v-2Zm0 4h8v2H8v-2Zm0-8h4v2H8V7Z" />,
    seat: <path d="M8 4h8v8H8V4Zm-2 9h12v2H6v-2Zm1 3h2l-1 5H6l1-5Zm8 0h2l1 5h-2l-1-5Z" />,
    planner: <path d="M7 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7V3Zm-3 3h2v12H4V6Zm5 2h7v2H9V8Zm0 4h7v2H9v-2Zm0 4h5v2H9v-2Z" />,
    timer: <path d="M10 2h4v2h-4V2Zm1 11V7h2v7h5v2h-7v-3Zm1 9a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />,
    book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm16 0A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />,
    goals: <path d="M6 3h12v18H6V3Zm3 4h6v2H9V7Zm0 4h6v2H9v-2Zm0 4h4v2H9v-2Z" />,
    exam: <path d="M6 3h9l3 3v15H6V3Zm8 1.5V7h2.5L14 4.5ZM8 10h8v2H8v-2Zm0 4h8v2H8v-2Z" />,
    clock: <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm1-10.4V6h-2v7h6v-2h-4Z" />,
    target: <path d="M12 22a10 10 0 1 1 9.8-12H19a7 7 0 1 0-7 9 7 7 0 0 0 6.7-5h2.1A9.9 9.9 0 0 1 12 22Zm0-4a6 6 0 1 1 5.7-8h-2.3A4 4 0 1 0 16 12h-4V8h2v2h7v2h-9v-2Z" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-current">{paths[name]}</svg>;
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-[1.28rem] font-black tracking-[-0.03em] text-[#10213D]">{title}</h2>
      {href ? <Link href={href} className="text-sm font-black text-[#2874E8]">모두 보기 ›</Link> : <span className="text-sm font-black text-[#8CA0BD]">모두 보기 ›</span>}
    </div>
  );
}

function EmptyState({ data }: { data: Dashboard }) {
  const title = data.empty_state === "upcoming_only" ? "SPRINT 시작 전이에요" : data.empty_state === "past_only" ? "종료된 SPRINT만 있어요" : "참여 중인 SPRINT가 없어요";
  const desc = data.empty_state === "upcoming_only" && data.upcoming ? `${data.upcoming.start_date}에 ${data.upcoming.title}가 시작됩니다.` : "관리자가 SPRINT를 배정하면 이곳에서 현황을 볼 수 있어요.";
  return (
    <div className="rounded-[28px] bg-white/90 p-7 text-center shadow-[0_14px_34px_rgba(58,96,140,0.12)] ring-1 ring-[#DCEBFA]">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E7BEA]"><Icon name="target" /></div>
      <h2 className="text-xl font-black text-[#10213D]">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#6E7F99]">{desc}</p>
    </div>
  );
}

function ProofCard({ title, icon, proof }: { title: string; icon: "seat" | "planner"; proof?: ProofSummary }) {
  const unavailable = !proof?.available;
  const status = unavailable ? "준비 중" : proof.workflow_status ? proofLabels[proof.workflow_status] : proofLabels[proof.timing_status];
  const tone = status.includes("반려") || status.includes("지각") || status.includes("확정") ? "text-[#E25050] bg-[#FFF0F0]" : status.includes("검토") ? "text-[#E18A00] bg-[#FFF6E2]" : status.includes("승인") ? "text-[#17895E] bg-[#EAF8F1]" : "text-[#2874E8] bg-[#EDF5FF]";
  const cta = status.includes("승인") || status.includes("검토") ? "제출 완료" : status.includes("반려") ? "재제출하기" : "사진 제출하기";
  const card = (
    <div className="h-full min-w-0 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E8AEA]"><Icon name={icon} /></div>
        <div className="min-w-0 flex-1">
          <p className="break-keep font-black text-[#10213D]">{title}</p>
          <p className="mt-1 break-keep text-sm font-semibold text-[#40516D]">{proof?.deadline_time ? `${proof.deadline_time}까지` : unavailable ? "기능 준비 중" : "마감 없음"}</p>
        </div>
      </div>
      <div className="my-4 h-px bg-[#E9F0F8]" />
      <span className={`inline-flex break-keep rounded-full px-4 py-1.5 text-sm font-black ${tone}`}>{status}</span>
      <div className="mt-4 break-keep rounded-2xl border border-[#A9CBFA] px-4 py-3 text-center text-sm font-black text-[#2874E8]">{unavailable ? "준비 중" : cta}</div>
    </div>
  );
  return unavailable ? <div>{card}</div> : <Link href={proof.path}>{card}</Link>;
}

export default function StudentSprintPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    void apiFetch<Dashboard>(`/student/sprint/dashboard?student_id=${student.id}&study_date=${getStudyDate()}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "SPRINT를 불러오지 못했습니다."));
  }, [router]);

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[70vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "SPRINT를 불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  const program = data.program;
  const progress = percent(data.overall_goal_progress);
  const studyStats = data.study_time_stats;
  const studyGoal = studyStats?.daily_goal_minutes ?? program?.daily_study_goal_minutes ?? null;
  const studyProgress = studyGoal ? percent((studyStats?.today_approved_minutes ?? 0) * 100 / studyGoal) : null;
  const studyStatus = data.study_time_submission?.status ?? (studyStats?.today_approved_minutes ? "approved" : null);
  const weekly = data.weekly_summary;
  const vocabulary = data.vocabulary_summary;
  const sprintVocabularyPath = vocabulary?.path?.replace("/student/vocabulary", "/student/sprint/vocabulary") ?? "/student/sprint/vocabulary";

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-10 pt-9">
        <header className="mb-7 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[3.2rem] font-black leading-none tracking-[-0.08em] text-[#2E74E8] drop-shadow-[0_8px_16px_rgba(47,116,232,0.18)]">SPRINT</h1>
            <p className="mt-2 break-keep text-lg font-bold tracking-[-0.04em] text-[#244A80]">오늘의 기록이 목표를 완성해요</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-4">
            <div className="relative text-[#436AA2]" aria-label="알림">
              <Icon name="bell" />
              <span className="absolute right-0 top-0 h-3 w-3 rounded-full bg-[#F25E72]" />
            </div>
            <Link href="/student" className="whitespace-nowrap break-keep rounded-full bg-white px-4 py-3 text-sm font-black text-[#285EB8] shadow-[0_8px_20px_rgba(60,94,140,0.18)]">↔ 오늘도 해냄으로 전환</Link>
          </div>
        </header>

        {error && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        {!program ? (
          <EmptyState data={data} />
        ) : (
          <>
            <section className="relative mb-8 overflow-hidden rounded-[24px] bg-white/95 p-5 shadow-[0_18px_36px_rgba(49,89,130,0.18)] ring-1 ring-[#DCEBFA]">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.35fr_1fr_1fr]">
                <div>
                  <p className="text-3xl font-black tracking-[-0.05em] text-[#2E74E8] break-keep">DAY {program.day_info.day_number || "-"}</p>
                  <p className="mt-2 text-lg font-bold text-[#183050] break-keep">{program.day_info.status === "scheduled" ? `시작까지 ${program.day_info.days_remaining}일` : program.day_info.status === "completed" ? "SPRINT 종료" : `종료까지 ${program.day_info.days_remaining}일 남았어요!`}</p>
                </div>
                <div className="sm:border-l sm:border-[#E3EDF8] sm:pl-4">
                  <p className="text-sm font-bold text-[#29415F] break-keep">전체 진행률</p>
                  <p className="mt-3 text-2xl font-black text-[#10213D]">{progress === null ? "-" : `${progress}%`}</p>
                  <div className="mt-3 h-2 rounded-full bg-[#DDE4EF]"><div className="h-full rounded-full bg-[#2874E8]" style={{ width: `${progress ?? 0}%` }} /></div>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#29415F] break-keep">스트라이크</p>
                  <p className="mt-3 text-2xl font-black text-[#10213D]">{data.strike_summary?.effective ?? 0} / {data.strike_summary?.threshold ?? "-"}</p>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {Array.from({ length: data.strike_summary?.threshold ?? 3 }).slice(0, 3).map((_, index) => <span key={index} className={`h-2 rounded-full ${index < (data.strike_summary?.effective ?? 0) ? "bg-[#FF6648]" : "bg-[#DDE4EF]"}`} />)}
                  </div>
                </div>
              </div>
              {strikeReasonLabel(data.strike_summary?.latest_strike_type) && (
                <p className="relative mt-3 text-xs font-bold text-[#8CA0BD]">
                  최근 사유: {strikeReasonLabel(data.strike_summary?.latest_strike_type)}
                  {data.strike_summary?.latest_learning_date ? ` · ${data.strike_summary.latest_learning_date}` : ""}
                </p>
              )}
              <div className="absolute bottom-5 right-5 hidden h-16 w-20 rounded-t-[20px] bg-gradient-to-br from-[#A9D8FF] to-[#4F9DF5] opacity-80 sm:block" />
            </section>

            <section className="mb-8">
              <SectionHeader title="오늘의 인증" href="/student/sprint/proofs" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                <ProofCard title="착석 인증" icon="seat" proof={data.proof_summaries?.seat_check} />
                <ProofCard title="플래너 인증" icon="planner" proof={data.proof_summaries?.planner} />
                <Link href="/student/sprint/study-time" className="min-w-0 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E8AEA]"><Icon name="timer" /></div>
                    <div className="min-w-0 flex-1"><p className="break-keep font-black text-[#10213D]">공부시간</p><p className="mt-1 break-keep text-sm font-semibold text-[#40516D]">목표 {studyGoal ? minutesText(studyGoal) : "미설정"}</p></div>
                  </div>
                  <div className="my-4 h-px bg-[#E9F0F8]" />
                  <p className="text-center text-xl font-black text-[#2874E8]">{minutesText(studyStats?.today_approved_minutes ?? 0)}</p>
                  <div className="mt-3 h-2.5 rounded-full bg-[#DDE4EF]"><div className="h-full rounded-full bg-[#2874E8]" style={{ width: `${studyProgress ?? 0}%` }} /></div>
                  <div className="mt-4 break-keep rounded-2xl border border-[#A9CBFA] px-4 py-3 text-center text-sm font-black text-[#2874E8]">{studyStatus === "pending" ? "검토 대기" : studyStatus === "approved" ? "기록 보기" : "인증하기"}</div>
                </Link>
              </div>
            </section>

            <section className="mb-8">
              <SectionHeader title="오늘의 학습" href="/student/sprint/vocabulary" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {vocabulary?.available ? (
                  <Link href={sprintVocabularyPath} className="min-w-0 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E8AEA]"><Icon name="book" /></div><div className="min-w-0 flex-1"><p className="break-keep font-black text-[#10213D]">영단어 챌린지</p><p className="mt-1 break-keep text-sm font-semibold text-[#40516D]">DAY {vocabulary.day_number} · {vocabulary.question_count ?? "-"}문항</p></div></div>
                      {vocabulary.latest_score !== null && vocabulary.latest_score !== undefined ? <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[7px] border-[#2E7BEA] text-lg font-black text-[#2874E8]">{vocabulary.latest_score}점</div> : null}
                    </div>
                    <div className="mt-5 break-keep rounded-2xl bg-[#2874E8] px-4 py-3 text-center font-black text-white">{vocabulary.status === "draft" ? "이어하기" : vocabulary.status === "submitted" ? "결과 보기" : "시험 시작"}</div>
                  </Link>
                ) : (
                  <div className="min-w-0 rounded-[22px] bg-white/80 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.10)] ring-1 ring-[#DFEAF6]"><p className="break-keep font-black text-[#10213D]">영단어 챌린지</p><p className="mt-2 break-keep text-sm font-bold text-[#8CA0BD]">오늘 연결된 챌린지가 없어요.</p></div>
                )}
                {(() => {
                  const progress = data.progress_summary;
                  if (!progress?.available || progress.total === 0) {
                    return (
                      <div className="min-w-0 rounded-[22px] bg-white/80 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.10)] ring-1 ring-[#DFEAF6]">
                        <div className="flex min-w-0 items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E8AEA]"><Icon name="goals" /></div><div className="min-w-0 flex-1"><p className="break-keep font-black text-[#10213D]">SPRINT 진도표</p><p className="mt-1 break-keep text-sm font-semibold text-[#8CA0BD]">등록된 목표가 없습니다</p></div></div>
                        <p className="mt-3 break-keep text-xs font-semibold text-[#8CA0BD]">관리자가 목표를 등록하면 여기에 표시됩니다.</p>
                      </div>
                    );
                  }
                  return (
                    <Link href="/student/sprint/progress" className="min-w-0 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
                      <div className="flex min-w-0 items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E8AEA]"><Icon name="goals" /></div><div className="min-w-0 flex-1"><p className="break-keep font-black text-[#10213D]">SPRINT 진도표</p><p className="mt-1 break-keep text-sm font-semibold text-[#8CA0BD]">{progress.completed} / {progress.total} 완료 · {progress.completion_rate}%</p></div></div>
                      {progress.next_goal && (
                        <p className="mt-3 truncate break-keep text-xs font-bold text-[#2874E8]">다음 목표: {progress.next_goal.title} · {progress.next_goal.target_date}까지</p>
                      )}
                      <div className="mt-4 w-full break-keep rounded-2xl border border-[#A9CBFA] px-4 py-3 text-center font-black text-[#2874E8]">목표 보기</div>
                    </Link>
                  );
                })()}
              </div>
            </section>

            <section className="mb-8">
              <SectionHeader title="SPRINT 모의고사" href="/student/sprint/mock-exam-rounds" />
              {(() => {
                const mockRound = data.mock_round_summary;
                if (!mockRound?.available || mockRound.status === "none" || !mockRound.round) {
                  return (
                    <div className="min-w-0 rounded-[22px] bg-white/85 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.12)] ring-1 ring-[#DFEAF6]">
                      <div className="flex min-w-0 items-center gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E8AEA]"><Icon name="exam" /></div><div className="min-w-0 flex-1"><p className="break-keep text-sm font-black text-[#2874E8]">예정 없음</p><p className="mt-1 break-keep text-lg font-black text-[#10213D]">예정된 모의고사가 없어요.</p></div></div>
                    </div>
                  );
                }
                const round = mockRound.round;
                const participantLabel = mockRound.participant_status === "completed" ? "회차 완료" : mockRound.participant_status === "in_progress" ? "응시 중" : "응시 전";
                return (
                  <Link href={mockRound.path} className="block min-w-0 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E8AEA]"><Icon name="exam" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="break-keep text-sm font-black text-[#2874E8]">{round.round_no}회차 · {round.title}</p>
                        <p className="mt-1 break-keep text-lg font-black text-[#10213D]">{round.exam_date}</p>
                        <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">국어·수학·영어·탐구2 · {participantLabel}</p>
                      </div>
                      {mockRound.days_remaining !== undefined && mockRound.days_remaining >= 0 && (
                        <div className="shrink-0 text-lg font-black text-[#2874E8]">{mockRound.days_remaining === 0 ? "D-DAY" : `D-${mockRound.days_remaining}`}</div>
                      )}
                    </div>
                  </Link>
                );
              })()}
            </section>

            <section className="mb-8">
              <SectionHeader title="SPRINT 문제지" href="/student/sprint/worksheets" />
              {(() => {
                const worksheet = data.worksheet_summary;
                if (!worksheet?.available || worksheet.assigned_count === 0) {
                  return (
                    <div className="min-w-0 rounded-[22px] bg-white/85 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.12)] ring-1 ring-[#DFEAF6]">
                      <div className="flex min-w-0 items-center gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E8AEA]"><Icon name="doc" /></div><div className="min-w-0 flex-1"><p className="break-keep text-sm font-black text-[#2874E8]">배정 없음</p><p className="mt-1 break-keep text-lg font-black text-[#10213D]">배정된 문제지가 아직 없어요.</p></div></div>
                    </div>
                  );
                }
                const cta = worksheet.pending_action_count > 0 ? `제출 필요 ${worksheet.pending_action_count}건` : worksheet.in_review_count > 0 ? "검토 대기 중" : "모두 완료";
                return (
                  <Link href={worksheet.path} className="block min-w-0 rounded-[22px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#2E8AEA]"><Icon name="doc" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="break-keep text-sm font-black text-[#2874E8]">배정 {worksheet.assigned_count}건</p>
                        <p className="mt-1 break-keep text-lg font-black text-[#10213D]">{cta}</p>
                        <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">검토 중 {worksheet.in_review_count} · 승인 {worksheet.approved_count}</p>
                      </div>
                    </div>
                  </Link>
                );
              })()}
            </section>

            <section>
              <SectionHeader title="이번 주 누적 기록" href="/student/sprint/records" />
              <div className="grid grid-cols-2 overflow-hidden rounded-[22px] bg-white/90 shadow-[0_12px_28px_rgba(71,104,143,0.12)] ring-1 ring-[#DFEAF6] sm:grid-cols-5">
                {[
                  ["공부시간", minutesText(weekly?.study_minutes ?? 0), "clock"],
                  ["목표 달성일", `${weekly?.study_goal_achieved_days ?? 0}일`, "target"],
                  ["착석 인증", weekly?.seat_check_submitted_days === null ? "-" : `${weekly?.seat_check_submitted_days ?? 0}일`, "seat"],
                  ["플래너 제출", weekly?.planner_submitted_days === null ? "-" : `${weekly?.planner_submitted_days ?? 0}일`, "planner"],
                  ["영단어 평균", weekly?.vocabulary_average_score === null || weekly?.vocabulary_average_score === undefined ? "-" : `${weekly.vocabulary_average_score}점`, "book"],
                ].map(([label, value, icon]) => (
                  <div key={label} className="border-b border-r border-[#DFEAF6] p-4 text-center last:border-r-0 sm:border-b-0">
                    <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center text-[#2E8AEA]"><Icon name={icon as "clock"} /></div>
                    <p className="break-keep text-xs font-bold text-[#29415F]">{label}</p>
                    <p className="mt-2 break-keep text-xl font-black text-[#10213D]">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </ScreenShell>
  );
}
