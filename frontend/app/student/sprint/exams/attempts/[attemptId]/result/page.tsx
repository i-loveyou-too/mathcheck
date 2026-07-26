"use client";

import Link from "next/link";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { canShowNextGrade, displayGrade, hasGradeCut } from "../../../_lib/result-display";

type RecommendedQuestion = { score: number; count: number };
type GradeBoundary = { grade: number; score: number; type: string };

type Score = {
  score_group_id: number;
  score_group_code: string | null;
  score_group_name: string | null;
  raw_score: number;
  max_score: number;
  grade: number | null;
  correct_count: number;
  blank_count: number;
  next_grade?: number | null;
  points_to_next_grade?: number | null;
  recommended_question_combination?: RecommendedQuestion[];
  recommended_total_score?: number | null;
  recommended_question_count?: number | null;
  grade_boundaries?: GradeBoundary[];
};

type QuestionResult = {
  question_id: number;
  question_no: number;
  subject_code: string;
  subject_name: string;
  score_group_id: number;
  score_group_code: string;
  submitted_answer: string[];
  correct_answers?: string[];
  is_correct: boolean;
  awarded_points: number;
  max_points: number;
};

type ResultPayload = {
  result_status: "published";
  attempt: {
    id: number;
    assignment_id: number;
    attempt_no: number;
    status: string;
    submitted_at: string | null;
    scored_at: string | null;
  };
  assignment: { id: number; status: string; due_at: string | null };
  exam: { id: number; title: string; exam_date: string | null };
  summary: {
    raw_score: number;
    max_score: number;
    correct_count: number;
    incorrect_count: number;
    unanswered_count: number;
    total_question_count: number;
  };
  scores: Score[];
  questions: QuestionResult[];
};

type LoadNotice = {
  code: string;
  title: string;
  description: string;
  badge: string;
  tone: "waiting" | "error";
};

function detailCode(error: unknown) {
  const body = error instanceof ApiError ? error.body : null;
  const detail = body && typeof body === "object" && "detail" in body ? (body as { detail?: unknown }).detail : null;
  return detail && typeof detail === "object" && "code" in detail
    ? String((detail as { code?: unknown }).code ?? "")
    : "";
}

function loadNotice(error: unknown): LoadNotice {
  const code = detailCode(error);
  if (code === "RESULT_NOT_SCORED" || code === "RESULT_NOT_READY") {
    return {
      code,
      title: "결과를 계산하고 있어요",
      description: "제출은 완료되었습니다. 자동채점 결과를 잠시 후 다시 확인해주세요.",
      badge: "계산 중",
      tone: "waiting",
    };
  }
  if (code === "RESULT_NOT_PUBLISHED") {
    return {
      code,
      title: "결과 공개 준비 중",
      description: "자동채점은 완료되었지만 결과 공개 상태가 아직 반영되지 않았습니다.",
      badge: "준비 중",
      tone: "waiting",
    };
  }
  if (code === "RESULT_VOIDED") {
    return {
      code,
      title: "무효 처리된 응시입니다",
      description: "이 응시의 결과는 확인할 수 없습니다.",
      badge: "무효",
      tone: "error",
    };
  }
  if (error instanceof ApiError && error.status === 404) {
    return {
      code: "NOT_FOUND",
      title: "결과를 찾을 수 없어요",
      description: "시험 목록에서 응시 상태를 다시 확인해주세요.",
      badge: "404",
      tone: "error",
    };
  }
  if (error instanceof ApiError && error.status >= 500) {
    return {
      code: "SERVER_ERROR",
      title: "결과를 불러오지 못했어요",
      description: "서버에서 결과를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
      badge: "서버 오류",
      tone: "error",
    };
  }
  return {
    code: "LOAD_ERROR",
    title: "결과를 불러오지 못했어요",
    description: "네트워크 상태를 확인한 뒤 다시 시도해주세요.",
    badge: "오류",
    tone: "error",
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function answerText(values: string[] | undefined) {
  return values && values.length ? values.join(", ") : "-";
}

function combinationText(items: RecommendedQuestion[] | undefined, separator = " + ") {
  if (!items?.length) return "";
  return items.map((item) => `${item.score}점 문항 ${item.count}개`).join(separator);
}

function compactNextGradeText(score: Score) {
  if (!hasGradeCut(score)) return "등급컷 미등록";
  if (score.grade === 1) return "1등급 달성";
  if (!canShowNextGrade(score)) return "다음 등급 안내 없음";
  return `${score.points_to_next_grade}점 더 맞으면 ${score.next_grade}등급`;
}

function resultCounts(score: Score, questions: QuestionResult[]) {
  const groupQuestions = questions.filter((question) => question.score_group_id === score.score_group_id);
  const correct = groupQuestions.filter((question) => question.is_correct).length;
  const blank = groupQuestions.filter((question) => !question.submitted_answer?.length).length;
  const wrong = Math.max(groupQuestions.length - correct - blank, 0);
  return { correct, wrong, blank, total: groupQuestions.length };
}

function questionLabel(question: QuestionResult) {
  if (!question.submitted_answer?.length) return "미응답";
  return question.is_correct ? "정답" : "오답";
}

function questionTone(question: QuestionResult) {
  if (!question.submitted_answer?.length) return "bg-[#FFF6E2] text-[#9A6500]";
  return question.is_correct ? "bg-[#EAF8F1] text-[#17895E]" : "bg-[#FFF0F0] text-[#D94343]";
}

function StudentResultShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#EEF2F6]">
      <div className="relative mx-auto min-h-screen w-full max-w-[430px] bg-[#F6FAFF] shadow-[0_0_60px_rgba(0,0,0,0.07)] md:max-w-[760px] lg:max-w-[1180px] lg:shadow-none">
        <div className="w-full px-4 pb-32 pt-8 sm:px-5 sm:pt-10 lg:px-6">
          {children}
        </div>
      </div>
    </main>
  );
}

