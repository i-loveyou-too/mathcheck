"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { ErrorPanel, ExamV2Shell, LoadingPanel, StatusBadge } from "../_components/exam-v2-shell";
import type { AssignmentListItem, AssignmentListResponse, ExamV2Detail } from "../_lib/types";
import { assignmentStatusLabels, examStatusLabels, formatDate, formatDateTime, friendlyApiError, statusTone } from "../_lib/ui";

export default function AdminSprintExamV2DetailPage() {
  const params = useParams<{ id: string; examId: string }>();
  const sprintId = Number(params.id);
  const examId = Number(params.examId);
  const router = useRouter();
  const [detail, setDetail] = useState<ExamV2Detail | null>(null);
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [exam, assignmentResult] = await Promise.all([
        apiFetch<ExamV2Detail>(`/admin/sprint-exam-v2/exams/${examId}`),
        apiFetch<AssignmentListResponse>(`/admin/sprint-exam-v2/assignments?exam_id=${examId}&limit=100&offset=0`),
      ]);
      setDetail(exam);
      setAssignments(assignmentResult.items);
    } catch (reason) {
      setError(friendlyApiError(reason, "시험 상세를 불러오지 못했습니다."));
    }
  }, [examId]);

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load();
  }, [load, router]);

  const summary = useMemo(() => {
    const latest = assignments.map((item) => item.latest_attempt).filter((attempt) => attempt !== null);
    return {
      total: assignments.length,
      notStarted: assignments.filter((item) => !item.latest_attempt).length,
      started: latest.filter((attempt) => attempt.status === "started").length,
      submitted: latest.filter((attempt) => attempt.status === "submitted").length,
      scored: latest.filter((attempt) => attempt.status === "scored").length,
    };
  }, [assignments]);

  const deleteExam = async () => {
    if (!detail) return;
    if (assignments.length > 0) {
      setError("학생 배정이 있는 시험은 삭제할 수 없습니다.");
      return;
    }
    if (!window.confirm(`"${detail.exam.title}" 시험을 완전히 삭제할까요?`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/sprint-exam-v2/exams/${examId}`, { method: "DELETE" });
      router.push(`/admin/sprints/${sprintId}/exam-v2`);
    } catch (reason) {
      setError(friendlyApiError(reason, "시험을 삭제하지 못했습니다."));
    } finally {
      setDeleting(false);
    }
  };

  if (!detail && !error) {
    return (
      <ExamV2Shell sprintId={sprintId} title="시험 상세">
        <LoadingPanel />
      </ExamV2Shell>
    );
  }

  return (
    <ExamV2Shell
      sprintId={sprintId}
      title={detail?.exam.title ?? "시험 상세"}
      description={detail ? `${formatDate(detail.exam.exam_date)} · ${detail.exam.source_label || "회차명 없음"}` : undefined}
      actions={
        detail ? (
          <>
            <Link href={`/admin/sprints/${sprintId}/exam-v2/${examId}/assignments`} className="rounded-md bg-[#2874E8] px-4 py-2.5 text-sm font-black text-white">
              학생 배정
            </Link>
            <Link href={`/admin/sprints/${sprintId}/exam-v2/${examId}/edit`} className="rounded-md border border-[#D6E0EA] bg-white px-4 py-2.5 text-sm font-black text-[#52627A]">
              시험 수정
            </Link>
          </>
        ) : null
      }
    >
      {error && <ErrorPanel message={error} onRetry={() => void load()} />}

      {detail && (
        <>
          <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["전체 배정", summary.total, "text-[#17213B]"],
              ["미응시", summary.notStarted, "text-[#D2604A]"],
              ["응시 중", summary.started, "text-[#B87300]"],
              ["제출 완료", summary.submitted, "text-[#6549BE]"],
              ["채점 완료", summary.scored, "text-[#17895E]"],
              ["결과 공개", "개별 확인", "text-[#2874E8]"],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-lg border border-[#DFE7F0] bg-white px-4 py-4 shadow-sm">
                <p className="text-xs font-bold text-[#8290A6]">{label}</p>
                <p className={`mt-2 text-xl font-black ${tone}`}>{value}</p>
              </div>
            ))}
          </section>

          <section className="mt-5 rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-[#17213B]">시험 정보</h2>
                  <StatusBadge status={detail.exam.status} label={examStatusLabels[detail.exam.status] ?? detail.exam.status} tone={statusTone(detail.exam.status)} />
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#687995]">{detail.exam.description || "등록된 설명이 없습니다."}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <dt className="font-bold text-[#8290A6]">생성일</dt>
                <dd className="font-black text-[#52627A]">{formatDateTime(detail.exam.created_at)}</dd>
                <dt className="font-bold text-[#8290A6]">수정일</dt>
                <dd className="font-black text-[#52627A]">{formatDateTime(detail.exam.updated_at)}</dd>
              </dl>
            </div>
          </section>

          <section className="mt-5 overflow-hidden rounded-lg border border-[#DFE7F0] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8EDF3] px-5 py-4">
              <div>
                <h2 className="text-base font-black text-[#17213B]">과목 · 시험지 구성</h2>
                <p className="mt-1 text-xs font-semibold text-[#8290A6]">
                  점수 그룹 {detail.total_score_group_count}개 · 시험지 {detail.total_paper_count}개 · 문항 {detail.total_question_count}개
                </p>
              </div>
              <Link href={`/admin/sprints/${sprintId}/exam-v2/${examId}/edit`} className="rounded-md bg-[#EDF5FF] px-3 py-2 text-xs font-black text-[#2874E8]">
                구성 수정
              </Link>
            </div>

            <div className="divide-y divide-[#E8EDF3]">
              {detail.score_groups.map((group) => (
                <div key={group.id ?? group.score_group_code} className="px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-black text-[#17213B]">{group.score_group_name}</h3>
                        <span className="rounded-full bg-[#F0F3F7] px-2 py-0.5 text-[10px] font-black text-[#687995]">
                          {group.aggregation_type === "sum" ? "공통 + 선택 합산" : "독립 점수"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-[#8290A6]">
                        학생 기준 만점 {group.assignment_max_score ?? "확인 필요"}점
                        {group.grade_cuts.length > 0 ? ` · 등급컷 ${group.grade_cuts.length}개` : " · 등급컷 없음"}
                      </p>
                    </div>
                    <p className="text-xs font-black text-[#52627A]">{group.papers.length}개 시험지</p>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left text-xs">
                      <thead className="bg-[#F7F9FB] font-black text-[#718097]">
                        <tr>
                          <th className="px-3 py-2.5">과목명</th>
                          <th className="px-3 py-2.5">구분</th>
                          <th className="px-3 py-2.5 text-center">문항</th>
                          <th className="px-3 py-2.5 text-center">총점</th>
                          <th className="px-3 py-2.5">시험지 PDF</th>
                          <th className="px-3 py-2.5">영어 MP3</th>
                          <th className="px-3 py-2.5">해설지</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EDF1F5]">
                        {group.papers.map((paper) => (
                          <tr key={paper.id ?? `${paper.subject_code}-${paper.slot ?? ""}`}>
                            <td className="px-3 py-3">
                              <p className="font-black text-[#17213B]">{paper.subject_name}</p>
                              <p className="mt-0.5 font-mono text-[10px] text-[#8A97AA]">{paper.subject_code}</p>
                            </td>
                            <td className="px-3 py-3 font-bold text-[#52627A]">
                              {paper.paper_role === "common" ? "공통" : paper.paper_role === "elective" ? "선택" : paper.paper_role === "inquiry_slot" ? paper.slot === "inquiry_1" ? "탐구 1" : "탐구 2" : "독립"}
                            </td>
                            <td className="px-3 py-3 text-center font-black text-[#45546C]">{paper.question_count}</td>
                            <td className="px-3 py-3 text-center font-black text-[#45546C]">{paper.paper_max_score}</td>
                            <td className="px-3 py-3 text-[#9A6B16]">업로드 API 미지원</td>
                            <td className="px-3 py-3 text-[#9A6B16]">{paper.subject_code === "english" ? "업로드 API 미지원" : "-"}</td>
                            <td className="px-3 py-3 text-[#9A6B16]">업로드 API 미지원</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <details className="mt-3 rounded-md border border-[#E5EBF2] bg-[#FAFCFE]">
                    <summary className="cursor-pointer px-3 py-2.5 text-xs font-black text-[#52627A]">정답·배점·등급컷 확인</summary>
                    <div className="border-t border-[#E5EBF2] p-3">
                      {group.grade_cuts.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {group.grade_cuts.map((cut) => (
                            <span key={`${cut.cut_type}-${cut.grade}`} className="rounded-md bg-[#EAF3FF] px-2 py-1 text-[11px] font-black text-[#2874E8]">
                              {cut.grade}등급 {cut.min_score}점 이상
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="grid gap-3 lg:grid-cols-2">
                        {group.papers.map((paper) => (
                          <div key={`questions-${paper.id ?? paper.subject_code}`} className="min-w-0">
                            <p className="mb-2 text-xs font-black text-[#45546C]">{paper.subject_name}</p>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[360px] text-xs">
                                <thead className="text-[#8290A6]"><tr><th className="py-1 text-left">번호</th><th className="py-1 text-left">유형</th><th className="py-1 text-left">정답</th><th className="py-1 text-right">배점</th></tr></thead>
                                <tbody className="divide-y divide-[#EDF1F5]">
                                  {paper.questions.map((question) => (
                                    <tr key={question.id ?? question.question_no}>
                                      <td className="py-1.5 font-black">{question.question_no}</td>
                                      <td className="py-1.5">{question.question_type === "choice" ? "객관식" : "단답형"}</td>
                                      <td className="py-1.5 font-black text-[#2874E8]">{question.correct_answers.join(", ")}</td>
                                      <td className="py-1.5 text-right font-black">{question.score}점</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 overflow-hidden rounded-lg border border-[#DFE7F0] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8EDF3] px-5 py-4">
              <div>
                <h2 className="text-base font-black text-[#17213B]">학생별 배정 · 응시 현황</h2>
                <p className="mt-1 text-xs font-semibold text-[#8290A6]">배정된 학생의 최신 attempt를 표시합니다.</p>
              </div>
              <Link href={`/admin/sprints/${sprintId}/exam-v2/${examId}/assignments`} className="rounded-md bg-[#2874E8] px-3 py-2 text-xs font-black text-white">
                배정 관리
              </Link>
            </div>
            {assignments.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm font-bold text-[#8290A6]">아직 배정된 학생이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-xs">
                  <thead className="bg-[#F7F9FB] font-black text-[#718097]">
                    <tr><th className="px-4 py-3">학생</th><th className="px-3 py-3">배정 상태</th><th className="px-3 py-3">응시 상태</th><th className="px-3 py-3">제출 시각</th><th className="px-3 py-3">선택 시험지</th><th className="px-4 py-3 text-right">관리</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDF1F5]">
                    {assignments.map((assignment) => {
                      const latest = assignment.latest_attempt;
                      const state = latest?.status ?? assignment.computed_status;
                      return (
                        <tr key={assignment.id}>
                          <td className="px-4 py-3 font-black text-[#17213B]">{assignment.student_name || `학생 #${assignment.student_id}`}</td>
                          <td className="px-3 py-3"><StatusBadge status={assignment.status} label={assignmentStatusLabels[assignment.status] ?? assignment.status} tone={statusTone(assignment.status)} /></td>
                          <td className="px-3 py-3"><StatusBadge status={state} label={assignmentStatusLabels[state] ?? state} tone={statusTone(state)} /></td>
                          <td className="px-3 py-3 font-semibold text-[#687995]">{formatDateTime(latest?.submitted_at)}</td>
                          <td className="px-3 py-3 font-bold text-[#52627A]">{assignment.paper_count}개</td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/admin/sprints/${sprintId}/exam-v2/assignments/${assignment.id}`} className="rounded-md bg-[#EDF5FF] px-3 py-2 font-black text-[#2874E8]">상세</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-white px-5 py-4">
            <div>
              <h2 className="text-sm font-black text-[#17213B]">시험 삭제</h2>
              <p className="mt-1 text-xs font-semibold text-[#8290A6]">배정이 없는 시험만 물리 삭제할 수 있습니다. 보관 기능은 지원되지 않습니다.</p>
            </div>
            <button
              type="button"
              onClick={() => void deleteExam()}
              disabled={deleting || assignments.length > 0}
              className="rounded-md bg-red-50 px-4 py-2.5 text-xs font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? "삭제 중..." : "시험 삭제"}
            </button>
          </section>
        </>
      )}
    </ExamV2Shell>
  );
}
