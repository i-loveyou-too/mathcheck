"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { ErrorPanel, ExamV2Shell, LoadingPanel, StatusBadge } from "../../_components/exam-v2-shell";
import type {
  AssignmentListItem,
  AssignmentListResponse,
  ElectiveProfile,
  ExamV2Detail,
  ExamV2Paper,
  SprintProgram,
} from "../../_lib/types";
import { assignmentStatusLabels, formatDateTime, friendlyApiError, statusTone } from "../../_lib/ui";

const profileAliases: Record<string, string> = {
  "화법과 작문": "korean_speech_writing",
  "언어와 매체": "korean_language_media",
  "확률과 통계": "math_probability_statistics",
  미적분: "math_calculus",
  기하: "math_geometry",
  "생활과 윤리": "life_ethics",
  "윤리와 사상": "ethics_thought",
  사회문화: "social_culture",
  동아시아사: "east_asian_history",
};

function profileCode(value: string | null) {
  return value ? profileAliases[value] ?? value : null;
}

function toInputDateTime(date: string | null, time: string | null) {
  if (!date) return "";
  return `${date}T${(time || "09:00").slice(0, 5)}`;
}

function toApiDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function paperMatches(paper: ExamV2Paper, selection: string | null) {
  if (!selection) return false;
  return paper.subject_code === selection || paper.subject_name.replace(/\s/g, "") === selection.replace(/\s/g, "");
}