function ResultState({
  loading,
  notice,
  onRetry,
}: {
  loading: boolean;
  notice: LoadNotice | null;
  onRetry: () => void;
}) {
  return (
    <StudentResultShell>
      <section className="mx-auto mt-12 max-w-xl rounded-lg border border-[#DCEBFA] bg-white p-7 text-center sm:p-9">
        {loading ? (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#DCEBFA] border-t-[#2874E8]" />
            <h1 className="mt-5 text-xl font-black text-[#10213D]">결과를 불러오고 있어요</h1>
            <p className="mt-2 break-keep text-sm font-semibold leading-6 text-[#6E7F99]">잠시만 기다려주세요.</p>
          </>
        ) : (
          <>
            <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ${
              notice?.tone === "waiting" ? "bg-[#FFF6E2] text-[#A86B00]" : "bg-[#FFF0F0] text-[#D94343]"
            }`}>
              {notice?.badge ?? "오류"}
            </span>
            <h1 className="mt-5 break-keep text-2xl font-black text-[#10213D]">{notice?.title}</h1>
            <p className="mt-3 break-keep text-sm font-semibold leading-6 text-[#6E7F99]">{notice?.description}</p>
            <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={onRetry}
                className="h-11 rounded-lg bg-[#2874E8] px-6 text-sm font-black text-white"
              >
                다시 불러오기
              </button>
              <Link
                href="/student/sprint/exams"
                className="h-11 rounded-lg border border-[#B7D3F6] px-6 text-center text-sm font-black leading-[42px] text-[#2874E8]"
              >
                시험 목록
              </Link>
            </div>
          </>
        )}
      </section>
    </StudentResultShell>
  );
}

export default function StudentSprintExamResultPage() {
  const router = useRouter();
  const params = useParams<{ attemptId: string }>();
  const attemptId = Number(params.attemptId);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<LoadNotice | null>(null);
  const inFlightRequest = useRef<{ attemptId: number; promise: Promise<void> } | null>(null);

  const loadResult = useCallback(() => {
    if (inFlightRequest.current?.attemptId === attemptId) {
      return inFlightRequest.current.promise;
    }

    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      setResult(null);
      setNotice({
        code: "INVALID_ATTEMPT",
        title: "올바르지 않은 결과 주소예요",
        description: "시험 목록에서 결과를 다시 선택해주세요.",
        badge: "주소 오류",
        tone: "error",
      });
      setLoading(false);
      return Promise.resolve();
    }

    const request = (async () => {
      setLoading(true);
      setNotice(null);
      try {
        const payload = await apiFetch<ResultPayload>(
          `/student/sprint-exam-v2/attempts/${attemptId}/result`,
        );
        setResult(payload);
        setSelectedGroupId((current) => (
          payload.scores.some((score) => score.score_group_id === current)
            ? current
            : payload.scores[0]?.score_group_id ?? null
        ));
      } catch (error) {
        setResult(null);
        setNotice(loadNotice(error));
      } finally {
        setLoading(false);
      }
    })();

    inFlightRequest.current = { attemptId, promise: request };
    void request.finally(() => {
      if (inFlightRequest.current?.promise === request) {
        inFlightRequest.current = null;
      }
    });
    return request;
  }, [attemptId]);

  useEffect(() => {
    if (!getStudent()) {
      router.push("/login");
      return;
    }
    void loadResult();
  }, [loadResult, router]);

  const selectedScore = useMemo(() => {
    if (!result) return null;
    return result.scores.find((score) => score.score_group_id === selectedGroupId) ?? result.scores[0] ?? null;
  }, [result, selectedGroupId]);

  const selectedQuestions = useMemo(() => {
    if (!result || !selectedScore) return [];
    return result.questions.filter((question) => question.score_group_id === selectedScore.score_group_id);
  }, [result, selectedScore]);

  if (loading || !result) {
    return <ResultState loading={loading} notice={notice} onRetry={() => void loadResult()} />;
  }

  const selectedCounts = selectedScore ? resultCounts(selectedScore, result.questions) : null;
  const answerRate = selectedCounts?.total
    ? Math.round((selectedCounts.correct / selectedCounts.total) * 1000) / 10
    : 0;

  return (
    <StudentResultShell>
      <div className="w-full overflow-x-hidden text-[#10213D]">
        <div className="flex items-center justify-between gap-3">
          <Link href="/student/sprint/exams" className="shrink-0 text-sm font-black text-[#2874E8]">
            ← 목록으로
          </Link>
          <span className="shrink-0 rounded-full bg-[#EAF8F1] px-3 py-1.5 text-xs font-black text-[#17895E]">
            결과 공개 완료
          </span>
        </div>

        <header className="mt-5 rounded-lg border border-[#DCEBFA] bg-white p-5 sm:p-6">
          <p className="text-xs font-black tracking-[0.16em] text-[#2874E8]">SPRINT EXAM RESULT</p>
          <h1 className="mt-2 break-keep text-2xl font-black sm:text-3xl">SPRINT 모의고사 결과</h1>
          <p className="mt-2 break-keep text-base font-black text-[#45546C]">{result.exam.title}</p>
          <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-[#E8EEF6] pt-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-bold text-[#8290A6]">응시일</dt>
              <dd className="mt-1 whitespace-nowrap text-sm font-black">{result.exam.exam_date ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-[#8290A6]">제출 시각</dt>
              <dd className="mt-1 whitespace-nowrap text-sm font-black">{formatDateTime(result.attempt.submitted_at)}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-[#8290A6]">응시 과목 수</dt>
              <dd className="mt-1 whitespace-nowrap text-sm font-black">{result.scores.length}과목</dd>
            </div>
          </dl>
        </header>

        <section className="mt-5">
          <h2 className="text-base font-black">과목별 결과</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.scores.map((score) => {
              const active = selectedScore?.score_group_id === score.score_group_id;
              return (
                <button
                  key={score.score_group_id}
                  type="button"
                  onClick={() => setSelectedGroupId(score.score_group_id)}
                  className={`min-w-0 rounded-lg border bg-white p-5 text-left transition ${
                    active
                      ? "border-[#2874E8] ring-2 ring-[#C7DCFA]"
                      : "border-[#DCEBFA] hover:border-[#8DBAF3]"
                  }`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <h3 className="min-w-0 truncate text-base font-black">
                      {score.score_group_name ?? score.score_group_code ?? "과목"}
                    </h3>
                    <span aria-hidden="true" className="shrink-0 text-xl font-black text-[#2874E8]">›</span>
                  </div>
                  <p className="mt-5 whitespace-nowrap text-3xl font-black text-[#145FDB]">
                    {score.raw_score}
                    <span className="ml-1 text-sm font-bold text-[#6E7F99]">/ {score.max_score}</span>
                  </p>
                  <p className={`mt-3 inline-flex max-w-full whitespace-nowrap rounded-full px-3 py-1 text-sm font-black ${
                    hasGradeCut(score)
                      ? "bg-[#EAF5FF] text-[#2874E8]"
                      : "bg-[#F0F3F8] text-[#667085]"
                  }`}>
                    {displayGrade(score)}
                  </p>
                  {hasGradeCut(score) && (
                    <p className="mt-4 break-keep text-sm font-black leading-5 text-[#145FDB]">
                      {compactNextGradeText(score)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {selectedScore && selectedCounts && (
          <section className="mt-8">
            <div className="flex items-end justify-between gap-3 border-b border-[#DCEBFA] pb-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-[#2874E8]">과목 상세 결과</p>
                <h2 className="mt-1 truncate text-xl font-black sm:text-2xl">
                  {selectedScore.score_group_name ?? selectedScore.score_group_code ?? "과목"}
                </h2>
              </div>
              <span className="shrink-0 text-xs font-bold text-[#8290A6]">응시 #{result.attempt.attempt_no}</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <article className="rounded-lg border border-[#DCEBFA] bg-white p-5 sm:p-6">
                <p className="text-xs font-black text-[#8290A6]">점수</p>
                <p className="mt-3 whitespace-nowrap text-4xl font-black text-[#2874E8] sm:text-5xl">
                  {selectedScore.raw_score}
                  <span className="ml-1 text-lg font-bold text-[#6E7F99]">/ {selectedScore.max_score}</span>
                </p>
              </article>
              <article className="rounded-lg border border-[#DCEBFA] bg-white p-5 sm:p-6">
                <p className="text-xs font-black text-[#8290A6]">현재 등급</p>
                <p className={`mt-3 break-keep text-3xl font-black ${
                  hasGradeCut(selectedScore) ? "text-[#2874E8]" : "text-[#667085]"
                }`}>
                  {displayGrade(selectedScore)}
                </p>
              </article>
            </div>

            {hasGradeCut(selectedScore) ? (
              <article className="mt-4 rounded-lg border border-[#BFD8F8] bg-white p-5 sm:p-7">
                <p className="text-sm font-black text-[#45546C]">다음 등급까지 얼마나 남았을까?</p>
                {selectedScore.grade === 1 ? (
                  <p className="mt-4 break-keep text-2xl font-black text-[#145FDB] sm:text-3xl">
                    🎉 1등급을 달성했어요
                  </p>
                ) : canShowNextGrade(selectedScore) ? (
                  <>
                    <p className="mt-4 text-2xl font-black leading-tight text-[#145FDB] sm:text-3xl">
                      <span className="block">{selectedScore.points_to_next_grade}점 더 맞으면</span>
                      <span className="mt-1 block">{selectedScore.next_grade}등급이에요.</span>
                    </p>
                    {selectedScore.recommended_question_combination?.length ? (
                      <p className="mt-4 break-keep text-base font-black text-[#10213D] sm:text-lg">
                        {combinationText(selectedScore.recommended_question_combination)}
                      </p>
                    ) : null}
                    <p className="mt-3 break-keep text-sm font-semibold leading-6 text-[#6E7F99]">
                      오답 문항 중 위 배점 조합만큼 더 맞히면 다음 등급 컷에 도달할 수 있어요.
                    </p>
                  </>
                ) : (
                  <p className="mt-4 break-keep text-lg font-black text-[#667085]">
                    현재 점수에서는 다음 등급 안내를 계산할 수 없어요.
                  </p>
                )}
              </article>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["정답", selectedCounts.correct, "text-[#17895E]"],
                ["오답", selectedCounts.wrong, "text-[#D94343]"],
                ["미응답", selectedCounts.blank, "text-[#9A6500]"],
                ["정답률", `${answerRate}%`, "text-[#10213D]"],
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-lg border border-[#DCEBFA] bg-white p-4 text-center">
                  <p className="whitespace-nowrap text-xs font-bold text-[#8290A6]">{label}</p>
                  <p className={`mt-1 whitespace-nowrap text-xl font-black ${tone}`}>{value}</p>
                </div>
              ))}
            </div>

            <article className="mt-4 rounded-lg border border-[#DCEBFA] bg-white p-5 sm:p-6">
              <h3 className="text-base font-black">시험 정보</h3>
              <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["시험명", result.exam.title],
                  ["과목", selectedScore.score_group_name ?? "-"],
                  ["총 문항", `${selectedQuestions.length}문항`],
                  ["총 배점", `${selectedScore.max_score}점`],
                  ["응시일", result.exam.exam_date ?? "-"],
                  ["제출 시각", formatDateTime(result.attempt.submitted_at)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-bold text-[#8290A6]">{label}</dt>
                    <dd className="mt-1 break-keep font-black text-[#45546C]">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>

            <article className="mt-4 overflow-hidden rounded-lg border border-[#DCEBFA] bg-white">
              <div className="border-b border-[#EDF2F8] px-5 py-4 sm:px-6">
                <h3 className="text-base font-black">문항별 결과</h3>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {selectedQuestions.map((question) => (
                  <div
                    key={question.question_id}
                    className={`rounded-lg border p-4 ${
                      !question.submitted_answer?.length
                        ? "border-[#F2D79A] bg-[#FFF9EC]"
                        : question.is_correct
                          ? "border-[#DCEBFA] bg-white"
                          : "border-[#F4CACA] bg-[#FFF7F7]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="whitespace-nowrap text-base font-black">{question.question_no}번</p>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${questionTone(question)}`}>
                        {questionLabel(question)}
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-bold text-[#8290A6]">배점</dt>
                        <dd className="mt-1 whitespace-nowrap font-black">{question.max_points}점</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-[#8290A6]">획득 점수</dt>
                        <dd className="mt-1 whitespace-nowrap font-black">{question.awarded_points}점</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-[#8290A6]">내 답</dt>
                        <dd className="mt-1 break-words font-black">{answerText(question.submitted_answer)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-[#8290A6]">정답</dt>
                        <dd className="mt-1 break-words font-black text-[#2874E8]">{answerText(question.correct_answers)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="bg-[#F7FAFE] text-xs text-[#718097]">
                    <tr>
                      <th className="w-[11%] px-4 py-3">문항</th>
                      <th className="w-[11%] px-3 py-3">배점</th>
                      <th className="w-[22%] px-3 py-3">내 답</th>
                      <th className="w-[22%] px-3 py-3">정답</th>
                      <th className="w-[15%] px-3 py-3">결과</th>
                      <th className="w-[19%] px-4 py-3 text-right">획득 점수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDF2F8]">
                    {selectedQuestions.map((question) => (
                      <tr
                        key={question.question_id}
                        className={!question.submitted_answer?.length ? "bg-[#FFF9EC]" : question.is_correct ? "" : "bg-[#FFF7F7]"}
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-black">{question.question_no}번</td>
                        <td className="whitespace-nowrap px-3 py-3 font-bold text-[#52627A]">{question.max_points}점</td>
                        <td className="truncate px-3 py-3 font-black text-[#45546C]">{answerText(question.submitted_answer)}</td>
                        <td className="truncate px-3 py-3 font-black text-[#2874E8]">{answerText(question.correct_answers)}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${questionTone(question)}`}>
                            {questionLabel(question)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-black">
                          {question.awarded_points} / {question.max_points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="mt-4 rounded-lg border border-[#DCEBFA] bg-white p-5 sm:p-6">
              <h3 className="text-base font-black">등급컷</h3>
              {hasGradeCut(selectedScore) ? (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {selectedScore.grade_boundaries?.map((cut) => {
                    const current = cut.grade === selectedScore.grade;
                    return (
                      <div
                        key={`${cut.type}-${cut.grade}`}
                        className={`rounded-lg border px-3 py-2.5 text-center ${
                          current
                            ? "border-[#2874E8] bg-[#EAF5FF] text-[#145FDB]"
                            : "border-[#E2EAF3] bg-[#FAFCFF] text-[#52627A]"
                        }`}
                      >
                        <p className="whitespace-nowrap text-xs font-black">{cut.grade}등급</p>
                        <p className="mt-1 whitespace-nowrap text-sm font-black">{cut.score}점 이상</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 break-keep text-sm font-semibold text-[#6E7F99]">
                  등급컷이 아직 등록되지 않았어요.
                </p>
              )}
            </article>

            <article className="mt-4 rounded-lg border border-[#DCEBFA] bg-white p-5 sm:p-6">
              <h3 className="text-base font-black">다시 응시하기</h3>
              <p className="mt-2 break-keep text-sm font-semibold leading-6 text-[#6E7F99]">
                재응시는 관리자 승인 후 시험 상세 화면에서 시작할 수 있어요. 기존 결과는 그대로 보존됩니다.
              </p>
              <Link
                href={`/student/sprint/exams/${result.attempt.assignment_id}`}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg border border-[#A9CBFA] px-5 text-sm font-black text-[#2874E8] sm:w-auto"
              >
                시험 상세로 이동
              </Link>
            </article>
          </section>
        )}
      </div>
    </StudentResultShell>
  );
}
