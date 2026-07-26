"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { ErrorPanel, ExamV2Shell, LoadingPanel, StatusBadge } from "../../_components/exam-v2-shell";
import type { AdminAttemptDetail, AssignmentDetail } from "../../_lib/types";
import { formatDateTime, friendlyApiError, statusTone } from "../../_lib/ui";

type RecommendedQuestion = { score: number; count: number };
type ScoreWithAdvice = AdminAttemptDetail["scores"][number] & {
  next_grade?: number | null;
  points_to_next_grade?: number | null;
  recommended_question_combination?: RecommendedQuestion[];
  recommended_total_score?: number | null;
  recommended_question_count?: number | null;
};

function answerLabel(value: unknown[]) {
  return value?.length ? value.map((item) => String(item)).join(", ") : "-";
}

function gradeLabel(grade: number | null | undefined) {
  return grade ? `${grade}등급` : "등급컷 미등록";
}

function combinationText(items: RecommendedQuestion[] | undefined) {
  if (!items?.length) return "-";
  return items.map((item) => `${item.score}점 ${item.count}개`).join(" + ");
}

function nextGradeText(score: ScoreWithAdvice) {
  if (score.grade === 1) return "달성";
  if (!score.next_grade || score.points_to_next_grade === null || score.points_to_next_grade === undefined) return "-";
  return `${score.points_to_next_grade}점`;
}

function logApiError(endpoint: string, reason: unknown) {
  console.error("[Sprint Exam V2 admin result] API request failed", {
    endpoint,
    status: reason instanceof Error && "status" in reason ? (reason as { status?: unknown }).status : null,
    body: reason instanceof Error && "body" in reason ? (reason as { body?: unknown }).body : null,
    error: reason,
  });
}

