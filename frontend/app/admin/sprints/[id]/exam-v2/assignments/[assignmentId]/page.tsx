"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { ErrorPanel, ExamV2Shell, LoadingPanel, StatusBadge } from "../../_components/exam-v2-shell";
import type { AdminAttemptDetail, AssignmentDetail, AttemptSummary } from "../../_lib/types";
import { assignmentStatusLabels, formatDateTime, friendlyApiError, statusTone } from "../../_lib/ui";

function answerLabel(value: unknown[]) {
  if (!value || value.length === 0) return "미응답";
  return value.map((item) => String(item)).join(", ");
}

function attemptDisplayLabel(attempt: Pick<AttemptSummary, "attempt_no" | "retake_approval_id">) {
  if (attempt.retake_approval_id != null) return `답안 재입력 ${Math.max(attempt.attempt_no - 1, 1)}회차`;
  return "최초 응시";
}

export default function AdminSprintExamV2AssignmentDetailPage() {
  const params = useParams<{ id: string; assignmentId: string }>();
  const sprintId = Number(params.id);
  const assignmentId = Number(params.assignmentId);
  const router = useRouter();
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<number | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<AdminAttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [retakeActionLoading, setRetakeActionLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<AssignmentDetail>(`/admin/sprint-exam-v2/assignments/${assignmentId}`);
      setDetail(result);
      setSelectedAttemptId((current) => current ?? result.latest_attempt?.id ?? null);
    } catch (reason) {
      setError(friendlyApiError(reason, "학생 배정 상세를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load();
  }, [load, router]);

  useEffect(() => {
    if (!selectedAttemptId) {
      setAttemptDetail(null);
      return;
    }
    setAttemptLoading(true);
    setError("");
    void apiFetch<AdminAttemptDetail>(`/admin/sprint-exam-v2/attempts/${selectedAttemptId}`)
      .then(setAttemptDetail)
      .catch((reason) => setError(friendlyApiError(reason, "응시 상세를 불러오지 못했습니다.")))
      .finally(() => setAttemptLoading(false));
  }, [selectedAttemptId]);

  const papersByGroup = useMemo(() => {
    if (!detail) return [];
    const groups = new Map<string, typeof detail.papers>();
    detail.papers.forEach((paper) => groups.set(paper.score_group_code, [...(groups.get(paper.score_group_code) ?? []), paper]));
    return Array.from(groups.entries());
  }, [detail]);

  const hasCompletedAttempt = detail?.attempts.some((attempt) => attempt.status === "submitted" || attempt.status === "scored") ?? false;
  const startedRetakeAttempt = detail?.attempts.find((attempt) => attempt.retake_approval_id != null && attempt.status === "started");
  const canOpenRetake = Boolean(
    detail &&
      hasCompletedAttempt &&
      !detail.assignment.has_started_attempt &&
      detail.assignment.available_retake_approval_count === 0,
  );

  const openRetake = async () => {
    if (!detail) return;
    setRetakeActionLoading(true);
    setError("");
    try {
      await apiFetch("/admin/sprint-exam-v2/retake-approvals", {
        method: "POST",
        body: { assignment_id: detail.assignment.id },
      });
      await load();
    } catch (reason) {
      setError(friendlyApiError(reason, "재응시 열어주기에 실패했습니다."));
    } finally {
      setRetakeActionLoading(false);
    }
  };

  const cancelRetake = async (approvalId: number) => {
    if (!window.confirm("아직 시작하지 않은 재응시 승인을 취소할까요?")) return;
    setRetakeActionLoading(true);
    setError("");
    try {
      await apiFetch(`/admin/sprint-exam-v2/retake-approvals/${approvalId}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(friendlyApiError(reason, "재응시 승인 취소에 실패했습니다."));
    } finally {
      setRetakeActionLoading(false);
    }
  };

  if (loading && !detail) {
    return (
      <ExamV2Shell sprintId={sprintId} title="학생별 배정 상세">
        <LoadingPanel />
      </ExamV2Shell>
    );
  }

  return (
    <ExamV2Shell
      sprintId={sprintId}
      title={detail ? `${detail.student.name} · 응시 상세` : "학생별 배정 상세"}
      description={detail ? `${detail.exam.title} · 배정 #${detail.assignment.id}` : undefined}
      actions={
        detail ? (
          <Link href={`/admin/sprints/${sprintId}/exam-v2/${detail.exam.id}/assignments`} className="rounded-md border border-[#D6E0EA] bg-white px-4 py-2.5 text-sm font-black text-[#52627A]">
            배정 관리
          </Link>
        ) : null
      }
    >
      {error && <ErrorPanel message={error} onRetry={() => void load()} />}

      {detail && (
        <>
          <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-[#17213B]">학생 정보</h2>
              <p className="mt-4 text-lg font-black text-[#10213D]">{detail.student.name}</p>
              <p className="mt-1 text-xs font-bold text-[#8290A6]">{detail.student.grade} · 학생 #{detail.student.id}</p>
              <dl className="mt-4 space-y-2 text-xs">
                {[
                  ["국어", detail.student.korean_elective],
                  ["수학", detail.student.math_elective],
                  ["탐구 1", detail.student.inquiry_subject_1],
                  ["탐구 2", detail.student.inquiry_subject_2],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b border-[#EDF1F5] pb-2">
                    <dt className="font-bold text-[#8290A6]">{label}</dt>
                    <dd className="text-right font-black text-[#45546C]">{value || "미설정"}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-[#17213B]">배정 정보</h2>
                  <p className="mt-2 text-lg font-black text-[#10213D]">{detail.exam.title}</p>
                  <p className="mt-1 text-xs font-bold text-[#8290A6]">시험일 {detail.exam.exam_date || "-"} · 재응시는 필요할 때 1회씩 열어주세요</p>
                </div>
                <div className="flex gap-2">
                  <StatusBadge
                    status={detail.assignment.status}
                    label={assignmentStatusLabels[detail.assignment.status] ?? detail.assignment.status}
                    tone={statusTone(detail.assignment.status)}
                  />
                  <StatusBadge
                    status={detail.assignment.computed_status}
                    label={assignmentStatusLabels[detail.assignment.computed_status] ?? detail.assignment.computed_status}
                    tone={statusTone(detail.assignment.computed_status)}
                  />
                </div>
              </div>
              <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-md bg-[#F5F8FB] px-3 py-3"><dt className="font-bold text-[#8290A6]">응시 가능</dt><dd className="mt-1 font-black text-[#45546C]">{formatDateTime(detail.assignment.available_from)}</dd></div>
                <div className="rounded-md bg-[#F5F8FB] px-3 py-3"><dt className="font-bold text-[#8290A6]">제출 마감</dt><dd className="mt-1 font-black text-[#45546C]">{formatDateTime(detail.assignment.due_at)}</dd></div>
                <div className="rounded-md bg-[#F5F8FB] px-3 py-3"><dt className="font-bold text-[#8290A6]">재응시 승인</dt><dd className="mt-1 font-black text-[#45546C]">{detail.assignment.available_retake_approval_count > 0 ? "열림" : startedRetakeAttempt ? "진행 중" : "없음"}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                {canOpenRetake && (
                  <button
                    type="button"
                    onClick={() => void openRetake()}
                    disabled={retakeActionLoading}
                    className="rounded-md bg-[#2874E8] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                  >
                    {retakeActionLoading ? "처리 중..." : "재응시 열어주기"}
                  </button>
                )}
                {detail.assignment.available_retake_approval_count > 0 && !startedRetakeAttempt && (
                  <>
                    <span className="inline-flex rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-600">재응시 대기 중</span>
                    <button
                      type="button"
                      onClick={() => detail.assignment.available_retake_approval_id != null && void cancelRetake(detail.assignment.available_retake_approval_id)}
                      disabled={retakeActionLoading || detail.assignment.available_retake_approval_id == null}
                      className="rounded-md bg-red-50 px-4 py-2.5 text-sm font-black text-red-600 disabled:opacity-50"
                    >
                      {retakeActionLoading ? "처리 중..." : "재응시 열림 취소"}
                    </button>
                  </>
                )}
                {startedRetakeAttempt && (
                  <span className="inline-flex rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-600">재입력 진행 중</span>
                )}
                {!canOpenRetake && detail.assignment.available_retake_approval_count === 0 && !startedRetakeAttempt && (
                  <span className="inline-flex rounded-full bg-[#F0F3F8] px-3 py-2 text-xs font-black text-[#667085]">
                    {hasCompletedAttempt ? "재응시 닫힘" : "제출 후 재응시 가능"}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-[#17213B]">배정 시험지</h2>
                <p className="mt-1 text-xs font-semibold text-[#8290A6]">선택과목 snapshot 기준으로 고정된 시험지입니다.</p>
              </div>
              <span className="text-xs font-black text-[#52627A]">{detail.papers.length}개</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {papersByGroup.map(([code, papers]) => (
                <div key={code} className="rounded-md border border-[#E3EAF2] px-3 py-3">
                  <p className="text-xs font-black text-[#2874E8]">{papers[0]?.score_group_name}</p>
                  <p className="mt-2 text-sm font-black text-[#17213B]">{papers.map((paper) => paper.subject_name).join(" + ")}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 overflow-hidden rounded-lg border border-[#DFE7F0] bg-white shadow-sm">
            <div className="border-b border-[#E8EDF3] px-5 py-4">
              <h2 className="text-sm font-black text-[#17213B]">응시 이력</h2>
            </div>
            {detail.attempts.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm font-bold text-[#8290A6]">아직 응시 기록이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-[#F7F9FB] font-black text-[#718097]"><tr><th className="px-4 py-3">회차</th><th className="px-3 py-3">상태</th><th className="px-3 py-3">시작</th><th className="px-3 py-3">제출</th><th className="px-3 py-3">채점</th><th className="px-4 py-3 text-right">확인</th></tr></thead>
                  <tbody className="divide-y divide-[#EDF1F5]">
                    {detail.attempts.map((attempt) => (
                      <tr key={attempt.id} className={selectedAttemptId === attempt.id ? "bg-[#F2F8FF]" : ""}>
                        <td className="px-4 py-3 font-black text-[#17213B]">{attemptDisplayLabel(attempt)}</td>
                        <td className="px-3 py-3"><StatusBadge status={attempt.status} label={assignmentStatusLabels[attempt.status] ?? attempt.status} tone={statusTone(attempt.status)} /></td>
                        <td className="px-3 py-3 font-semibold text-[#687995]">{formatDateTime(attempt.started_at)}</td>
                        <td className="px-3 py-3 font-semibold text-[#687995]">{formatDateTime(attempt.submitted_at)}</td>
                        <td className="px-3 py-3 font-semibold text-[#687995]">{formatDateTime(attempt.scored_at)}</td>
                        <td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedAttemptId(attempt.id)} className="rounded-md bg-[#EDF5FF] px-3 py-2 font-black text-[#2874E8]">답안 보기</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {attemptLoading && <div className="mt-5"><LoadingPanel label="응시 답안을 불러오는 중..." /></div>}

          {!attemptLoading && attemptDetail && (
            <section className="mt-5 overflow-hidden rounded-lg border border-[#DFE7F0] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8EDF3] px-5 py-4">
                <div>
                  <h2 className="text-sm font-black text-[#17213B]">{attemptDisplayLabel(attemptDetail.attempt)} 답안</h2>
                  <p className="mt-1 text-xs font-semibold text-[#8290A6]">
                    응답 {attemptDetail.summary.answered_count}/{attemptDetail.summary.total_question_count}
                    {attemptDetail.attempt.status === "scored" ? ` · ${attemptDetail.summary.raw_score}/${attemptDetail.summary.max_score}점` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={attemptDetail.attempt.status} label={assignmentStatusLabels[attemptDetail.attempt.status] ?? attemptDetail.attempt.status} tone={statusTone(attemptDetail.attempt.status)} />
                  <StatusBadge status={attemptDetail.publication.status} label={attemptDetail.publication.status === "published" ? "결과 공개" : "결과 미공개"} tone={statusTone(attemptDetail.publication.status)} />
                </div>
              </div>

              {attemptDetail.scores.length > 0 && (
                <div className="grid gap-2 border-b border-[#E8EDF3] p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {attemptDetail.scores.map((score) => (
                    <div key={score.score_group_id} className="rounded-md bg-[#F5F8FB] px-3 py-3">
                      <p className="text-xs font-bold text-[#8290A6]">{score.score_group_name}</p>
                      <p className="mt-1 text-lg font-black text-[#17213B]">{score.raw_score} / {score.max_score}</p>
                      <p className="mt-1 text-[11px] font-black text-[#2874E8]">{score.grade ? `${score.grade}등급` : "등급 없음"}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead className="bg-[#F7F9FB] font-black text-[#718097]"><tr><th className="px-4 py-3">과목</th><th className="px-3 py-3">문항</th><th className="px-3 py-3">학생 답안</th><th className="px-3 py-3">정답</th><th className="px-3 py-3">정오</th><th className="px-3 py-3 text-right">점수</th></tr></thead>
                  <tbody className="divide-y divide-[#EDF1F5]">
                    {attemptDetail.questions.map((question) => (
                      <tr key={question.question_id}>
                        <td className="px-4 py-3 font-bold text-[#52627A]">{question.subject_name}</td>
                        <td className="px-3 py-3 font-black text-[#17213B]">{question.question_no}</td>
                        <td className={`px-3 py-3 font-black ${question.submitted_answer.length ? "text-[#45546C]" : "text-red-500"}`}>{answerLabel(question.submitted_answer)}</td>
                        <td className="px-3 py-3 font-black text-[#2874E8]">{question.correct_answers.join(", ")}</td>
                        <td className={`px-3 py-3 font-black ${question.is_correct ? "text-emerald-600" : "text-red-500"}`}>{question.is_correct ? "정답" : "오답"}</td>
                        <td className="px-3 py-3 text-right font-black">{question.awarded_points} / {question.max_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </ExamV2Shell>
  );
}
