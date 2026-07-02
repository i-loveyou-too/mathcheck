"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import {
  AdminStudentSummary,
  TextbookAssignmentsResponse,
  TextbookMgmtDetail,
  TextbookMgmtListItem,
  TextbookSeriesItem,
} from "@/lib/types";

type TextbookListResponse = { textbooks: TextbookMgmtListItem[] };

type SubjectFilter = "전체" | "수1" | "수2" | "확통";
const SUBJECT_FILTERS: SubjectFilter[] = ["전체", "수1", "수2", "확통"];
const SUBJECTS = ["수1", "수2", "확통"] as const;

type FormState = {
  seriesId: string;
  subject: string;
  title: string;
  fullTitle: string;
  textbookKey: string;
  itemCount: string;
  isCheckable: boolean;
  isPublished: boolean;
  isActive: boolean;
};

function makeEmptyForm(): FormState {
  return {
    seriesId: "",
    subject: "수1",
    title: "",
    fullTitle: "",
    textbookKey: "",
    itemCount: "",
    isCheckable: true,
    isPublished: true,
    isActive: true,
  };
}

function generateFullTitle(displayName: string, subject: string, title: string): string {
  if (!displayName || !title) return "";
  return subject ? `${displayName} ${subject} - ${title}` : `${displayName} - ${title}`;
}

function generateTextbookKey(series: TextbookSeriesItem | undefined, subject: string): string {
  if (!series) return "";
  const slug = series.english_name.toLowerCase().replace(/\s+/g, "-");
  const subjectMap: Record<string, string> = { 수1: "su1", 수2: "su2", 확통: "hwaktong" };
  const s = subjectMap[subject] ?? "";
  return [slug, s].filter(Boolean).join("-");
}

function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  if (subject === "확률과 통계") return "확통";
  if (subject === "수학1") return "수1";
  if (subject === "수학2") return "수2";
  return subject;
}