export default function AdminSprintExamV2ResultDetailPage() {
  const params = useParams<{ id: string; assignmentId: string }>();
  const sprintId = Number(params.id);
  const assignmentId = Number(params.assignmentId);
  const router = useRouter();
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<AdminAttemptDetail | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const assignmentEndpoint = `/admin/sprint-exam-v2/assignments/${assignmentId}`;
    let currentEndpoint = assignmentEndpoint;
    try {
      const assignment = await apiFetch<AssignmentDetail>(assignmentEndpoint);
      setDetail(assignment);
      const attemptId = selectedAttemptId ?? assignment.latest_attempt?.id ?? null;
      setSelectedAttemptId(attemptId);
      if (attemptId) {
        const attemptEndpoint = `/admin/sprint-exam-v2/attempts/${attemptId}`;
        currentEndpoint = attemptEndpoint;
        const attempt = await apiFetch<AdminAttemptDetail>(attemptEndpoint);
        setAttemptDetail(attempt);
      } else {
        setAttemptDetail(null);
      }
    } catch (reason) {
      logApiError(currentEndpoint, reason);
      setError(friendlyApiError(reason, "학생 결과 상세를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, selectedAttemptId]);

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load();
  }, [load, router]);

  useEffect(() => {
    if (!selectedAttemptId) return;
    const endpoint = `/admin/sprint-exam-v2/attempts/${selectedAttemptId}`;
    void apiFetch<AdminAttemptDetail>(endpoint)
      .then(setAttemptDetail)
      .catch((reason) => {
        logApiError(endpoint, reason);
        setError(friendlyApiError(reason, "attempt 상세를 불러오지 못했습니다."));
      });
  }, [selectedAttemptId]);

  const scores = (attemptDetail?.scores ?? []) as ScoreWithAdvice[];
  const questionsByGroup = useMemo(() => {
    const map = new Map<number, AdminAttemptDetail["questions"]>();
    for (const question of attemptDetail?.questions ?? []) {
      map.set(question.score_group_id, [...(map.get(question.score_group_id) ?? []), question]);
    }
    return map;
  }, [attemptDetail]);

  const approveRetake = async () => {
    if (!detail) return;
    if (!window.confirm("이 학생에게 재응시를 승인할까요? 기존 결과는 삭제되지 않고 새 attempt로 남습니다.")) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/admin/sprint-exam-v2/retake-approvals", {
        method: "POST",
        body: { assignment_id: detail.assignment.id, reason: "result_management_retake" },
      });
      await load();
    } catch (reason) {
      setError(friendlyApiError(reason, "재응시 승인을 처리하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detail) {
    return (
      <ExamV2Shell sprintId={sprintId} title="학생 결과 상세">
        <LoadingPanel />
      </ExamV2Shell>
    );
  }

  return (
    <ExamV2Shell
      sprintId={sprintId}
      title={detail ? `${detail.student.name} 학생 결과 상세` : "학생 결과 상세"}
      description={detail ? `${detail.exam.title} · 배정 #${detail.assignment.id}` : undefined}
      actions={<Link href={`/admin/sprints/${sprintId}/exam-v2/results`} className="rounded-md border border-[#D6E0EA] bg-white px-4 py-2.5 text-sm font-black text-[#52627A]">목록으로</Link>}
    >
      {error && <ErrorPanel message={error} onRetry={() => void load()} />}

      {detail && (
        <>
          <section className="rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black text-[#2874E8]">결과 관리 · 학생 상세</p>
                <h2 className="mt-2 text-xl font-black text-[#10213D]">{detail.student.name}</h2>
                <p className="mt-1 text-sm font-bold text-[#8290A6]">{detail.exam.title}</p>
              </div>
              <button type="button" onClick={() => void approveRetake()} disabled={busy} className="rounded-md bg-[#2874E8] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                재응시 승인
              </button>
            </div>
            <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-4">
              <div><dt className="font-bold text-[#8290A6]">제출 과목</dt><dd className="mt-1 font-black text-[#10213D]">{scores.length}과목</dd></div>
              <div><dt className="font-bold text-[#8290A6]">최근 제출</dt><dd className="mt-1 font-black text-[#10213D]">{formatDateTime(attemptDetail?.attempt.submitted_at)}</dd></div>
              <div><dt className="font-bold text-[#8290A6]">총점</dt><dd className="mt-1 font-black text-[#10213D]">{attemptDetail?.attempt.status === "scored" ? `${attemptDetail.summary.raw_score} / ${attemptDetail.summary.max_score}` : attemptDetail ? "채점 전" : "-"}</dd></div>
              <div><dt className="font-bold text-[#8290A6]">공개 상태</dt><dd className="mt-1"><StatusBadge status={attemptDetail?.publication.status ?? "none"} label={attemptDetail?.publication.status === "published" ? "공개 완료" : "미공개"} tone={statusTone(attemptDetail?.publication.status ?? "none")} /></dd></div>
            </dl>
          </section>

          {detail.attempts.length > 0 && (
            <section className="mt-4 rounded-lg border border-[#DFE7F0] bg-white p-4 shadow-sm">
              <p className="text-sm font-black text-[#10213D]">attempt 선택</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.attempts.map((attempt) => (
                  <button key={attempt.id} type="button" onClick={() => setSelectedAttemptId(attempt.id)} className={`rounded-md px-3 py-2 text-xs font-black ${attempt.id === selectedAttemptId ? "bg-[#2874E8] text-white" : "bg-[#EFF4FA] text-[#52627A]"}`}>
                    #{attempt.attempt_no} {attempt.status}
                  </button>
                ))}
              </div>
            </section>
          )}

          {!attemptDetail && (
            <section className="mt-4 rounded-lg border border-[#DFE7F0] bg-white p-10 text-center text-sm font-bold text-[#8290A6] shadow-sm">
              아직 응시 결과가 없습니다.
            </section>
          )}

          {attemptDetail && (
            <>
              <section className="mt-4 overflow-hidden rounded-lg border border-[#DFE7F0] bg-white shadow-sm">
                <div className="border-b border-[#E8EDF3] px-5 py-4">
                  <h2 className="text-sm font-black text-[#17213B]">과목별 요약</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-xs">
                    <thead className="bg-[#F7F9FB] font-black text-[#718097]">
                      <tr><th className="px-4 py-3">과목</th><th className="px-3 py-3">점수 / 총점</th><th className="px-3 py-3">등급</th><th className="px-3 py-3">다음 등급까지</th><th className="px-3 py-3">추천 문항 조합</th><th className="px-3 py-3">정답 / 오답 / 미응답</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDF1F5]">
                      {scores.map((score) => {
                        const questions = questionsByGroup.get(score.score_group_id) ?? [];
                        const correct = questions.filter((question) => question.is_correct).length;
                        const blank = questions.filter((question) => !question.submitted_answer.length).length;
                        const wrong = Math.max(questions.length - correct - blank, 0);
                        return (
                          <tr key={score.score_group_id}>
                            <td className="px-4 py-3 font-black text-[#17213B]">{score.score_group_name}</td>
                            <td className="px-3 py-3 font-black text-[#2874E8]">{score.raw_score} / {score.max_score}</td>
                            <td className="px-3 py-3 font-black text-[#45546C]">{gradeLabel(score.grade)}</td>
                            <td className="px-3 py-3 font-bold text-[#52627A]">{nextGradeText(score)}</td>
                            <td className="px-3 py-3 font-bold text-[#52627A]">{combinationText(score.recommended_question_combination)}</td>
                            <td className="px-3 py-3 font-bold text-[#52627A]">{correct} / {wrong} / {blank}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mt-4 overflow-hidden rounded-lg border border-[#DFE7F0] bg-white shadow-sm">
                <div className="border-b border-[#E8EDF3] px-5 py-4">
                  <h2 className="text-sm font-black text-[#17213B]">문항별 상세</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="bg-[#F7F9FB] font-black text-[#718097]">
                      <tr><th className="px-4 py-3">과목</th><th className="px-3 py-3">문항</th><th className="px-3 py-3">학생 답안</th><th className="px-3 py-3">정답</th><th className="px-3 py-3">결과</th><th className="px-3 py-3 text-right">획득 점수</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDF1F5]">
                      {attemptDetail.questions.map((question) => (
                        <tr key={question.question_id} className={!question.submitted_answer.length ? "bg-[#FFF9EC]" : question.is_correct ? "" : "bg-[#FFF5F5]"}>
                          <td className="px-4 py-3 font-bold text-[#52627A]">{question.subject_name}</td>
                          <td className="px-3 py-3 font-black text-[#17213B]">{question.question_no}</td>
                          <td className="px-3 py-3 font-black text-[#45546C]">{answerLabel(question.submitted_answer)}</td>
                          <td className="px-3 py-3 font-black text-[#2874E8]">{question.correct_answers.join(", ")}</td>
                          <td className={`px-3 py-3 font-black ${!question.submitted_answer.length ? "text-[#9A6500]" : question.is_correct === null ? "text-[#8290A6]" : question.is_correct ? "text-emerald-600" : "text-red-500"}`}>{!question.submitted_answer.length ? "미응답" : question.is_correct === null ? "미채점" : question.is_correct ? "정답" : "오답"}</td>
                          <td className="px-3 py-3 text-right font-black">{question.awarded_points === null ? "-" : question.awarded_points} / {question.max_points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </ExamV2Shell>
  );
}
