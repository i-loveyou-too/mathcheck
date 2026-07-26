"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { ErrorPanel, ExamV2Shell, LoadingPanel, StatusBadge } from "./_components/exam-v2-shell";
import type { AssignmentListResponse, ExamV2Detail, ExamV2ListItem, ExamV2ListResponse } from "./_lib/types";
import { examStatusLabels, formatDate, friendlyApiError, statusTone } from "./_lib/ui";

type ExamRow = ExamV2ListItem & {
  status: string;
  assignmentCount: number;
  submittedCount: number;
  scoredCount: number;
  publishedCount: number;
};

type PublicationResponse = { publication: { status: string } };

export default function AdminSprintExamV2ListPage() {
  const params = useParams<{ id: string }>();
  const sprintId = Number(params.id);
  const router = useRouter();
  const [rows, setRows] = useState<ExamRow[] | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    setRows(null);
    try {
      const exams = await apiFetch<ExamV2ListResponse>("/admin/sprint-exam-v2/exams?limit=100&offset=0");
      const enriched = await Promise.all(
        exams.items.map(async (exam): Promise<ExamRow> => {
          const [detail, assignments] = await Promise.all([
            apiFetch<ExamV2Detail>(`/admin/sprint-exam-v2/exams/${exam.id}`),
            apiFetch<AssignmentListResponse>(`/admin/sprint-exam-v2/assignments?exam_id=${exam.id}&limit=100&offset=0`),
          ]);
          const latestAttempts = assignments.items.map((item) => item.latest_attempt).filter((attempt) => attempt !== null);
          const publicationStates = await Promise.all(
            latestAttempts.map((attempt) =>
              apiFetch<PublicationResponse>(`/admin/sprint-exam-v2/attempts/${attempt.id}/publication`)
                .then((result) => result.publication.status)
                .catch(() => "unpublished"),
            ),
          );
          return {
            ...exam,
            status: detail.exam.status,
            assignmentCount: assignments.total ?? assignments.items.length,
            submittedCount: latestAttempts.filter((attempt) => attempt.status === "submitted" || attempt.status === "scored").length,
            scoredCount: latestAttempts.filter((attempt) => attempt.status === "scored").length,
            publishedCount: publicationStates.filter((status) => status === "published").length,
          };
        }),
      );
      setRows(enriched);
    } catch (reason) {
      setRows([]);
      setError(friendlyApiError(reason, "모의고사 목록을 불러오지 못했습니다."));
    }
  }, []);

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load();
  }, [load, router]);

  const visibleRows = useMemo(() => {
    return (rows ?? [])
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .slice()
      .sort((a, b) => {
        const left = a.exam_date ?? "";
        const right = b.exam_date ?? "";
        return sortDirection === "desc" ? right.localeCompare(left) : left.localeCompare(right);
      });
  }, [rows, sortDirection, statusFilter]);

  const deleteExam = async (row: ExamRow) => {
    if (row.assignmentCount > 0) {
      setError("학생 배정이 있는 시험은 삭제할 수 없습니다. 배정과 응시 기록을 먼저 확인해주세요.");
      return;
    }
    if (!window.confirm(`"${row.title}" 시험을 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingId(row.id);
    setError("");
    try {
      await apiFetch(`/admin/sprint-exam-v2/exams/${row.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(friendlyApiError(reason, "시험을 삭제하지 못했습니다."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ExamV2Shell
      sprintId={sprintId}
      title="모의고사 목록"
      description="Sprint Exam V2 시험 세트와 배정·제출·채점·공개 현황을 관리합니다."
      actions={
        <Link href={`/admin/sprints/${sprintId}/exam-v2/new`} className="rounded-md bg-[#2874E8] px-4 py-2.5 text-sm font-black text-white shadow-sm">
          + 새 시험 만들기
        </Link>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#DEE6EF] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <label className="text-xs font-black text-[#66758C]">
            <span className="sr-only">상태 필터</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border border-[#DCE4ED] bg-white px-3 text-xs font-black text-[#45546C]"
            >
              <option value="all">전체 상태</option>
              <option value="draft">작성 중</option>
              <option value="ready">배정 가능</option>
              <option value="active">진행 중</option>
              <option value="closed">종료</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSortDirection((current) => (current === "desc" ? "asc" : "desc"))}
            className="h-10 rounded-md border border-[#DCE4ED] bg-white px-3 text-xs font-black text-[#45546C]"
          >
            시험일 {sortDirection === "desc" ? "최신순 ↓" : "오래된순 ↑"}
          </button>
        </div>
        <p className="text-xs font-bold text-[#7C8AA0]">표시 {visibleRows.length}개</p>
      </div>

      {error && <div className="mt-4"><ErrorPanel message={error} onRetry={() => void load()} /></div>}
      {rows === null && <div className="mt-4"><LoadingPanel label="시험 목록을 불러오는 중..." /></div>}

      {rows !== null && !error && visibleRows.length === 0 && (
        <section className="mt-4 rounded-lg border border-[#DFE7F0] bg-white px-5 py-16 text-center shadow-sm">
          <p className="text-base font-black text-[#52627A]">등록된 모의고사가 없습니다.</p>
          <Link href={`/admin/sprints/${sprintId}/exam-v2/new`} className="mt-4 inline-flex rounded-md bg-[#2874E8] px-4 py-2.5 text-sm font-black text-white">
            첫 시험 만들기
          </Link>
        </section>
      )}

      {visibleRows.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-lg border border-[#DFE7F0] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left">
              <thead className="bg-[#F6F8FB] text-[11px] font-black text-[#718097]">
                <tr>
                  <th className="px-4 py-3">시험명</th>
                  <th className="px-3 py-3">시험일</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="px-3 py-3 text-center">과목</th>
                  <th className="px-3 py-3 text-center">배정</th>
                  <th className="px-3 py-3 text-center">제출</th>
                  <th className="px-3 py-3 text-center">채점</th>
                  <th className="px-3 py-3 text-center">공개</th>
                  <th className="px-3 py-3">생성일</th>
                  <th className="px-4 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF1F5]">
                {visibleRows.map((row) => (
                  <tr key={row.id} className="text-sm hover:bg-[#FAFCFE]">
                    <td className="px-4 py-4">
                      <Link href={`/admin/sprints/${sprintId}/exam-v2/${row.id}`} className="font-black text-[#17213B] hover:text-[#2874E8]">
                        {row.title}
                      </Link>
                      <p className="mt-1 text-xs font-semibold text-[#8A97AA]">{row.source_label || "회차명 없음"}</p>
                    </td>
                    <td className="px-3 py-4 font-bold text-[#52627A]">{formatDate(row.exam_date)}</td>
                    <td className="px-3 py-4">
                      <StatusBadge status={row.status} label={examStatusLabels[row.status] ?? row.status} tone={statusTone(row.status)} />
                    </td>
                    <td className="px-3 py-4 text-center font-black text-[#45546C]">{row.score_group_count}</td>
                    <td className="px-3 py-4 text-center font-black text-[#45546C]">{row.assignmentCount}</td>
                    <td className="px-3 py-4 text-center font-black text-[#6549BE]">{row.submittedCount}</td>
                    <td className="px-3 py-4 text-center font-black text-[#17895E]">{row.scoredCount}</td>
                    <td className="px-3 py-4 text-center font-black text-[#2874E8]">{row.publishedCount}</td>
                    <td className="px-3 py-4 text-xs font-bold text-[#7C8AA0]">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/admin/sprints/${sprintId}/exam-v2/${row.id}`} className="rounded-md bg-[#EAF3FF] px-2.5 py-2 text-xs font-black text-[#2874E8]">상세</Link>
                        <Link href={`/admin/sprints/${sprintId}/exam-v2/${row.id}/edit`} className="rounded-md bg-[#F1F3F6] px-2.5 py-2 text-xs font-black text-[#52627A]">수정</Link>
                        <button
                          type="button"
                          onClick={() => void deleteExam(row)}
                          disabled={deletingId === row.id}
                          title={row.assignmentCount > 0 ? "배정이 있는 시험은 삭제할 수 없습니다." : "시험 삭제"}
                          className="rounded-md bg-red-50 px-2.5 py-2 text-xs font-black text-red-600 disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="mt-3 text-xs font-semibold text-[#8290A6]">
        보관(archive)은 현재 backend에서 지원하지 않습니다. 배정이 없는 시험만 물리 삭제할 수 있습니다.
      </p>
    </ExamV2Shell>
  );
}
