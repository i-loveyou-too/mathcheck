"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type SubjectArea = "korean" | "math" | "english" | "inquiry" | string;

type TrendPoint = {
  attempt_id: number;
  exam_title: string;
  exam_date: string | null;
  raw_score: number;
  max_score: number;
  grade: number | null;
  score_change: number | null;
  grade_change: number | null;
  previous_grade: number | null;
};

type ScoreTrend = {
  score_group_code: string | null;
  score_group_name: string | null;
  subject_area: SubjectArea | null;
  history: TrendPoint[];
  latest_score: number;
  previous_score: number | null;
  score_change: number | null;
  latest_grade: number | null;
  previous_grade: number | null;
  grade_change: number | null;
  highest_score: number;
  average_score: number;
};

type QuestionWrongCount = { question_no: number; wrong_count: number };
type WrongHistory = {
  attempt_id: number;
  exam_title: string;
  exam_date: string | null;
  question_numbers: number[];
};

type WeakPart = {
  rank: number | null;
  subject_area: SubjectArea;
  subject_name: string;
  part_name: string;
  status_label: string;
  wrong_count: number;
  recent_wrong_count: number;
  repeated_question_count: number;
  question_wrong_counts: QuestionWrongCount[];
  wrong_history_by_exam: WrongHistory[];
};

type AttemptScore = {
  score_group_code: string | null;
  score_group_name: string | null;
  subject_area: SubjectArea | null;
  raw_score: number;
  max_score: number;
  grade: number | null;
  correct_count: number;
  incorrect_count: number | null;
};

type Attempt = {
  attempt_id: number;
  exam_title: string;
  exam_date: string | null;
  total_score: number;
  total_max_score: number;
  scores: AttemptScore[];
};

type AnalysisPayload = {
  student: { id: number; name: string | null; grade: string | null };
  analysis_source: { attempt_count: number; limit: number };
  weak_part_analysis: {
    priority_items: WeakPart[];
    high_difficulty_items: WeakPart[];
  };
  score_group_trends: ScoreTrend[];
  attempts: Attempt[];
};

const SUBJECTS = [
  { key: "korean", label: "국어" },
  { key: "math", label: "수학" },
  { key: "english", label: "영어" },
] as const;

function changeText(value: number | null, suffix = "") {
  if (value === null) return "-";
  if (value > 0) return `+${value}${suffix}`;
  return `${value}${suffix}`;
}

function gradeText(value: number | null) {
  return value ? `${value}등급` : "-";
}

function gradeChangeText(point: TrendPoint) {
  if (!point.previous_grade || !point.grade) return "-";
  return `${point.previous_grade}등급 → ${point.grade}등급`;
}

function dateText(value: string | null) {
  return value ?? "-";
}

function numberChipText(item: QuestionWrongCount) {
  return `${item.question_no}번 ${item.wrong_count}회`;
}

function subjectLabel(area: SubjectArea | null | undefined) {
  if (area === "korean") return "국어";
  if (area === "math") return "수학";
  if (area === "english") return "영어";
  if (area === "inquiry") return "탐구";
  return "과목";
}

function EmptyState({ message, backHref }: { message: string; backHref: string }) {
  return (
    <main className="min-h-screen bg-[#F4F6FA] px-5 py-8 pb-32">
      <div className="mx-auto max-w-3xl">
        <Link href={backHref} className="text-sm font-black text-[#2874E8]">돌아가기</Link>
        <section className="mt-8 rounded-[28px] bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-black text-[#17213B]">전체 성적 분석</h1>
          <p className="mt-3 break-keep text-sm font-bold text-[#667085]">{message}</p>
        </section>
      </div>
    </main>
  );
}

function SectionTitle({ title, caption }: { title: string; caption?: string }) {
  return (
    <div>
      <h2 className="text-xl font-black text-[#17213B]">{title}</h2>
      {caption ? <p className="mt-1 break-keep text-sm font-semibold text-[#7C8799]">{caption}</p> : null}
    </div>
  );
}

function StatusPill() {
  return (
    <span className="rounded-full bg-[#EAF5FF] px-3 py-1 text-xs font-black text-[#2874E8]">
      보완 필요
    </span>
  );
}

