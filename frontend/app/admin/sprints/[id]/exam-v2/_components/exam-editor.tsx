"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import type { ExamV2Detail, ParsePreviewResponse } from "../_lib/types";
import { examDetailToStructuredText, friendlyApiError, starterStructureText } from "../_lib/ui";
import { ErrorPanel, ExamV2Shell, LoadingPanel } from "./exam-v2-shell";

type Props = {
  sprintId: number;
  examId?: number;
};

function bodyOnly(value: string) {
  const sectionStart = value.indexOf("[");
  return sectionStart >= 0 ? value.slice(sectionStart) : value;
}

function makeParseText(form: { title: string; examDate: string; roundLabel: string; description: string }, body: string) {
  return [
    `시험: ${form.title.trim()}`,
    ...(form.examDate ? [`시험일: ${form.examDate}`] : []),
    ...(form.roundLabel.trim() ? [`출처: ${form.roundLabel.trim()}`] : []),
    ...(form.description.trim() ? [`설명: ${form.description.trim()}`] : []),
    "",
    body.trim(),
    "",
  ].join("\n");
}

function getEnglishListeningUrl(body: string) {
  const match = body.match(/^listening_youtube_url:\s*(.+)\s*$/im);
  return match?.[1]?.trim() ?? "";
}

function setEnglishListeningUrlInBody(body: string, url: string) {
  const lines = body.split("\n");
  const existingIndex = lines.findIndex((line) => /^listening_youtube_url\s*:/i.test(line.trim()));
  if (existingIndex >= 0) {
    if (url.trim()) lines[existingIndex] = `listening_youtube_url: ${url.trim()}`;
    else lines.splice(existingIndex, 1);
    return lines.join("\n");
  }
  if (!url.trim()) return body;
  const englishHeaderIndex = lines.findIndex((line) => /^\[[^\]]*(영어|\?곸뼱)[^\]]*\]\s*$/.test(line.trim()));
  if (englishHeaderIndex < 0) return body;
  const typeIndex = lines.findIndex((line, index) => index > englishHeaderIndex && /^type\s*:/i.test(line.trim()));
  lines.splice((typeIndex >= 0 ? typeIndex : englishHeaderIndex) + 1, 0, `listening_youtube_url: ${url.trim()}`);
  return lines.join("\n");
}

