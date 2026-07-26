"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { ErrorPanel, ExamV2Shell, LoadingPanel, StatusBadge } from "../_components/exam-v2-shell";
import type { AssignmentListItem, AssignmentListResponse, ExamV2ListResponse } from "../_lib/types";
import { formatDateTime, friendlyApiError, statusTone } from "../_lib/ui";

type ExamOption = { id: number; title: string; exam_date: string | null };
type PublicationResponse = { publication: { status: string; published_at: string | null } };
type Row = AssignmentListItem & { publication_status: string; published_at: string | null };

function attemptLabel(status: string | null | undefined) {
  if (!status) return "미응시";
  if (status === "started") return "작성 중";
  if (status === "submitted") return "결과 계산 중";
  if (status === "scored") return "자동채점 완료";
  if (status === "voided") return "무효";
  return status;
}

function rowSubjectStatus(row: Row, subject: string) {
  if (subject === "all") return true;
  return row.latest_attempt?.status === "scored" || row.latest_attempt?.status === "submitted";
}

export default function AdminSprintExamV2ResultsPage() {
  const params = useParams<{ id: string }>();
  const sprintId = Number(params.id);
  const router = useRouter();
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [error, setError] = useState("");

  const loadExams = useCallback(async () => {
    const result = await apiFetch<ExamV2ListResponse>("/admin/sprint-exam-v2/exams?limit=100&offset=0");
    const next = result.items.map((item) => ({ id: item.id, title: item.title, exam_date: item.exam_date }));
    setExams(next);
    setExamId((current) => current ?? next[0]?.id ?? null);
  }, []);

  const loadRows = useCallback(async (selectedExamId: number) => {
    setRows(null);
    setError("");
    try {
      const assignments = await apiFetch<AssignmentListResponse>(`/admin/sprint-exam-v2/assignments?exam_id=${selectedExamId}&limit=100&offset=0`);
      const enriched = await Promise.all(
        assignments.items.map(async (row): Promise<Row> => {
          if (!row.latest_attempt) return { ...row, publication_status: "none", published_at: null };
          return apiFetch<PublicationResponse>(`/admin/sprint-exam-v2/attempts/${row.latest_attempt.id}/publication`)
            .then((result) => ({ ...row, publication_status: result.publication.status, published_at: result.publication.published_at }))
            .catch(() => ({ ...row, publication_status: "unknown", published_at: null }));
        }),
      );
      setRows(enriched);
    } catch (reason) {
      setRows([]);
      setError(friendlyApiError(reason, "모의고사 결과 목록을 불러오지 못했습니다."));
    }
  }, []);

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void loadExams().catch((reason) => setError(friendlyApiError(reason, "시험 목록을 불러오지 못했습니다.")));
  }, [loadExams, router]);

  useEffect(() => {
    if (examId) void loadRows(examId);
  }, [examId, loadRows]);

  const visibleRows = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      const matchesStudent = !query || (row.student_name ?? "").toLowerCase().includes(query);
      const status = row.latest_attempt?.status ?? "not_started";
      const matchesStatus = statusFilter === "all" || statusFilter === status || (statusFilter === "published" && row.publication_status === "published");
      return matchesStudent && matchesStatus && rowSubjectStatus(row, subjectFilter);
    });
  }, [rows, statusFilter, studentQuery, subjectFilter]);

  const summary = useMemo(() => {
    const source = rows ?? [];
    const submitted = source.filter((row) => row.latest_attempt?.status === "submitted" || row.latest_attempt?.status === "scored").length;
    const scored = source.filter((row) => row.latest_attempt?.status === "scored").length;
    const published = source.filter((row) => row.publication_status === "published").length;
    const firstGradeRate = 0;
    return { total: source.length, submitted, unsubmitted: Math.max(source.length - submitted, 0), scored, published, firstGradeRate };
  }, [rows]);

  return (
    <ExamV2Shell
      sprintId={sprintId}
      title="모의고사 결과 관리"
      description="제출 즉시 자동채점된 결과를 학생별로 조회합니다. 수동 정답 수정 화면이 아닙니다."
      actions={<Link href={`/admin/sprints/${sprintId}/exam-v2`} className="rounded-md border border-[#D6E0EA] bg-white px-4 py-2.5 text-sm font-black text-[#52627A]">시험 목록</Link>}
    >
      <section className="rounded-lg border border-[#DEE6EF] bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_160px_minmax(180px,240px)]">
          <label className="text-xs font-black text-[#66758C]">
            시험 선택
            <select value={examId ?? ""} onChange={(event) => setExamId(Number(event.target.value) || null)} className="mt-1.5 h-10 w-full rounded-md border border-[#DCE4ED] px-3 text-xs font-bold">
              {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
            </select>
          </label>
          <label className="text-xs font-black text-[#66758C]">
            과목
            <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[#DCE4ED] px-3 text-xs font-bold">
              <option value="all">전체</option>
              <option value="korean">국어</option>
              <option value="math">수학</option>
              <option value="english">영어</option>
              <option value="inquiry">탐구</option>
            </select>
          </label>
          <label className="text-xs font-black text-[#66758C]">
            상태
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[#DCE4ED] px-3 text-xs font-bold">
              <option value="all">전체</option>
              <option value="not_started">미응시</option>
              <option value="started">작성 중</option>
              <option value="submitted">결과 계산 중</option>
              <option value="scored">자동채점 완료</option>
              <option value="published">공개 완료</option>
            </select>
          </label>
          <label className="text-xs font-black text-[#66758C]">
            학생 이름 검색
            <input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="학생 이름" className="mt-1.5 h-10 w-full rounded-md border border-[#DCE4ED] px-3 text-xs font-bold" />
          </label>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-5">
        {[
          ["전체", summary.total],
          ["제출 완료", summary.submitted],
          ["미응시", summary.unsubmitted],
          ["평균 점수", "-"],
          ["1등급 비율", `${summary.firstGradeRate}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#DFE7F0] bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-[#8290A6]">{label}</p>
            <p className="mt-2 text-xl font-black text-[#10213D]">{value}</p>
          </div>
        ))}
      </section>

      {error && <div className="mt-4"><ErrorPanel message={error} onRetry={() => examId && void loadRows(examId)} /></div>}
      {rows === null && !error && <div className="mt-4"><LoadingPanel label="결과 목록을 불러오는 중..." /></div>}

      {rows !== null && (
        <section className="mt-4 overflow-hidden rounded-lg border border-[#DFE7F0] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-[#F6F8FB] font-black text-[#718097]">
                <tr><th className="px-4 py-3">학생명</th><th className="px-3 py-3">제출 시각</th><th className="px-3 py-3">최신 상태</th><th className="px-3 py-3">공개 상태</th><th className="px-3 py-3 text-center">응시 횟수</th><th className="px-4 py-3 text-right">작업</th></tr>
              </thead>
              <tbody className="divide-y divide-[#EDF1F5]">
                {visibleRows.map((row) => {
                  const status = row.latest_attempt?.status ?? "not_started";
                  return (
                    <tr key={row.id} className="hover:bg-[#FAFCFE]">
                      <td className="px-4 py-3 font-black text-[#17213B]">{row.student_name ?? `학생 #${row.student_id}`}</td>
                      <td className="px-3 py-3 font-bold text-[#687995]">{formatDateTime(row.latest_attempt?.submitted_at)}</td>
                      <td className="px-3 py-3"><StatusBadge status={status} label={attemptLabel(status)} tone={statusTone(status)} /></td>
                      <td className="px-3 py-3"><StatusBadge status={row.publication_status} label={row.publication_status === "published" ? "공개 완료" : "미공개"} tone={statusTone(row.publication_status)} /></td>
                      <td className="px-3 py-3 text-center font-black text-[#45546C]">{row.attempt_count}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/sprints/${sprintId}/exam-v2/results/${row.id}`} className="rounded-md bg-[#EAF3FF] px-3 py-2 font-black text-[#2874E8]">상세</Link>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center font-bold text-[#8290A6]">조건에 맞는 결과가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ExamV2Shell>
  );
}