export default function TextbooksManagementPage() {
  const router = useRouter();

  const [textbooks, setTextbooks] = useState<TextbookMgmtListItem[]>([]);
  const [series, setSeries] = useState<TextbookSeriesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>("전체");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TextbookMgmtDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [form, setForm] = useState<FormState>(makeEmptyForm());
  const [fullTitleEdited, setFullTitleEdited] = useState(false);
  const [keyEdited, setKeyEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [seriesForm, setSeriesForm] = useState({ koreanName: "", englishName: "", displayName: "" });
  const [seriesDisplayEdited, setSeriesDisplayEdited] = useState(false);
  const [addingSeries, setAddingSeries] = useState(false);
  const [seriesError, setSeriesError] = useState("");

  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [assignments, setAssignments] = useState<TextbookAssignmentsResponse | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }

    const load = async () => {
      try {
        const [listData, seriesData, studentData] = await Promise.all([
          apiFetch<TextbookListResponse>("/admin/textbook-list"),
          apiFetch<TextbookSeriesItem[]>("/admin/textbook-series"),
          apiFetch<AdminStudentSummary[]>("/admin/students"),
        ]);
        setTextbooks(listData.textbooks);
        setSeries(seriesData);
        setStudents(studentData);
        if (seriesData.length > 0) {
          setForm((f) => ({ ...f, seriesId: String(seriesData[0].id) }));
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const selectedSeries = useMemo(
    () => series.find((s) => String(s.id) === form.seriesId),
    [series, form.seriesId],
  );

  useEffect(() => {
    if (fullTitleEdited) return;
    setForm((f) => ({
      ...f,
      fullTitle: generateFullTitle(selectedSeries?.display_name ?? "", f.subject, f.title),
    }));
  }, [selectedSeries, form.subject, form.title, fullTitleEdited]);

  useEffect(() => {
    if (keyEdited) return;
    setForm((f) => ({ ...f, textbookKey: generateTextbookKey(selectedSeries, f.subject) }));
  }, [selectedSeries, form.subject, keyEdited]);

  const filteredTextbooks = useMemo(
    () =>
      subjectFilter === "전체"
        ? textbooks
        : textbooks.filter((t) => normalizeSubject(t.subject) === subjectFilter),
    [textbooks, subjectFilter],
  );

  const fetchTextbooks = useCallback(async () => {
    const data = await apiFetch<TextbookListResponse>("/admin/textbook-list");
    setTextbooks(data.textbooks);
  }, []);

  const handleAddSeries = async (autoDisplayName: string) => {
    setSeriesError("");
    if (!seriesForm.koreanName.trim() || !seriesForm.englishName.trim()) {
      setSeriesError("한글 이름과 영문 이름을 입력해주세요.");
      return;
    }
    const displayName = (seriesDisplayEdited ? seriesForm.displayName : autoDisplayName).trim();
    if (!displayName) { setSeriesError("표시 이름을 입력해주세요."); return; }

    setAddingSeries(true);
    try {
      const newSeries = await apiFetch<TextbookSeriesItem>("/admin/textbook-series", {
        method: "POST",
        body: {
          korean_name: seriesForm.koreanName.trim(),
          english_name: seriesForm.englishName.trim(),
          display_name: displayName,
          type: "problem",
          order_index: 0,
        },
      });
      const updatedSeries = await apiFetch<TextbookSeriesItem[]>("/admin/textbook-series");
      setSeries(updatedSeries);
      setForm((f) => ({ ...f, seriesId: String(newSeries.id) }));
      setSeriesForm({ koreanName: "", englishName: "", displayName: "" });
      setSeriesDisplayEdited(false);
      setShowSeriesForm(false);
    } catch (err) {
      setSeriesError(err instanceof Error ? err.message : "시리즈 추가에 실패했습니다.");
    } finally {
      setAddingSeries(false);
    }
  };

  const fetchAssignments = useCallback(async (id: number) => {
    setAssignmentsLoading(true);
    try {
      const data = await apiFetch<TextbookAssignmentsResponse>(`/admin/textbooks/${id}/assignments`);
      setAssignments(data);
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  const handleSelectTextbook = async (id: number) => {
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
      setAssignments(null);
      return;
    }
    setSelectedId(id);
    setDetail(null);
    setAssignments(null);
    setDetailLoading(true);
    try {
      const [detailData] = await Promise.all([
        apiFetch<TextbookMgmtDetail>(`/admin/textbooks/${id}`),
        fetchAssignments(id),
      ]);
      setDetail(detailData);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleStudentOnly = async (isStudentOnly: boolean) => {
    if (!selectedId || !assignments) return;
    setSavingAssignment(true);
    try {
      await apiFetch(`/admin/textbooks/${selectedId}/student-only`, {
        method: "PATCH",
        body: { is_student_only: isStudentOnly },
      });
      setAssignments((prev) => prev ? { ...prev, is_student_only: isStudentOnly } : prev);
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleAssignStudent = async (studentId: number) => {
    if (!selectedId) return;
    setSavingAssignment(true);
    try {
      await apiFetch(`/admin/textbooks/${selectedId}/assign/${studentId}`, { method: "POST" });
      await fetchAssignments(selectedId);
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleUnassignStudent = async (studentId: number) => {
    if (!selectedId) return;
    setSavingAssignment(true);
    try {
      await apiFetch(`/admin/textbooks/${selectedId}/assign/${studentId}`, { method: "DELETE" });
      await fetchAssignments(selectedId);
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!form.seriesId) { setError("시리즈를 선택해주세요."); return; }
    if (!form.title.trim()) { setError("교재 제목을 입력해주세요."); return; }
    if (!form.fullTitle.trim()) { setError("전체 제목을 입력해주세요."); return; }
    const itemCount = parseInt(form.itemCount, 10);
    if (!form.itemCount || isNaN(itemCount) || itemCount < 1) {
      setError("문항 수를 1 이상으로 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch<TextbookMgmtDetail>("/admin/textbooks", {
        method: "POST",
        body: {
          series_id: Number(form.seriesId),
          subject: form.subject || null,
          title: form.title.trim(),
          full_title: form.fullTitle.trim(),
          textbook_key: form.textbookKey.trim() || null,
          type: "problem",
          is_checkable: form.isCheckable,
          is_published: form.isPublished,
          is_active: form.isActive,
          order_index: 0,
          item_count: itemCount,
        },
      });
      setMessage(`"${form.fullTitle.trim()}" 교재가 추가되었습니다.`);
      setForm((f) => ({
        ...makeEmptyForm(),
        seriesId: f.seriesId,
        subject: f.subject,
      }));
      setFullTitleEdited(false);
      setKeyEdited(false);
      await fetchTextbooks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "교재 추가에 실패했습니다.";
      if (msg.includes("이미 존재")) setError("이미 같은 제목의 교재가 있습니다.");
      else setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6]">
      <div className="mx-auto min-h-screen w-full max-w-7xl px-5 py-8 pb-32 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-400">관리자</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-gray-900">교재 관리</h1>
            <p className="mt-1 text-sm leading-relaxed text-gray-500">
              교재를 등록하면 학생 교재 리스트와 숙제 배정에서 사용할 수 있어요.
            </p>
          </div>
          <div className="rounded-2xl bg-[#0F172A] px-5 py-3 text-sm font-bold text-white shadow-card">
            {textbooks.length}개 등록됨
          </div>
        </div>

        {message ? (
          <div className="mb-4 rounded-2xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
            {error}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
          {/* Left: List */}
          <section className="rounded-3xl bg-white p-5 shadow-card lg:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900">교재 목록</h2>
              <span className="text-xs font-bold text-gray-400">
                {filteredTextbooks.length}개
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {SUBJECT_FILTERS.map((s) => (
                <button
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    subjectFilter === s
                      ? "bg-[#0F172A] text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  key={s}
                  onClick={() => setSubjectFilter(s)}
                  type="button"
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {loading ? (
                <p className="py-8 text-center text-sm text-gray-400">불러오는 중...</p>
              ) : filteredTextbooks.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  {subjectFilter === "전체" ? "등록된 교재가 없습니다." : `${subjectFilter} 교재가 없습니다.`}
                </p>
              ) : (
                filteredTextbooks.map((tb) => {
                  const isSelected = selectedId === tb.id;
                  return (
                    <button
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? "border-[#0F172A] bg-[#0F172A] text-white"
                          : "border-transparent bg-gray-50 hover:bg-gray-100"
                      }`}
                      key={tb.id}
                      onClick={() => void handleSelectTextbook(tb.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-black ${isSelected ? "text-white" : "text-gray-900"}`}
                          >
                            {tb.title}
                          </p>
                          <p
                            className={`mt-0.5 truncate text-xs ${isSelected ? "text-white/60" : "text-gray-400"}`}
                          >
                            {tb.series_name}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {tb.subject ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isSelected ? "bg-white/20 text-white" : "bg-[#EEF2FF] text-[#3730A3]"
                              }`}
                            >
                              {normalizeSubject(tb.subject)}
                            </span>
                          ) : null}
                          <span
                            className={`text-[10px] font-bold ${isSelected ? "text-white/60" : "text-gray-400"}`}
                          >
                            {tb.item_count}문항
                          </span>
                        </div>
                      </div>
                      {!tb.is_active || !tb.is_published || !tb.is_checkable ? (
                        <div className="mt-2 flex gap-1.5">
                          {!tb.is_active ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isSelected ? "bg-red-500/30 text-red-200" : "bg-red-50 text-red-400"}`}
                            >
                              숙제배정 미사용
                            </span>
                          ) : null}
                          {!tb.is_published ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isSelected ? "bg-white/20 text-white/70" : "bg-gray-200 text-gray-500"}`}
                            >
                              학생화면 미표시
                            </span>
                          ) : null}
                          {!tb.is_checkable ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isSelected ? "bg-white/20 text-white/70" : "bg-gray-200 text-gray-500"}`}
                            >
                              체크리스트 미사용
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Right: Detail + Form */}
          <div className="space-y-5">
            {/* Detail panel */}
            {selectedId !== null ? (
              <section className="rounded-3xl bg-white p-5 shadow-card lg:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black text-gray-900">교재 상세</h2>
                  <button
                    className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-200"
                    onClick={() => {
                      setSelectedId(null);
                      setDetail(null);
                    }}
                    type="button"
                  >
                    닫기
                  </button>
                </div>

                {detailLoading ? (
                  <p className="mt-4 py-4 text-center text-sm text-gray-400">불러오는 중...</p>
                ) : detail ? (
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs font-bold text-gray-400">전체 제목</p>
                      <p className="mt-0.5 text-sm font-bold text-gray-900">{detail.full_title}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-bold text-gray-400">과목</p>
                        <p className="mt-0.5 text-sm font-bold text-gray-900">{detail.subject ?? "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400">문항 수</p>
                        <p className="mt-0.5 text-sm font-bold text-gray-900">{detail.item_count}문항</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400">시리즈</p>
                        <p className="mt-0.5 text-sm font-bold text-gray-900">{detail.series_name}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400">상태</p>
                        <p className="mt-0.5 text-sm font-bold text-gray-900">
                          {detail.is_active ? "숙제 배정 사용" : "숙제 배정 미사용"} /{" "}
                          {detail.is_published ? "학생 화면 표시" : "학생 화면 미표시"}
                        </p>
                      </div>
                    </div>

                    {/* 공개 범위 섹션 */}
                    <div className="rounded-2xl border border-gray-100 p-4">
                      <p className="mb-3 text-xs font-bold text-gray-400">공개 범위</p>
                      {assignmentsLoading ? (
                        <p className="text-xs text-gray-400">불러오는 중...</p>
                      ) : assignments ? (
                        <>
                          <div className="mb-4 flex gap-2">
                            <button
                              type="button"
                              disabled={savingAssignment}
                              onClick={() => void handleToggleStudentOnly(false)}
                              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!assignments.is_student_only ? "bg-[#0F172A] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                            >
                              전체 공개
                            </button>
                            <button
                              type="button"
                              disabled={savingAssignment}
                              onClick={() => void handleToggleStudentOnly(true)}
                              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${assignments.is_student_only ? "bg-[#0F172A] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                            >
                              특정 학생에게만
                            </button>
                          </div>
                          {assignments.is_student_only && (
                            <div className="space-y-1.5">
                              <p className="mb-2 text-[11px] font-bold text-gray-400">배정된 학생</p>
                              {students.map((student) => {
                                const isAssigned = assignments.assignments.some(
                                  (a) => a.student_id === student.id && a.is_active
                                );
                                return (
                                  <div key={student.id} className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-700">
                                      {student.name}
                                      <span className="ml-1 font-medium text-gray-400">{student.grade}</span>
                                    </span>
                                    <button
                                      type="button"
                                      disabled={savingAssignment}
                                      onClick={() =>
                                        isAssigned
                                          ? void handleUnassignStudent(student.id)
                                          : void handleAssignStudent(student.id)
                                      }
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${isAssigned ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
                                    >
                                      {isAssigned ? "배정 해제" : "배정"}
                                    </button>
                                  </div>
                                );
                              })}
                              {students.length === 0 && (
                                <p className="text-xs text-gray-400">등록된 학생이 없습니다.</p>
                              )}
                            </div>
                          )}
                          {!assignments.is_student_only && (
                            <p className="text-xs text-gray-500">모든 학생에게 표시됩니다.</p>
                          )}
                        </>
                      ) : null}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-bold text-gray-400">
                        문항 목록 ({detail.items.length}개)
                      </p>
                      <div className="max-h-52 overflow-y-auto rounded-2xl bg-gray-50 p-3">
                        <div className="grid grid-cols-5 gap-1.5">
                          {detail.items.map((item) => (
                            <span
                              className={`rounded-lg px-2 py-1.5 text-center text-xs font-bold ${
                                item.is_active
                                  ? "bg-white text-gray-700 shadow-sm"
                                  : "bg-gray-200 text-gray-400"
                              }`}
                              key={item.id}
                            >
                              {item.item_number}번
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Add form */}
            <section className="rounded-3xl bg-white p-5 shadow-card lg:p-6">
              <h2 className="text-lg font-black text-gray-900">교재 추가</h2>
              <p className="mt-1 text-xs font-bold text-gray-400">문항형 교재를 추가합니다. 1번~N번 문항이 자동 생성됩니다.</p>

              <form className="mt-5 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
                {/* Series */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-bold text-gray-700">시리즈</label>
                    <button
                      className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 hover:bg-gray-200"
                      onClick={() => { setShowSeriesForm((v) => !v); setSeriesError(""); }}
                      type="button"
                    >
                      {showSeriesForm ? "취소" : "+ 시리즈 추가"}
                    </button>
                  </div>
                  {loading ? (
                    <p className="text-xs text-gray-400">불러오는 중...</p>
                  ) : series.length === 0 && !showSeriesForm ? (
                    <p className="rounded-2xl bg-yellow-50 px-4 py-3 text-xs font-bold text-yellow-700">
                      등록된 시리즈가 없습니다. 위의 버튼으로 시리즈를 먼저 추가해주세요.
                    </p>
                  ) : series.length > 0 ? (
                    <select
                      className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                      onChange={(e) => setForm((f) => ({ ...f, seriesId: e.target.value }))}
                      value={form.seriesId}
                    >
                      <option value="">시리즈 선택</option>
                      {series.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.display_name}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {showSeriesForm ? (() => {
                    const autoDisplay = [seriesForm.koreanName, seriesForm.englishName].filter(Boolean).join(" ");
                    const displayVal = seriesDisplayEdited ? seriesForm.displayName : autoDisplay;
                    return (
                      <div className="mt-3 space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-black text-gray-700">새 시리즈 추가</p>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-gray-600">한글 이름</label>
                          <input
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                            onChange={(e) => setSeriesForm((f) => ({ ...f, koreanName: e.target.value }))}
                            placeholder="딥러닝"
                            value={seriesForm.koreanName}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-gray-600">영문 이름</label>
                          <input
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                            onChange={(e) => setSeriesForm((f) => ({ ...f, englishName: e.target.value }))}
                            placeholder="Deep Learning"
                            value={seriesForm.englishName}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-gray-600">
                            표시 이름 <span className="font-normal text-gray-400">(자동 생성)</span>
                          </label>
                          <input
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                            onChange={(e) => { setSeriesDisplayEdited(true); setSeriesForm((f) => ({ ...f, displayName: e.target.value })); }}
                            placeholder="딥러닝 Deep Learning"
                            value={displayVal}
                          />
                        </div>
                        {seriesError ? (
                          <p className="text-xs font-bold text-red-500">{seriesError}</p>
                        ) : null}
                        <button
                          className="w-full rounded-xl bg-[#0F172A] py-2.5 text-xs font-black text-white disabled:opacity-50"
                          disabled={addingSeries}
                          onClick={() => void handleAddSeries(autoDisplay)}
                          type="button"
                        >
                          {addingSeries ? "추가 중..." : "시리즈 추가"}
                        </button>
                      </div>
                    );
                  })() : null}
                </div>

                {/* Subject */}
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">과목</label>
                  <div className="flex gap-2">
                    {SUBJECTS.map((s) => (
                      <button
                        className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${
                          form.subject === s
                            ? "bg-[#0F172A] text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                        key={s}
                        onClick={() => setForm((f) => ({ ...f, subject: s }))}
                        type="button"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">교재 제목</label>
                  <input
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="삼각함수 도형"
                    value={form.title}
                  />
                </div>

                {/* Full title */}
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    전체 제목{" "}
                    <span className="font-normal text-gray-400">(자동 생성, 수정 가능)</span>
                  </label>
                  <input
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    onChange={(e) => {
                      setFullTitleEdited(true);
                      setForm((f) => ({ ...f, fullTitle: e.target.value }));
                    }}
                    placeholder="딥러닝 Deep Learning 수1 - 삼각함수 도형"
                    value={form.fullTitle}
                  />
                </div>

                {/* textbook_key */}
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    교재 키{" "}
                    <span className="font-normal text-gray-400">(선택, 자동 생성)</span>
                  </label>
                  <input
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    onChange={(e) => {
                      setKeyEdited(true);
                      setForm((f) => ({ ...f, textbookKey: e.target.value }));
                    }}
                    placeholder="deep-learning-su1"
                    value={form.textbookKey}
                  />
                </div>

                {/* Item count */}
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">문항 수</label>
                  <input
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    min="1"
                    onChange={(e) => setForm((f) => ({ ...f, itemCount: e.target.value }))}
                    placeholder="15"
                    type="number"
                    value={form.itemCount}
                  />
                </div>

                {/* Flags */}
                <div className="flex gap-5">
                  {(
                    [
                      { key: "isCheckable", label: "문항 체크리스트 사용" },
                      { key: "isPublished", label: "학생 화면에 표시" },
                      { key: "isActive", label: "숙제 배정에서 사용" },
                    ] as { key: keyof FormState; label: string }[]
                  ).map(({ key, label }) => (
                    <label
                      className="flex cursor-pointer items-center gap-2 text-sm font-bold text-gray-700"
                      key={key}
                    >
                      <input
                        checked={form[key] as boolean}
                        className="h-4 w-4"
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                        type="checkbox"
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <button
                  className="w-full rounded-2xl bg-[#0F172A] py-3.5 text-sm font-black text-white transition hover:bg-[#1E293B] disabled:opacity-50"
                  disabled={submitting || series.length === 0}
                  type="submit"
                >
                  {submitting ? "추가 중..." : "교재 추가"}
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