export default function AdminSprintExamV2AssignmentsPage() {
  const params = useParams<{ id: string; examId: string }>();
  const sprintId = Number(params.id);
  const examId = Number(params.examId);
  const router = useRouter();
  const [sprint, setSprint] = useState<SprintProgram | null>(null);
  const [exam, setExam] = useState<ExamV2Detail | null>(null);
  const [profile, setProfile] = useState<ElectiveProfile | null>(null);
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [selected, setSelected] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [availableFrom, setAvailableFrom] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [attemptLimit, setAttemptLimit] = useState("1");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [program, examDetail, assignmentResult] = await Promise.all([
        apiFetch<SprintProgram>(`/admin/sprints/${sprintId}`),
        apiFetch<ExamV2Detail>(`/admin/sprint-exam-v2/exams/${examId}`),
        apiFetch<AssignmentListResponse>(`/admin/sprint-exam-v2/assignments?exam_id=${examId}&limit=100&offset=0`),
      ]);
      const elective = await apiFetch<ElectiveProfile>(`/admin/students/${program.student_id}/electives`);
      setSprint(program);
      setExam(examDetail);
      setProfile(elective);
      setAssignments(assignmentResult.items);
      setAvailableFrom((current) => current || toInputDateTime(examDetail.exam.exam_date, program.mock_exam_start_time));
      setDueAt((current) => current || toInputDateTime(examDetail.exam.exam_date, program.mock_exam_submission_deadline_time || "23:00"));
      setSelected(!assignmentResult.items.some((item) => item.student_id === program.student_id));
    } catch (reason) {
      setError(friendlyApiError(reason, "배정 정보를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [examId, sprintId]);

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load();
  }, [load, router]);

  const existingAssignment = useMemo(
    () => (sprint ? assignments.find((item) => item.student_id === sprint.student_id) ?? null : null),
    [assignments, sprint],
  );

  const preview = useMemo(() => {
    if (!exam || !profile) return { papers: [] as ExamV2Paper[], warnings: [] as string[] };
    const selections = {
      korean: profileCode(profile.korean_elective),
      math: profileCode(profile.math_elective),
      inquiry: [profileCode(profile.inquiry_subject_1), profileCode(profile.inquiry_subject_2)].filter((value): value is string => Boolean(value)),
    };
    const papers: ExamV2Paper[] = [];
    const warnings: string[] = [];

    exam.score_groups.forEach((group) => {
      if (group.aggregation_type === "sum") {
        const common = group.papers.find((paper) => paper.paper_role === "common");
        if (common) papers.push(common);
        const electivePapers = group.papers.filter((paper) => paper.paper_role === "elective");
        if (electivePapers.length > 0) {
          const profileSelection = group.subject_area === "korean" ? selections.korean : group.subject_area === "math" ? selections.math : null;
          const selection = manualMode ? overrides[group.score_group_code] || profileSelection : profileSelection;
          const matched = electivePapers.find((paper) => paperMatches(paper, selection));
          if (matched) papers.push(matched);
          else warnings.push(`${group.score_group_name} 선택과목과 일치하는 시험지가 없습니다.`);
        }
        return;
      }
      if (group.subject_area === "inquiry") {
        const matched = group.papers.find((paper) => selections.inquiry.some((selection) => paperMatches(paper, selection)));
        if (matched) papers.push(matched);
        return;
      }
      if (group.papers.length === 1) papers.push(group.papers[0]);
    });

    const inquiryGroups = exam.score_groups.filter((group) => group.subject_area === "inquiry");
    const matchedInquiryCodes = new Set(papers.filter((paper) => paper.paper_role === "inquiry_slot").map((paper) => paper.subject_code));
    selections.inquiry.forEach((selection) => {
      if (inquiryGroups.length > 0 && !matchedInquiryCodes.has(selection)) warnings.push(`탐구 선택과목 ${selection} 시험지가 없습니다.`);
    });
    if (inquiryGroups.length > 0 && selections.inquiry.length < 2) warnings.push("탐구 선택과목 2개가 모두 설정되지 않았습니다.");
    return { papers, warnings };
  }, [exam, manualMode, overrides, profile]);

  const missingProfile = Boolean(
    profile &&
      (!profile.korean_elective ||
        !profile.math_elective ||
        !profile.inquiry_subject_1 ||
        !profile.inquiry_subject_2),
  );
  const assign = async () => {
    if (!sprint || !exam || !selected || existingAssignment) return;
    if (preview.warnings.length > 0) {
      setError("자동 배정 미리보기의 경고를 먼저 확인해주세요.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const studentOverrides = manualMode
        ? Object.fromEntries(Object.entries(overrides).filter(([, value]) => Boolean(value)))
        : {};
      const body: Record<string, unknown> = {
        exam_id: exam.exam.id,
        student_ids: [sprint.student_id],
        available_from: toApiDateTime(availableFrom),
        due_at: toApiDateTime(dueAt),
        attempt_limit: Number(attemptLimit),
        memo: memo.trim() || null,
        paper_selection_mode: manualMode ? "override" : "student_profile",
      };
      if (manualMode) body.paper_overrides = { [String(sprint.student_id)]: studentOverrides };
      await apiFetch("/admin/sprint-exam-v2/assignments", { method: "POST", body });
      setNotice("학생에게 시험을 배정했습니다.");
      await load();
    } catch (reason) {
      setError(friendlyApiError(reason, "시험을 배정하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (assignment: AssignmentListItem) => {
    if (assignment.attempt_count > 0) {
      setError("응시 기록이 있는 배정은 삭제할 수 없습니다.");
      return;
    }
    if (!window.confirm(`${assignment.student_name || "학생"}의 배정을 삭제할까요?`)) return;
    try {
      await apiFetch(`/admin/sprint-exam-v2/assignments/${assignment.id}`, { method: "DELETE" });
      setNotice("배정을 삭제했습니다.");
      await load();
    } catch (reason) {
      setError(friendlyApiError(reason, "배정을 삭제하지 못했습니다."));
    }
  };

  return (
    <ExamV2Shell
      sprintId={sprintId}
      title="학생 배정"
      description={exam ? `${exam.exam.title} · 학생 선택과목 프로필을 기준으로 시험지를 자동 배정합니다.` : undefined}
      actions={
        <Link href={`/admin/sprints/${sprintId}/exam-v2/${examId}`} className="rounded-md border border-[#D6E0EA] bg-white px-4 py-2.5 text-sm font-black text-[#52627A]">
          시험 상세
        </Link>
      }
    >
      {error && <ErrorPanel message={error} onRetry={loading ? undefined : () => void load()} />}
      {notice && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{notice}</p>}
      {loading && <LoadingPanel label="학생과 선택과목 정보를 불러오는 중..." />}

      {!loading && sprint && exam && profile && (
        <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <section className="h-fit rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-[#17213B]">1. 학생 선택</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-[#8290A6]">
              현재 저장소의 SprintProgram은 학생별 구조이므로 이 Sprint에 연결된 학생 1명을 표시합니다.
            </p>
            <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-md border p-3 ${existingAssignment ? "border-[#E2E7ED] bg-[#F6F8FA]" : selected ? "border-[#8DBBF7] bg-[#F2F8FF]" : "border-[#DCE4ED]"}`}>
              <input
                type="checkbox"
                checked={selected && !existingAssignment}
                onChange={(event) => setSelected(event.target.checked)}
                disabled={Boolean(existingAssignment)}
                className="mt-1 h-4 w-4 accent-[#2874E8]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-black text-[#17213B]">{sprint.student_name}</span>
                <span className="mt-1 block text-xs font-semibold text-[#7C8AA0]">{sprint.title} · {sprint.start_date} ~ {sprint.end_date}</span>
                {existingAssignment && <span className="mt-2 inline-flex rounded-full bg-[#E8F7EF] px-2 py-1 text-[10px] font-black text-[#17895E]">이미 배정됨</span>}
              </span>
            </label>

            {missingProfile && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2.5 text-xs font-black leading-5 text-amber-800">
                선택과목 정보가 없어 자동 배정할 수 없습니다.
              </p>
            )}

            <dl className="mt-4 space-y-2 text-xs">
              {[
                ["국어 선택", profile.korean_elective],
                ["수학 선택", profile.math_elective],
                ["탐구 1", profile.inquiry_subject_1],
                ["탐구 2", profile.inquiry_subject_2],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-[#EDF1F5] pb-2">
                  <dt className="font-bold text-[#8290A6]">{label}</dt>
                  <dd className={`text-right font-black ${value ? "text-[#45546C]" : "text-red-500"}`}>{value || "미설정"}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="space-y-5">
            <section className="rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-[#17213B]">2. 자동 배정 미리보기</h2>
                  <p className="mt-1 text-xs font-semibold text-[#8290A6]">저장 전 실제 선택될 시험지를 확인합니다.</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-black text-[#52627A]">
                  <input type="checkbox" checked={manualMode} onChange={(event) => setManualMode(event.target.checked)} className="h-4 w-4 accent-[#2874E8]" />
                  국어·수학 선택 수동 수정
                </label>
              </div>

              {manualMode && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {exam.score_groups
                    .filter((group) => group.aggregation_type === "sum" && group.papers.some((paper) => paper.paper_role === "elective"))
                    .map((group) => (
                      <label key={group.score_group_code} className="text-xs font-black text-[#66758C]">
                        {group.score_group_name} 선택
                        <select
                          value={overrides[group.score_group_code] ?? ""}
                          onChange={(event) => setOverrides({ ...overrides, [group.score_group_code]: event.target.value })}
                          className="mt-1.5 h-10 w-full rounded-md border border-[#DCE4ED] bg-white px-3 text-xs font-black text-[#45546C]"
                        >
                          <option value="">학생 프로필 사용</option>
                          {group.papers.filter((paper) => paper.paper_role === "elective").map((paper) => (
                            <option key={paper.subject_code} value={paper.subject_code}>{paper.subject_name}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                </div>
              )}

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-xs">
                  <thead className="bg-[#F7F9FB] font-black text-[#718097]"><tr><th className="px-3 py-2.5">점수 그룹</th><th className="px-3 py-2.5">선택 시험지</th><th className="px-3 py-2.5">구분</th><th className="px-3 py-2.5 text-center">문항</th><th className="px-3 py-2.5 text-right">배점</th></tr></thead>
                  <tbody className="divide-y divide-[#EDF1F5]">
                    {preview.papers.map((paper) => {
                      const group = exam.score_groups.find((item) => item.papers.some((candidate) => candidate.id === paper.id));
                      return (
                        <tr key={paper.id ?? `${paper.subject_code}-${paper.slot ?? ""}`}>
                          <td className="px-3 py-3 font-bold text-[#687995]">{group?.score_group_name ?? "-"}</td>
                          <td className="px-3 py-3 font-black text-[#17213B]">{paper.subject_name}</td>
                          <td className="px-3 py-3 font-bold text-[#52627A]">{paper.paper_role === "common" ? "공통" : paper.paper_role === "elective" ? "선택" : paper.paper_role === "inquiry_slot" ? "탐구" : "독립"}</td>
                          <td className="px-3 py-3 text-center font-black">{paper.question_count}</td>
                          <td className="px-3 py-3 text-right font-black">{paper.paper_max_score}점</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {preview.warnings.length > 0 && (
                <div className="mt-3 space-y-2">
                  {preview.warnings.map((warning) => <p key={warning} className="rounded-md bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{warning}</p>)}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-[#17213B]">3. 배정 조건</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black text-[#66758C]">응시 가능 시각<input type="datetime-local" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[#DCE4ED] px-3 text-xs font-bold" /></label>
                <label className="text-xs font-black text-[#66758C]">제출 마감 시각<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[#DCE4ED] px-3 text-xs font-bold" /></label>
                <label className="text-xs font-black text-[#66758C]">기본 응시 횟수<input type="number" min="1" value={attemptLimit} onChange={(event) => setAttemptLimit(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[#DCE4ED] px-3 text-xs font-bold" /></label>
                <label className="text-xs font-black text-[#66758C]">관리자 메모<input value={memo} onChange={(event) => setMemo(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[#DCE4ED] px-3 text-xs font-bold" /></label>
              </div>
              <button
                type="button"
                onClick={() => void assign()}
                disabled={saving || !selected || Boolean(existingAssignment) || preview.warnings.length > 0}
                className="mt-5 h-11 w-full rounded-md bg-[#2874E8] text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? "배정 중..." : "선택 학생 배정"}
              </button>
            </section>

            <section className="overflow-hidden rounded-lg border border-[#DFE7F0] bg-white shadow-sm">
              <div className="border-b border-[#E8EDF3] px-5 py-4">
                <h2 className="text-sm font-black text-[#17213B]">배정 완료 학생</h2>
              </div>
              {assignments.length === 0 ? (
                <p className="px-5 py-9 text-center text-sm font-bold text-[#8290A6]">아직 배정된 학생이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-[#F7F9FB] font-black text-[#718097]"><tr><th className="px-4 py-3">학생</th><th className="px-3 py-3">상태</th><th className="px-3 py-3">시험지</th><th className="px-3 py-3">마감</th><th className="px-4 py-3 text-right">관리</th></tr></thead>
                    <tbody className="divide-y divide-[#EDF1F5]">
                      {assignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td className="px-4 py-3 font-black text-[#17213B]">{assignment.student_name || `학생 #${assignment.student_id}`}</td>
                          <td className="px-3 py-3"><StatusBadge status={assignment.status} label={assignmentStatusLabels[assignment.status] ?? assignment.status} tone={statusTone(assignment.status)} /></td>
                          <td className="px-3 py-3 font-bold text-[#52627A]">{assignment.paper_count}개</td>
                          <td className="px-3 py-3 font-semibold text-[#687995]">{formatDateTime(assignment.due_at)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Link href={`/admin/sprints/${sprintId}/exam-v2/assignments/${assignment.id}`} className="rounded-md bg-[#EDF5FF] px-3 py-2 font-black text-[#2874E8]">상세</Link>
                              <button type="button" onClick={() => void removeAssignment(assignment)} disabled={assignment.attempt_count > 0} className="rounded-md bg-red-50 px-3 py-2 font-black text-red-600 disabled:opacity-35">배정 삭제</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </ExamV2Shell>
  );
}