function PrioritySection({ items, attemptCount }: { items: WeakPart[]; attemptCount: number }) {
  const topItems = items.slice(0, 3);
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-sm sm:p-6">
      <SectionTitle title="현재 우선 보완 파트" caption="최근 모의고사 오답이 누적된 순서입니다." />
      {topItems.length === 0 ? (
        <p className="mt-5 text-sm font-bold text-[#98A2B3]">분석할 취약 파트가 아직 없습니다.</p>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {topItems.map((item, index) => (
            <article key={`${item.subject_area}-${item.part_name}`} className="rounded-[22px] border border-[#DCEBFA] bg-[#FBFCFE] p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#10213D] text-sm font-black text-white">
                  {index + 1}
                </span>
                <StatusPill />
              </div>
              <p className="mt-4 text-sm font-black text-[#2874E8]">{item.subject_name}</p>
              <h3 className="mt-1 break-keep text-xl font-black text-[#17213B]">{item.part_name}</h3>
              <p className="mt-3 text-sm font-bold text-[#667085]">
                최근 {attemptCount}회 · 총 {item.wrong_count}회 오답
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WeakPartCard({ item, attemptCount }: { item: WeakPart; attemptCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-[24px] border border-[#EEF2F7] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[#17213B]">{item.subject_name} {item.part_name}</h3>
          <p className="mt-2 text-sm font-bold text-[#667085]">
            최근 {attemptCount}회 · 총 {item.wrong_count}회 오답
          </p>
        </div>
        <StatusPill />
      </div>

      <div className="mt-5">
        <p className="text-xs font-black text-[#7C8799]">반복 오답</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {item.question_wrong_counts.length ? item.question_wrong_counts.map((count) => (
            <span key={count.question_no} className="rounded-full bg-[#F4F6FA] px-3 py-1.5 text-xs font-black text-[#52627A]">
              {numberChipText(count)}
            </span>
          )) : <span className="text-sm font-bold text-[#98A2B3]">-</span>}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-5 flex h-10 w-full items-center justify-between rounded-2xl bg-[#F8FAFC] px-4 text-sm font-black text-[#2874E8]"
      >
        <span>시험별 오답 이력</span>
        <span>{open ? "접기" : "펼치기"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-2">
          {item.wrong_history_by_exam.map((history) => (
            <div key={history.attempt_id} className="rounded-[18px] bg-[#FBFCFE] px-4 py-3">
              <p className="text-sm font-black text-[#17213B]">{history.exam_title}</p>
              <p className="mt-1 text-xs font-semibold text-[#98A2B3]">{dateText(history.exam_date)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {history.question_numbers.map((number) => (
                  <span key={number} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#52627A] ring-1 ring-[#E2E8F0]">
                    {number}번
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function SubjectWeaknessSection({ items, highDifficultyItems, attemptCount }: {
  items: WeakPart[];
  highDifficultyItems: WeakPart[];
  attemptCount: number;
}) {
  const [active, setActive] = useState<(typeof SUBJECTS)[number]["key"]>("korean");
  const filtered = items.filter((item) => item.subject_area === active);
  const highDifficulty = active === "math" ? highDifficultyItems : [];

  return (
    <section className="rounded-[28px] bg-white p-5 shadow-sm sm:p-6">
      <SectionTitle title="과목별 취약 파트" caption="탐구는 번호별 취약 분석에서 제외하고 성적 변화만 표시합니다." />
      <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-[#F4F6FA] p-1">
        {SUBJECTS.map((subject) => (
          <button
            key={subject.key}
            type="button"
            onClick={() => setActive(subject.key)}
            className={`h-10 rounded-xl text-sm font-black transition ${
              active === subject.key ? "bg-white text-[#2874E8] shadow-sm" : "text-[#667085]"
            }`}
          >
            {subject.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {filtered.map((item) => (
          <WeakPartCard key={`${item.subject_area}-${item.part_name}`} item={item} attemptCount={attemptCount} />
        ))}
        {highDifficulty.map((item) => (
          <article key={item.part_name} className="rounded-[24px] border border-[#E2E8F0] bg-[#FBFCFE] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-[#17213B]">고난도 문항 오답</h3>
                <p className="mt-2 text-sm font-bold text-[#667085]">일반 취약 파트 우선순위에서는 제외됨</p>
              </div>
              <span className="rounded-full bg-[#F0F3F8] px-3 py-1 text-xs font-black text-[#52627A]">별도 표시</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.question_wrong_counts.map((count) => (
                <span key={count.question_no} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#52627A] ring-1 ring-[#E2E8F0]">
                  {numberChipText(count)}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      {filtered.length === 0 && highDifficulty.length === 0 ? (
        <p className="mt-5 rounded-[20px] bg-[#F8FAFC] px-4 py-8 text-center text-sm font-bold text-[#98A2B3]">
          표시할 취약 파트가 없습니다.
        </p>
      ) : null}
    </section>
  );
}

function GraphSection({ trends }: { trends: ScoreTrend[] }) {
  const [mode, setMode] = useState<"score" | "grade">("score");
  const [selectedCode, setSelectedCode] = useState<string | null>(trends[0]?.score_group_code ?? null);
  const selected = trends.find((trend) => trend.score_group_code === selectedCode) ?? trends[0] ?? null;
  const points = selected?.history ?? [];
  const width = 560;
  const height = 170;
  const maxScore = Math.max(...points.map((point) => point.max_score || 0), 1);
  const plotted = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : 24 + (index * (width - 48)) / (points.length - 1);
    const rawY = mode === "score"
      ? height - 20 - (point.raw_score / maxScore) * (height - 40)
      : 20 + (((point.grade ?? 9) - 1) / 8) * (height - 40);
    return { ...point, x, y: Math.min(Math.max(rawY, 18), height - 18) };
  });
  const path = plotted.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <section className="rounded-[28px] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle title="성적 변화 그래프" caption="점수와 등급 변화를 과목별로 확인합니다." />
        <div className="flex gap-2">
          {(["score", "grade"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`h-9 rounded-xl px-4 text-xs font-black ${mode === value ? "bg-[#2874E8] text-white" : "bg-[#F4F6FA] text-[#667085]"}`}
            >
              {value === "score" ? "점수" : "등급"}
            </button>
          ))}
        </div>
      </div>

      {trends.length === 0 ? (
        <p className="mt-5 text-sm font-bold text-[#98A2B3]">성적 변화 데이터가 없습니다.</p>
      ) : (
        <>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {trends.map((trend) => (
              <button
                key={trend.score_group_code ?? trend.score_group_name}
                type="button"
                onClick={() => setSelectedCode(trend.score_group_code)}
                className={`h-10 shrink-0 rounded-2xl px-4 text-xs font-black ${
                  selected?.score_group_code === trend.score_group_code ? "bg-[#10213D] text-white" : "bg-[#F4F6FA] text-[#52627A]"
                }`}
              >
                {trend.score_group_name ?? subjectLabel(trend.subject_area)}
              </button>
            ))}
          </div>

          <div className="mt-5 overflow-x-auto rounded-[22px] bg-[#FBFCFE] p-4">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-[210px] min-w-[560px] w-full">
              <line x1="24" y1={height - 20} x2={width - 24} y2={height - 20} stroke="#DCEBFA" strokeWidth="2" />
              <line x1="24" y1="20" x2="24" y2={height - 20} stroke="#DCEBFA" strokeWidth="2" />
              {path ? <path d={path} fill="none" stroke="#2874E8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}
              {plotted.map((point) => (
                <g key={point.attempt_id}>
                  <circle cx={point.x} cy={point.y} r="6" fill="#2874E8" />
                  <text x={point.x} y={point.y - 12} textAnchor="middle" className="fill-[#17213B] text-[11px] font-black">
                    {mode === "score" ? `${point.raw_score}` : gradeText(point.grade)}
                  </text>
                  <text x={point.x} y={height - 4} textAnchor="middle" className="fill-[#667085] text-[10px] font-bold">
                    {point.exam_date ?? point.exam_title}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {points.map((point) => (
              <div key={point.attempt_id} className="rounded-[18px] bg-[#F8FAFC] px-4 py-3">
                <p className="font-black text-[#17213B]">{point.exam_title}</p>
                <p className="mt-1 text-xs font-semibold text-[#98A2B3]">{dateText(point.exam_date)}</p>
                <p className="mt-2 text-sm font-bold text-[#52627A]">
                  {point.raw_score}점 · {gradeText(point.grade)}
                </p>
                <p className="mt-1 text-xs font-bold text-[#2874E8]">
                  이전 시험 대비 {changeText(point.score_change, "점")} · {gradeChangeText(point)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AttemptsSection({ attempts }: { attempts: Attempt[] }) {
  const [openAttemptId, setOpenAttemptId] = useState<number | null>(attempts[attempts.length - 1]?.attempt_id ?? null);
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-sm sm:p-6">
      <SectionTitle title="시험별 성적 내역" caption="시험을 눌러 과목별 결과를 확인합니다." />
      <div className="mt-5 space-y-3">
        {[...attempts].reverse().map((attempt) => {
          const open = openAttemptId === attempt.attempt_id;
          return (
            <article key={attempt.attempt_id} className="rounded-[22px] border border-[#EEF2F7]">
              <button
                type="button"
                onClick={() => setOpenAttemptId(open ? null : attempt.attempt_id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div>
                  <h3 className="font-black text-[#17213B]">{attempt.exam_title}</h3>
                  <p className="mt-1 text-xs font-semibold text-[#98A2B3]">{dateText(attempt.exam_date)}</p>
                </div>
                <p className="text-sm font-black text-[#2874E8]">{attempt.total_score}/{attempt.total_max_score}</p>
              </button>
              {open ? (
                <div className="border-t border-[#EEF2F7] px-5 py-4">
                  <div className="grid gap-2 lg:grid-cols-2">
                    {attempt.scores.map((score) => (
                      <div key={score.score_group_code ?? score.score_group_name} className="rounded-[18px] bg-[#F8FAFC] px-4 py-3">
                        <p className="text-sm font-black text-[#17213B]">{score.score_group_name ?? subjectLabel(score.subject_area)}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold text-[#667085] sm:grid-cols-4">
                          <span>점수 {score.raw_score}/{score.max_score}</span>
                          <span>{gradeText(score.grade)}</span>
                          <span>맞은 개수 {score.correct_count}</span>
                          <span>틀린 개수 {score.incorrect_count ?? "-"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function SprintExamAnalysisView({
  endpoint,
  backHref,
  emptyMessage = "분석할 수 있는 모의고사 결과가 아직 없습니다.",
}: {
  endpoint: string;
  backHref: string;
  emptyMessage?: string;
}) {
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError("");
    void apiFetch<AnalysisPayload>(endpoint)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "분석 데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [endpoint]);

  const attemptCount = data?.analysis_source.attempt_count ?? 0;
  const priorities = useMemo(() => data?.weak_part_analysis.priority_items ?? [], [data]);

  if (loading) {
    return <EmptyState backHref={backHref} message="분석 데이터를 불러오는 중입니다." />;
  }

  if (error) {
    return <EmptyState backHref={backHref} message={error} />;
  }

  if (!data || attemptCount === 0) {
    return <EmptyState backHref={backHref} message={emptyMessage} />;
  }

  return (
    <main className="min-h-screen bg-[#F4F6FA] px-5 py-8 pb-32">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link href={backHref} className="text-sm font-black text-[#2874E8]">돌아가기</Link>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#667085]">
            분석 대상 최근 {attemptCount}회
          </span>
        </div>

        <header className="rounded-[28px] bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-black text-[#2874E8]">{data.student.name ?? "학생"}</p>
          <h1 className="mt-2 text-2xl font-black text-[#17213B]">전체 성적 분석</h1>
        </header>

        <PrioritySection items={priorities} attemptCount={attemptCount} />
        <SubjectWeaknessSection
          items={priorities}
          highDifficultyItems={data.weak_part_analysis.high_difficulty_items}
          attemptCount={attemptCount}
        />
        <GraphSection trends={data.score_group_trends} />
        <AttemptsSection attempts={data.attempts} />
      </div>
    </main>
  );
}