export function ExamEditor({ sprintId, examId }: Props) {
  const router = useRouter();
  const editing = examId !== undefined;
  const [form, setForm] = useState({ title: "", examDate: "", roundLabel: "", description: "" });
  const [structureText, setStructureText] = useState(starterStructureText);
  const [englishListeningUrl, setEnglishListeningUrl] = useState("");
  const [existingMetadata, setExistingMetadata] = useState<Record<string, unknown>>({});
  const [preview, setPreview] = useState<ParsePreviewResponse | null>(null);
  const [loading, setLoading] = useState(editing);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    if (!editing) return;
    setLoading(true);
    void apiFetch<ExamV2Detail>(`/admin/sprint-exam-v2/exams/${examId}`)
      .then((detail) => {
        setForm({
          title: detail.exam.title,
          examDate: detail.exam.exam_date ?? "",
          roundLabel: detail.exam.source_label ?? "",
          description: detail.exam.description ?? "",
        });
        setExistingMetadata(detail.exam.metadata);
        const nextStructureText = bodyOnly(examDetailToStructuredText(detail));
        setStructureText(nextStructureText);
        setEnglishListeningUrl(getEnglishListeningUrl(nextStructureText));
      })
      .catch((reason) => setError(friendlyApiError(reason, "시험 정보를 불러오지 못했습니다.")))
      .finally(() => setLoading(false));
  }, [editing, examId, router]);

  const parsedSummary = useMemo(() => {
    if (!preview?.ok) return null;
    return {
      groups: preview.preview.total_score_group_count,
      papers: preview.preview.total_paper_count,
      questions: preview.preview.total_question_count,
      points: preview.preview.score_groups.reduce(
        (sum, group) => sum + (group.assignment_max_score ?? 0),
        0,
      ),
    };
  }, [preview]);

  const parse = async () => {
    setParsing(true);
    setError("");
    try {
      const result = await apiFetch<ParsePreviewResponse>("/admin/sprint-exam-v2/exams/parse-preview", {
        method: "POST",
        body: { text: makeParseText(form, structureText) },
      });
      setPreview(result);
      if (result.normalized_output) setStructureText(bodyOnly(result.normalized_output));
      return result;
    } catch (reason) {
      setPreview(null);
      setError(friendlyApiError(reason, "시험지 구성을 검증하지 못했습니다."));
      return null;
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError("시험명을 입력해주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const parsed = await parse();
      if (!parsed?.ok) {
        setError("파싱 오류를 수정한 뒤 다시 저장해주세요.");
        return;
      }
      const exam = {
        title: form.title.trim(),
        exam_date: form.examDate || null,
        source_label: form.roundLabel.trim() || null,
        description: form.description.trim() || null,
        metadata: existingMetadata,
      };
      const payload = { exam, score_groups: parsed.preview.score_groups };
      const result = editing
        ? await apiFetch<ExamV2Detail>(`/admin/sprint-exam-v2/exams/${examId}`, { method: "PATCH", body: payload })
        : await apiFetch<ExamV2Detail>("/admin/sprint-exam-v2/exams", { method: "POST", body: payload });
      router.push(`/admin/sprints/${sprintId}/exam-v2/${result.exam.id}`);
    } catch (reason) {
      setError(friendlyApiError(reason, editing ? "시험을 수정하지 못했습니다." : "시험을 생성하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ExamV2Shell sprintId={sprintId} title={editing ? "시험 수정" : "새 모의고사 만들기"}>
        <LoadingPanel />
      </ExamV2Shell>
    );
  }

  return (
    <ExamV2Shell
      sprintId={sprintId}
      title={editing ? "시험 수정" : "새 모의고사 만들기"}
      description="기본 정보와 구조화 텍스트를 검증한 뒤 시험 세트를 저장합니다."
      actions={
        <Link
          href={editing ? `/admin/sprints/${sprintId}/exam-v2/${examId}` : `/admin/sprints/${sprintId}/exam-v2`}
          className="rounded-md border border-[#D7E0EA] bg-white px-4 py-2.5 text-sm font-black text-[#52627A]"
        >
          취소
        </Link>
      }
    >
      {error && <ErrorPanel message={error} />}

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-[#17213B]">기본 정보</h2>
              <p className="mt-1 text-xs font-semibold text-[#7C8AA0]">저장 상태는 backend 정책에 따라 작성 중(draft)으로 생성됩니다.</p>
            </div>
            <span className="rounded-full bg-[#EEF2F6] px-3 py-1 text-xs font-black text-[#617087]">작성 중</span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-black text-[#66758C]">
              시험명 *
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="2026년 6월 모의고사"
                className="mt-1.5 h-11 w-full rounded-md border border-[#DCE4ED] px-3 text-sm font-semibold text-[#17213B] outline-none focus:border-[#2874E8]"
              />
            </label>
            <label className="text-xs font-black text-[#66758C]">
              회차명
              <input
                value={form.roundLabel}
                onChange={(event) => setForm({ ...form, roundLabel: event.target.value })}
                placeholder="2026-06"
                className="mt-1.5 h-11 w-full rounded-md border border-[#DCE4ED] px-3 text-sm font-semibold text-[#17213B] outline-none focus:border-[#2874E8]"
              />
            </label>
            <label className="text-xs font-black text-[#66758C]">
              시험일
              <input
                type="date"
                value={form.examDate}
                onChange={(event) => setForm({ ...form, examDate: event.target.value })}
                className="mt-1.5 h-11 w-full rounded-md border border-[#DCE4ED] px-3 text-sm font-semibold text-[#17213B] outline-none focus:border-[#2874E8]"
              />
            </label>
            <label className="text-xs font-black text-[#66758C] sm:col-span-2">
              설명 / 메모
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={3}
                placeholder="관리자 메모 또는 시험 설명"
                className="mt-1.5 w-full resize-y rounded-md border border-[#DCE4ED] px-3 py-2.5 text-sm font-semibold text-[#17213B] outline-none focus:border-[#2874E8]"
              />
            </label>
          </div>

          <div className="mt-7 border-t border-[#EDF1F5] pt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-[#17213B]">과목 · 정답 · 배점 구성</h2>
                <p className="mt-1 text-xs font-semibold text-[#7C8AA0]">한 줄에 문항 번호, 유형, 정답, 배점을 입력합니다. 복수정답은 `|`로 구분합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => void parse()}
                disabled={parsing || saving}
                className="rounded-md border border-[#BFD6F6] bg-[#F3F8FF] px-4 py-2.5 text-xs font-black text-[#2874E8] disabled:opacity-50"
              >
                {parsing ? "검증 중..." : "파싱 및 검증"}
              </button>
            </div>
            <textarea
              value={structureText}
              onChange={(event) => {
                setStructureText(event.target.value);
                setEnglishListeningUrl(getEnglishListeningUrl(event.target.value));
                setPreview(null);
              }}
              rows={25}
              spellCheck={false}
              className="mt-4 w-full resize-y rounded-md border border-[#CFD9E5] bg-[#F8FAFC] p-4 font-mono text-xs leading-6 text-[#23324A] outline-none focus:border-[#2874E8]"
              aria-label="구조화 시험 텍스트"
            />
            <label className="mt-4 block text-xs font-black text-[#66758C]">
              ?? ?? YouTube ??
              <input
                value={englishListeningUrl}
                onChange={(event) => {
                  const nextUrl = event.target.value;
                  setEnglishListeningUrl(nextUrl);
                  setStructureText((current) => setEnglishListeningUrlInBody(current, nextUrl));
                  setPreview(null);
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="mt-1.5 h-11 w-full rounded-md border border-[#DCE4ED] px-3 text-sm font-semibold text-[#17213B] outline-none focus:border-[#2874E8]"
              />
            </label>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-[#DFE7F0] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-[#17213B]">검증 결과</h2>
            {!preview && <p className="mt-4 text-sm font-semibold leading-6 text-[#8290A6]">저장 전에 파싱 및 검증을 실행해주세요.</p>}
            {preview && (
              <>
                <div className={`mt-4 rounded-md px-3 py-2.5 text-sm font-black ${preview.ok ? "bg-[#EAF8F1] text-[#17895E]" : "bg-red-50 text-red-700"}`}>
                  {preview.ok ? "저장 가능한 구성입니다." : `오류 ${preview.errors.length}건을 수정해주세요.`}
                </div>
                {parsedSummary && (
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
                    {[
                      ["점수 그룹", parsedSummary.groups],
                      ["시험지", parsedSummary.papers],
                      ["문항", parsedSummary.questions],
                      ["학생 기준 총점", parsedSummary.points],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md bg-[#F4F7FA] px-2 py-3">
                        <dt className="text-[11px] font-bold text-[#8290A6]">{label}</dt>
                        <dd className="mt-1 text-lg font-black text-[#17213B]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {preview.errors.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {preview.errors.map((issue, index) => (
                      <p key={`${issue.line}-${issue.code}-${index}`} className="rounded-md bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-700">
                        {issue.line}행 · {issue.message}
                      </p>
                    ))}
                  </div>
                )}
                {preview.warnings.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {preview.warnings.map((issue, index) => (
                      <p key={`${issue.line}-${issue.code}-${index}`} className="rounded-md bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
                        {issue.line}행 · {issue.message}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="rounded-lg border border-[#D9E5F3] bg-[#F7FBFF] p-5">
            <h2 className="text-sm font-black text-[#17213B]">현재 backend 지원 범위</h2>
            <ul className="mt-3 space-y-2 text-xs font-semibold leading-5 text-[#687995]">
              <li>국어·수학 공통/선택, 영어, 탐구 시험지 구성</li>
              <li>객관식·단답형, 복수정답, 배점, 등급컷</li>
              <li>학생 선택과목 기반 시험지 자동 배정</li>
              <li className="text-amber-700">PDF·MP3·해설지 업로드 API는 아직 없습니다.</li>
            </ul>
          </section>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || parsing}
            className="h-12 w-full rounded-md bg-[#2874E8] text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "저장 중..." : editing ? "변경사항 저장" : "시험 생성"}
          </button>
        </aside>
      </div>
    </ExamV2Shell>
  );
}
