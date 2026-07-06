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
  TextbookSection,
  TextbookSeriesItem,
} from "@/lib/types";

type TextbookListResponse = { textbooks: TextbookMgmtListItem[] };
type TextbookSectionsResponse = {
  textbook_id: number;
  textbook_key: string;
  structure_type: string;
  sections: TextbookSection[];
};

type SubjectFilter = "전체" | "수학 I" | "수학 II" | "확률과 통계" | "모의고사";
const SUBJECT_FILTERS: SubjectFilter[] = ["전체", "수학 I", "수학 II", "확률과 통계", "모의고사"];
const SUBJECT_TAGS = ["수학 I", "수학 II", "확률과 통계"] as const;

const TEXTBOOK_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "problem", label: "일반" },
  { value: "mock_exam", label: "모의고사" },
];

function textbookTypeLabel(type: string): string {
  return TEXTBOOK_TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}

type StructureType = "none" | "problems" | "pages" | "both";
const STRUCTURE_TYPES: { value: StructureType; label: string; hint: string }[] = [
  { value: "none", label: "없음", hint: "구간 미사용" },
  { value: "problems", label: "문항", hint: "문항 번호" },
  { value: "pages", label: "페이지", hint: "페이지 범위" },
  { value: "both", label: "문항+페이지", hint: "둘 다 사용" },
];

type SectionForm = {
  unitTitle: string;
  sectionTitle: string;
  startProblem: string;
  endProblem: string;
  startPage: string;
  endPage: string;
  showToStudent: boolean;
  useForHomework: boolean;
};

function makeEmptySection(): SectionForm {
  return {
    unitTitle: "",
    sectionTitle: "",
    startProblem: "",
    endProblem: "",
    startPage: "",
    endPage: "",
    showToStudent: true,
    useForHomework: true,
  };
}

function apiSectionToForm(s: TextbookSection): SectionForm {
  return {
    unitTitle: s.unit_title ?? "",
    sectionTitle: s.section_title,
    startProblem: s.start_problem != null ? String(s.start_problem) : "",
    endProblem: s.end_problem != null ? String(s.end_problem) : "",
    startPage: s.start_page != null ? String(s.start_page) : "",
    endPage: s.end_page != null ? String(s.end_page) : "",
    showToStudent: s.show_to_student,
    useForHomework: s.use_for_homework,
  };
}

function sectionToPayload(s: SectionForm, index: number, structureType: string) {
  const useProblems = structureType === "problems" || structureType === "both";
  const usePages = structureType === "pages" || structureType === "both";
  return {
    unit_title: s.unitTitle.trim() || null,
    section_title: s.sectionTitle.trim(),
    start_problem: useProblems && s.startProblem ? parseInt(s.startProblem, 10) : null,
    end_problem: useProblems && s.endProblem ? parseInt(s.endProblem, 10) : null,
    start_page: usePages && s.startPage ? parseInt(s.startPage, 10) : null,
    end_page: usePages && s.endPage ? parseInt(s.endPage, 10) : null,
    order_index: index,
    show_to_student: s.showToStudent,
    use_for_homework: s.useForHomework,
  };
}

type FormState = {
  seriesId: string;
  subjects: string[];
  textbookType: string;
  title: string;
  fullTitle: string;
  textbookKey: string;
  itemCount: string;
  isCheckable: boolean;
  isPublished: boolean;
  isActive: boolean;
  structureType: StructureType;
};

function makeEmptyForm(): FormState {
  return {
    seriesId: "",
    subjects: [],
    textbookType: "problem",
    title: "",
    fullTitle: "",
    textbookKey: "",
    itemCount: "",
    isCheckable: true,
    isPublished: true,
    isActive: true,
    structureType: "none",
  };
}

function generateFullTitle(displayName: string, subjects: string[], title: string): string {
  if (!displayName || !title) return "";
  const subjectLabel = subjects.join("+");
  return subjectLabel ? `${displayName} ${subjectLabel} - ${title}` : `${displayName} - ${title}`;
}

const TEXTBOOK_KEY_SUBJECT_SLUGS: Record<string, string> = {
  "수학 I": "su1",
  "수학 II": "su2",
  "확률과 통계": "hwaktong",
};

function generateTextbookKey(series: TextbookSeriesItem | undefined, subjects: string[]): string {
  if (!series) return "";
  const slug = series.english_name.toLowerCase().replace(/\s+/g, "-");
  const subjectSlug = subjects
    .map((s) => TEXTBOOK_KEY_SUBJECT_SLUGS[s] ?? "")
    .filter(Boolean)
    .join("-");
  return [slug, subjectSlug].filter(Boolean).join("-");
}

function badgeClass(active: boolean, onClass: string, offClass: string) {
  return active ? onClass : offClass;
}

function structureTypeLabel(t: string): string {
  return STRUCTURE_TYPES.find((s) => s.value === t)?.label ?? t;
}

// ???? Inline section card component ??????????????????????????????????????????????????????????????????????????????????????????

function SectionCard({
  index,
  onChange,
  onRemove,
  section,
  structureType,
}: {
  index: number;
  onChange: (s: SectionForm) => void;
  onRemove: () => void;
  section: SectionForm;
  structureType: string;
}) {
  const showProblems = structureType === "problems" || structureType === "both";
  const showPages = structureType === "pages" || structureType === "both";
  const inputCls =
    "w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#17213B] outline-none focus:border-[#0F172A]";

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-black text-[#344054]">구간 {index + 1}</span>
        <button
          className="rounded-full px-2.5 py-1 text-xs font-black text-red-400 hover:bg-red-50"
          onClick={onRemove}
          type="button"
        >
          삭제        </button>
      </div>

      <div className="space-y-2.5">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-black text-[#98A2B3]">단원명 (선택)</label>
            <input
              className={inputCls}
              onChange={(e) => onChange({ ...section, unitTitle: e.target.value })}
              placeholder="1단원"
              value={section.unitTitle}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black text-[#98A2B3]">구간명 *</label>
            <input
              className={inputCls}
              onChange={(e) => onChange({ ...section, sectionTitle: e.target.value })}
              placeholder="A형"
              value={section.sectionTitle}
            />
          </div>
        </div>

        {showProblems ? (
          <div>
            <label className="mb-1 block text-[11px] font-black text-[#98A2B3]">문항 번호</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                min="1"
                onChange={(e) => onChange({ ...section, startProblem: e.target.value })}
                placeholder="시작 번호"
                type="number"
                value={section.startProblem}
              />
              <input
                className={inputCls}
                min="1"
                onChange={(e) => onChange({ ...section, endProblem: e.target.value })}
                placeholder="끝 번호"
                type="number"
                value={section.endProblem}
              />
            </div>
          </div>
        ) : null}

        {showPages ? (
          <div>
            <label className="mb-1 block text-[11px] font-black text-[#98A2B3]">페이지 번호</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                min="1"
                onChange={(e) => onChange({ ...section, startPage: e.target.value })}
                placeholder="시작 페이지"
                type="number"
                value={section.startPage}
              />
              <input
                className={inputCls}
                min="1"
                onChange={(e) => onChange({ ...section, endPage: e.target.value })}
                placeholder="끝 페이지"
                type="number"
                value={section.endPage}
              />
            </div>
          </div>
        ) : null}

        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#344054]">
            <input
              checked={section.showToStudent}
              className="h-3.5 w-3.5"
              onChange={(e) => onChange({ ...section, showToStudent: e.target.checked })}
              type="checkbox"
            />
            학생 표시          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#344054]">
            <input
              checked={section.useForHomework}
              className="h-3.5 w-3.5"
              onChange={(e) => onChange({ ...section, useForHomework: e.target.checked })}
              type="checkbox"
            />
            숙제 배정          </label>
        </div>
      </div>
    </div>
  );
}

// ???? Sections editor (reused in add form + detail panel) ??????????????????????????????????????????????

function SectionsEditor({
  sections,
  setSections,
  structureType,
}: {
  sections: SectionForm[];
  setSections: (fn: (prev: SectionForm[]) => SectionForm[]) => void;
  structureType: string;
}) {
  if (structureType === "none") return null;

  return (
    <div className="space-y-3">
      {sections.map((section, i) => (
        <SectionCard
          index={i}
          key={i}
          onChange={(updated) =>
            setSections((prev) => prev.map((s, idx) => (idx === i ? updated : s)))
          }
          onRemove={() => setSections((prev) => prev.filter((_, idx) => idx !== i))}
          section={section}
          structureType={structureType}
        />
      ))}
      {sections.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D8DEEA] bg-white px-4 py-4 text-center text-xs font-bold text-[#98A2B3]">
          아직 구간이 없습니다. 아래 버튼으로 추가해주세요.
        </p>
      ) : null}
      <button
        className="w-full rounded-xl border border-dashed border-[#C7D2FE] py-2.5 text-xs font-black text-[#4F46E5] transition hover:bg-[#EEF2FF]"
        onClick={() => setSections((prev) => [...prev, makeEmptySection()])}
        type="button"
      >
        + 구간 추가
      </button>
    </div>
  );
}

// ???? Main page ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

export default function TextbooksManagementPage() {
  const router = useRouter();

  const [textbooks, setTextbooks] = useState<TextbookMgmtListItem[]>([]);
  const [series, setSeries] = useState<TextbookSeriesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>("전체");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TextbookMgmtDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // Add form state
  const [form, setForm] = useState<FormState>(makeEmptyForm());
  const [sections, setSections] = useState<SectionForm[]>([]);
  const [fullTitleEdited, setFullTitleEdited] = useState(false);
  const [keyEdited, setKeyEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingTextbookId, setEditingTextbookId] = useState<number | null>(null);

  // Series add form
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [seriesForm, setSeriesForm] = useState({ koreanName: "", englishName: "", displayName: "" });
  const [seriesDisplayEdited, setSeriesDisplayEdited] = useState(false);
  const [addingSeries, setAddingSeries] = useState(false);
  const [seriesError, setSeriesError] = useState("");

  // Student assignment
  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [assignments, setAssignments] = useState<TextbookAssignmentsResponse | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);

  // Detail panel sections editing
  const [editingSections, setEditingSections] = useState(false);
  const [detailStructureType, setDetailStructureType] = useState<StructureType>("none");
  const [detailSections, setDetailSections] = useState<SectionForm[]>([]);
  const [savingSections, setSavingSections] = useState(false);
  const [sectionsError, setSectionsError] = useState("");
  const [sectionsMessage, setSectionsMessage] = useState("");

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
      fullTitle: generateFullTitle(selectedSeries?.display_name ?? "", f.subjects, f.title),
    }));
  }, [selectedSeries, form.subjects, form.title, fullTitleEdited]);

  useEffect(() => {
    if (keyEdited) return;
    setForm((f) => ({ ...f, textbookKey: generateTextbookKey(selectedSeries, f.subjects) }));
  }, [selectedSeries, form.subjects, keyEdited]);

  const filteredTextbooks = useMemo(
    () =>
      subjectFilter === "전체"
        ? textbooks
        : subjectFilter === "모의고사"
        ? textbooks.filter((t) => t.type === "mock_exam")
        : textbooks.filter((t) => t.subjects.includes(subjectFilter)),
    [textbooks, subjectFilter],
  );

  const summary = useMemo(
    () => ({
      total: textbooks.length,
      assignmentEnabled: textbooks.filter((t) => t.is_active).length,
      studentVisible: textbooks.filter((t) => t.is_published).length,
    }),
    [textbooks],
  );

  const selectedListItem = useMemo(
    () => textbooks.find((textbook) => textbook.id === selectedId) ?? null,
    [selectedId, textbooks],
  );
  void selectedListItem;

  const fetchTextbooks = useCallback(async () => {
    const data = await apiFetch<TextbookListResponse>("/admin/textbook-list");
    setTextbooks(data.textbooks);
  }, []);

  const resetFormState = useCallback(() => {
    setForm((f) => ({
      ...makeEmptyForm(),
      seriesId: f.seriesId || (series[0] ? String(series[0].id) : ""),
    }));
    setSections([]);
    setFullTitleEdited(false);
    setKeyEdited(false);
    setFormMode("create");
    setEditingTextbookId(null);
  }, [series]);

  const handleAddSeries = async (autoDisplayName: string) => {
    setSeriesError("");
    if (!seriesForm.koreanName.trim() || !seriesForm.englishName.trim()) {
      setSeriesError("시리즈 한국어명과 영문명을 모두 입력해주세요.");
      return;
    }
    const displayName = (seriesDisplayEdited ? seriesForm.displayName : autoDisplayName).trim();
    if (!displayName) {
      setSeriesError("표시 이름을 입력해주세요.");
      return;
    }

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
    } catch {
      setAssignments(null);
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  const handleSelectTextbook = async (id: number) => {
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
      setAssignments(null);
      setDetailError("");
      setEditingSections(false);
      return;
    }
    setSelectedId(id);
    setDetail(null);
    setAssignments(null);
    setDetailError("");
    setDetailLoading(true);
    setEditingSections(false);
    setSectionsError("");
    setSectionsMessage("");
    try {
      const detailData = await apiFetch<TextbookMgmtDetail>(`/admin/textbooks/${id}`);
      setDetail(detailData);
      setDetailStructureType((detailData.structure_type as StructureType) ?? "none");
      setDetailSections((detailData.sections ?? []).map(apiSectionToForm));
      void fetchAssignments(id);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : "교재 상세 정보를 불러오지 못했습니다.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEditTextbook = () => {
    if (!detail) return;

    setForm({
      seriesId: String(detail.series_id),
      subjects: detail.subjects ?? [],
      textbookType: detail.type || "problem",
      title: detail.title,
      fullTitle: detail.full_title,
      textbookKey: detail.textbook_key ?? "",
      itemCount: String(detail.item_count),
      isCheckable: detail.is_checkable,
      isPublished: detail.is_published,
      isActive: detail.is_active,
      structureType: (detail.structure_type as StructureType) ?? "none",
    });
    setSections((detail.sections ?? []).map(apiSectionToForm));
    setFullTitleEdited(true);
    setKeyEdited(true);
    setFormMode("edit");
    setEditingTextbookId(detail.id);
    setShowAddForm(true);
    setMessage("");
    setError("");
  };

  const handleDeleteTextbook = async () => {
    if (!selectedId || !detail) return;
    const confirmed = window.confirm("이 교재를 삭제하시겠습니까?");
    if (!confirmed) return;

    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      await apiFetch(`/admin/textbooks/${selectedId}`, { method: "DELETE" });
      await fetchTextbooks();
      setSelectedId(null);
      setDetail(null);
      setAssignments(null);
      setDetailError("");
      setEditingSections(false);
      setShowAddForm(false);
      resetFormState();
      setMessage(`"${detail.full_title}" 교재가 삭제되었습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "교재 삭제에 실패했습니다.");
    } finally {
      setSubmitting(false);
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
      setAssignments((prev) => (prev ? { ...prev, is_student_only: isStudentOnly } : prev));
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

  const handleSaveSections = async () => {
    if (!selectedId) return;
    setSavingSections(true);
    setSectionsError("");
    setSectionsMessage("");
    try {
      const result = await apiFetch<TextbookSectionsResponse>(
        `/admin/textbooks/${selectedId}/sections`,
        {
          method: "PUT",
          body: {
            structure_type: detailStructureType,
            sections: detailSections
              .filter((s) => s.sectionTitle.trim())
              .map((s, i) => sectionToPayload(s, i, detailStructureType)),
          },
        },
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              structure_type: result.structure_type,
              sections: result.sections,
            }
          : prev,
      );
      setDetailSections(result.sections.map(apiSectionToForm));
      setSectionsMessage("저장되었습니다.");
      setEditingSections(false);
    } catch (err) {
      setSectionsError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSavingSections(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!form.seriesId) {
      setError("시리즈를 선택해주세요.");
      return;
    }
    if (!form.title.trim()) {
      setError("교재 제목을 입력해주세요.");
      return;
    }
    if (!form.fullTitle.trim()) {
      setError("전체 제목을 입력해주세요.");
      return;
    }

    const itemCount = parseInt(form.itemCount, 10);
    if (formMode !== "edit" && (!form.itemCount || isNaN(itemCount) || itemCount < 1)) {
      setError("문항 수는 1 이상으로 입력해주세요.");
      return;
    }

    const validSections = sections.filter((s) => s.sectionTitle.trim());

    setSubmitting(true);
    try {
      if (formMode === "edit" && editingTextbookId) {
        await apiFetch<TextbookMgmtDetail>(`/admin/textbooks/${editingTextbookId}`, {
          method: "PATCH",
          body: {
            subjects: form.subjects,
            title: form.title.trim(),
            full_title: form.fullTitle.trim(),
            textbook_key: form.textbookKey.trim() || null,
            type: form.textbookType,
            is_checkable: form.isCheckable,
            is_published: form.isPublished,
            is_active: form.isActive,
            order_index: detail?.order_index ?? 0,
          },
        });
        setMessage(`"${form.fullTitle.trim()}" 교재가 수정되었습니다.`);
        await fetchTextbooks();
        await handleSelectTextbook(editingTextbookId);
        setShowAddForm(false);
        resetFormState();
      } else {
        await apiFetch<TextbookMgmtDetail>("/admin/textbooks", {
          method: "POST",
          body: {
            series_id: Number(form.seriesId),
            subjects: form.subjects,
            title: form.title.trim(),
            full_title: form.fullTitle.trim(),
            textbook_key: form.textbookKey.trim() || null,
            type: form.textbookType,
            structure_type: form.structureType,
            is_checkable: form.isCheckable,
            is_published: form.isPublished,
            is_active: form.isActive,
            order_index: 0,
            item_count: itemCount,
            sections: validSections.map((s, i) => sectionToPayload(s, i, form.structureType)),
          },
        });
        setMessage(`"${form.fullTitle.trim()}" 교재가 추가되었습니다.`);
        await fetchTextbooks();
        setShowAddForm(false);
        resetFormState();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "교재 저장에 실패했습니다.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F4F6FA]">
      <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 pb-32 sm:px-6 lg:px-8">
        <div className="space-y-5">
          <section className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#7C8799]">교재관리</p>
              <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-[#17213B] sm:text-[2.3rem]">
                교재 관리              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                교재 기본정보 등록/수정, 학생 표시 범위, 단원/구간 정보를 관리합니다.
              </p>
            </div>
            <button
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-[#0F172A] px-4 text-sm font-black text-white shadow-card transition hover:bg-[#1E293B]"
              onClick={() => { if (showAddForm && formMode === "create") { setShowAddForm(false); resetFormState(); return; } resetFormState(); setShowAddForm(true); }}
              type="button"
            >
              {showAddForm ? "닫기" : "+ 교재 추가"}
            </button>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                label: "전체 교재",
                value: loading ? "-" : `${summary.total}권`,
                hint: "등록된 교재 수",
                tone: "bg-[#EEF2FF] text-[#4F46E5]",
              },
              {
                label: "숙제 배정 사용",
                value: loading ? "-" : `${summary.assignmentEnabled}권`,
                hint: "is_active 기준",
                tone: "bg-[#ECFDF3] text-[#16A34A]",
              },
              {
                label: "학생 화면 표시",
                value: loading ? "-" : `${summary.studentVisible}권`,
                hint: "is_published 기준",
                tone: "bg-[#FFF7ED] text-[#F97316]",
              },
            ].map((card) => (
              <article
                className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                key={card.label}
              >
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${card.tone}`}>
                  {card.label}
                </span>
                <p className="mt-4 text-3xl font-black tracking-tight text-[#17213B]">{card.value}</p>
                <p className="mt-2 text-sm text-[#98A2B3]">{card.hint}</p>
              </article>
            ))}
          </section>

          {message ? (
            <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
              {error}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <div className="space-y-5">
              {/* ???? Textbook list ???? */}
              <section className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-[#17213B]">교재 목록</h2>
                    <p className="mt-1 text-sm text-[#98A2B3]">
                      과목별로 등록된 교재 기본정보를 상세 확인 및 수정할 수 있습니다.
                    </p>
                  </div>
                  <div className="rounded-full bg-[#F8FAFC] px-3 py-1.5 text-xs font-black text-[#98A2B3]">
                    {filteredTextbooks.length}권 교재
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {SUBJECT_FILTERS.map((s) => (
                    <button
                      className={`rounded-full px-3 py-2 text-xs font-black transition ${
                        subjectFilter === s
                          ? "bg-[#0F172A] text-white shadow-sm"
                          : "bg-[#F4F6FA] text-[#667085] hover:bg-[#EDEFF5]"
                      }`}
                      key={s}
                      onClick={() => setSubjectFilter(s)}
                      type="button"
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="mt-5 space-y-3">
                  {loading ? (
                    <p className="py-8 text-center text-sm text-gray-400">불러오는 중...</p>
                  ) : filteredTextbooks.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">교재가 없습니다.</p>
                  ) : (
                    filteredTextbooks.map((tb) => {
                      const isSelected = selectedId === tb.id;
                      return (
                        <button
                          className={`w-full rounded-[24px] border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[#C7D2FE] ${
                            isSelected
                              ? "border-[#0F172A] bg-[#0F172A] text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
                              : "border-[#EEF2F7] bg-[#F8FAFC] hover:border-[#D8DEEA] hover:bg-white"
                          }`}
                          key={tb.id}
                          onClick={() => void handleSelectTextbook(tb.id)}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-base font-black ${isSelected ? "text-white" : "text-[#17213B]"}`}>
                                {tb.title}
                              </p>
                              <p className={`mt-1 truncate text-xs font-semibold ${isSelected ? "text-white/65" : "text-[#98A2B3]"}`}>
                                {tb.series_name}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {tb.subjects.map((s) => (
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isSelected ? "bg-white/15 text-white" : "bg-[#EEF2FF] text-[#4F46E5]"}`}
                                    key={s}
                                  >
                                    {s}
                                  </span>
                                ))}
                                {tb.type === "mock_exam" ? (
                                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isSelected ? "bg-white/15 text-white" : "bg-[#FFF7ED] text-[#F97316]"}`}>
                                    모의고사
                                  </span>
                                ) : null}
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isSelected ? "bg-white/10 text-white/80" : "bg-white text-[#667085]"}`}>
                                  {tb.item_count}문항</span>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${badgeClass(tb.is_active, isSelected ? "bg-emerald-500/20 text-emerald-100" : "bg-emerald-50 text-emerald-600", isSelected ? "bg-red-500/20 text-red-100" : "bg-red-50 text-red-500")}`}>
                                  {tb.is_active ? "숙제 배정 중" : "숙제 미배정"}
                                </span>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${badgeClass(tb.is_published, isSelected ? "bg-blue-500/20 text-blue-100" : "bg-blue-50 text-blue-600", isSelected ? "bg-white/10 text-white/75" : "bg-gray-200 text-gray-500")}`}>
                                  {tb.is_published ? "학생 표시" : "학생 비표시"}
                                </span>
                              </div>
                            </div>
                            <div className={`shrink-0 pt-1 text-xl font-bold ${isSelected ? "text-white/70" : "text-[#CBD5E1]"}`}>
                              ›                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              {/* ???? Add form ???? */}
              {showAddForm ? (
                <section className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight text-[#17213B]">교재 추가</h2>
                      <p className="mt-1 text-sm text-[#98A2B3]">문항 교재 기본정보는 시리즈 단위로 등록합니다.</p>
                    </div>
                    <button
                      className="rounded-full bg-[#F4F6FA] px-3 py-1.5 text-xs font-black text-[#667085] hover:bg-[#EDEFF5]"
                      onClick={() => { setShowAddForm(false); resetFormState(); }}
                      type="button"
                    >
                      닫기
                    </button>
                  </div>

                  <form className="mt-5 space-y-5" onSubmit={(e) => void handleSubmit(e)}>
                    <div className="rounded-2xl bg-[#F8FAFC] px-4 py-3">
                      <p className="text-xs font-black text-[#98A2B3]">현재 모드</p>
                      <p className="mt-1 text-sm font-black text-[#17213B]">{formMode === "edit" ? "교재 수정" : "신규 교재 추가"}</p>
                    </div>
                    {/* Series */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-sm font-black text-[#344054]">시리즈</label>
                        <button
                          className="rounded-full bg-[#F4F6FA] px-3 py-1.5 text-xs font-black text-[#667085] hover:bg-[#EDEFF5]"
                          onClick={() => { setShowSeriesForm((v) => !v); setSeriesError(""); }}
                          type="button"
                        >
                          {showSeriesForm ? "닫기" : "+ 시리즈 추가"}
                        </button>
                      </div>
                      {loading ? (
                        <p className="text-xs text-gray-400">불러오는 중...</p>
                      ) : series.length === 0 && !showSeriesForm ? (
                        <p className="rounded-2xl bg-yellow-50 px-4 py-3 text-xs font-bold text-yellow-700">
                          등록된 시리즈가 없습니다. 먼저 시리즈를 추가해주세요.
                        </p>
                      ) : series.length > 0 ? (
                        <select
                          className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-black text-[#17213B] outline-none focus:border-[#0F172A]"
                          onChange={(e) => setForm((f) => ({ ...f, seriesId: e.target.value }))}
                          value={form.seriesId}
                        >
                          <option value="">시리즈 선택</option>
                          {series.map((s) => (
                            <option key={s.id} value={s.id}>{s.display_name}</option>
                          ))}
                        </select>
                      ) : null}

                      {showSeriesForm ? (() => {
                        const autoDisplay = [seriesForm.koreanName, seriesForm.englishName].filter(Boolean).join(" ");
                        const displayVal = seriesDisplayEdited ? seriesForm.displayName : autoDisplay;
                        return (
                          <div className="mt-3 space-y-3 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                            <p className="text-xs font-black text-[#344054]">새 시리즈 추가</p>
                            {[
                              { label: "시리즈 한국어명", key: "koreanName" as const, placeholder: "딥러닝" },
                              { label: "시리즈 영문명", key: "englishName" as const, placeholder: "Deep Learning" },
                            ].map(({ label, key, placeholder }) => (
                              <div key={key}>
                                <label className="mb-1.5 block text-xs font-black text-[#667085]">{label}</label>
                                <input
                                  className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-black text-[#17213B] outline-none focus:border-[#0F172A]"
                                  onChange={(e) => setSeriesForm((f) => ({ ...f, [key]: e.target.value }))}
                                  placeholder={placeholder}
                                  value={seriesForm[key]}
                                />
                              </div>
                            ))}
                            <div>
                              <label className="mb-1.5 block text-xs font-black text-[#667085]">
                                표시 이름<span className="font-normal text-[#98A2B3]">(자동 생성)</span>
                              </label>
                              <input
                                className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-black text-[#17213B] outline-none focus:border-[#0F172A]"
                                onChange={(e) => { setSeriesDisplayEdited(true); setSeriesForm((f) => ({ ...f, displayName: e.target.value })); }}
                                placeholder="딥러닝 Deep Learning"
                                value={displayVal}
                              />
                            </div>
                            {seriesError ? <p className="text-xs font-bold text-red-500">{seriesError}</p> : null}
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

                    {/* Subject (multi-select) */}
                    <div>
                      <label className="mb-2 block text-sm font-black text-[#344054]">
                        과목 <span className="font-normal text-[#98A2B3]">(복수 선택 가능)</span>
                      </label>
                      <div className="flex gap-2">
                        {SUBJECT_TAGS.map((s) => {
                          const checked = form.subjects.includes(s);
                          return (
                            <button
                              className={`flex-1 rounded-xl py-2.5 text-xs font-black transition ${checked ? "bg-[#0F172A] text-white" : "bg-[#F4F6FA] text-[#667085] hover:bg-[#EDEFF5]"}`}
                              key={s}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  subjects: checked
                                    ? f.subjects.filter((existing) => existing !== s)
                                    : [...f.subjects, s],
                                }))
                              }
                              type="button"
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Type (category) */}
                    <div>
                      <label className="mb-2 block text-sm font-black text-[#344054]">유형</label>
                      <div className="flex gap-2">
                        {TEXTBOOK_TYPE_OPTIONS.map((opt) => (
                          <button
                            className={`flex-1 rounded-xl py-2.5 text-xs font-black transition ${form.textbookType === opt.value ? "bg-[#0F172A] text-white" : "bg-[#F4F6FA] text-[#667085] hover:bg-[#EDEFF5]"}`}
                            key={opt.value}
                            onClick={() => setForm((f) => ({ ...f, textbookType: opt.value }))}
                            type="button"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Title */}
                    <div>
                      <label className="mb-2 block text-sm font-black text-[#344054]">교재명</label>
                      <input
                        className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-black text-[#17213B] outline-none focus:border-[#0F172A]"
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="수학1 기본 유형"
                        value={form.title}
                      />
                    </div>

                    {/* Full title */}
                    <div>
                      <label className="mb-2 block text-sm font-black text-[#344054]">
                        전체 제목 <span className="font-normal text-[#98A2B3]">(자동 입력, 직접 수정 가능)</span>
                      </label>
                      <input
                        className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-black text-[#17213B] outline-none focus:border-[#0F172A]"
                        onChange={(e) => { setFullTitleEdited(true); setForm((f) => ({ ...f, fullTitle: e.target.value })); }}
                        placeholder="딥러닝 Deep Learning 수1 - 수학1 기본 유형"
                        value={form.fullTitle}
                      />
                    </div>

                    {/* Textbook key */}
                    <div>
                      <label className="mb-2 block text-sm font-black text-[#344054]">
                        교재키<span className="font-normal text-[#98A2B3]">(선택, 자동 입력)</span>
                      </label>
                      <input
                        className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-black text-[#17213B] outline-none focus:border-[#0F172A]"
                        onChange={(e) => { setKeyEdited(true); setForm((f) => ({ ...f, textbookKey: e.target.value })); }}
                        placeholder="deep-learning-su1"
                        value={form.textbookKey}
                      />
                    </div>

                    {/* Item count */}
                    <div>
                      <label className="mb-2 block text-sm font-black text-[#344054]">문항 수</label>
                      <input
                        className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-black text-[#17213B] outline-none focus:border-[#0F172A]"
                        min="1"
                        onChange={(e) => setForm((f) => ({ ...f, itemCount: e.target.value }))}
                        placeholder="15"
                        type="number"
                        value={form.itemCount}
                      />
                    </div>

                    {/* Checkboxes */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(
                        [
                          { key: "isCheckable", label: "문항 체크 여부" },
                          { key: "isPublished", label: "학생 화면 표시" },
                          { key: "isActive", label: "숙제 배정 사용" },
                        ] as { key: keyof FormState; label: string }[]
                      ).map(({ key, label }) => (
                        <label
                          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-black text-[#344054]"
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

                    {/* Structure type */}
                    <div className="rounded-2xl border border-[#EEF2FF] bg-[#F8FAFC] p-4">
                      <label className="mb-3 block text-sm font-black text-[#344054]">교재 구간 구조</label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {STRUCTURE_TYPES.map((st) => (
                          <button
                            className={`flex flex-col items-center rounded-xl px-3 py-3 text-center transition ${
                              form.structureType === st.value
                                ? "bg-[#0F172A] text-white shadow-sm"
                                : "bg-white text-[#344054] hover:border-[#C7D2FE] hover:bg-[#EEF2FF]"
                            } border ${form.structureType === st.value ? "border-[#0F172A]" : "border-[#E5E7EB]"}`}
                            key={st.value}
                            onClick={() => setForm((f) => ({ ...f, structureType: st.value }))}
                            type="button"
                          >
                            <span className="text-xs font-black">{st.label}</span>
                            <span className={`mt-0.5 text-[10px] font-semibold ${form.structureType === st.value ? "text-white/70" : "text-[#98A2B3]"}`}>
                              {st.hint}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sections editor */}
                    {form.structureType !== "none" ? (
                      <div className="rounded-2xl border border-[#EEF2FF] bg-[#F8FAFC] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <label className="text-sm font-black text-[#344054]">
                            단원/구간 <span className="ml-1 font-semibold text-[#98A2B3]">({sections.length}개)</span>
                          </label>
                        </div>
                        <SectionsEditor
                          sections={sections}
                          setSections={setSections}
                          structureType={form.structureType}
                        />
                      </div>
                    ) : null}

                    <button
                      className="w-full rounded-2xl bg-[#0F172A] py-3.5 text-sm font-black text-white transition hover:bg-[#1E293B] disabled:opacity-50"
                      disabled={submitting || series.length === 0}
                      type="submit"
                    >
                      {submitting ? (formMode === "edit" ? "저장 중..." : "추가 중...") : formMode === "edit" ? "교재 수정" : "교재 추가"}
                    </button>
                  </form>
                </section>
              ) : null}
            </div>

            {/* ???? Detail panel ???? */}
            <div className="space-y-5">
              {selectedId !== null ? (
                <section className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6 xl:sticky xl:top-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-[#98A2B3]">선택된 교재</p>
                      <h2 className="mt-1 text-2xl font-black tracking-tight text-[#17213B]">교재 상세</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {detail && (
                        <>
                          <button
                            className="rounded-full bg-[#EEF2FF] px-3 py-1.5 text-xs font-black text-[#4F46E5] hover:bg-[#E0E7FF]"
                            disabled={submitting}
                            onClick={handleEditTextbook}
                            type="button"
                          >
                            수정
                          </button>
                          <button
                            className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-black text-red-500 hover:bg-red-100"
                            disabled={submitting}
                            onClick={() => void handleDeleteTextbook()}
                            type="button"
                          >
                            삭제
                          </button>
                        </>
                      )}
                      <button
                        className="rounded-full bg-[#F4F6FA] px-3 py-1.5 text-xs font-black text-[#667085] hover:bg-[#EDEFF5]"
                        onClick={() => { setSelectedId(null); setDetail(null); setDetailError(""); setEditingSections(false); }}
                        type="button"
                      >
                        닫기
                      </button>
                    </div>
                  </div>

                  {detailError ? (
                    <p className="mt-4 py-4 text-center text-sm font-bold text-red-500">{detailError}</p>
                  ) : detailLoading ? (
                    <p className="mt-4 py-4 text-center text-sm text-gray-400">불러오는 중...</p>
                  ) : detail ? (
                    <div className="mt-5 space-y-4">
                      {/* Info badges */}
                      <div className="rounded-[28px] bg-[#F8FAFC] p-4">
                        <div className="flex flex-wrap gap-2">
                          {(detail.subjects ?? []).map((s) => (
                            <span
                              className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-black text-[#4F46E5]"
                              key={s}
                            >
                              {s}
                            </span>
                          ))}
                          {detail.type === "mock_exam" ? (
                            <span className="rounded-full bg-[#FFF7ED] px-3 py-1 text-xs font-black text-[#F97316]">
                              모의고사
                            </span>
                          ) : null}
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#667085]">
                            {detail.item_count}문항</span>
                          <span className="rounded-full bg-[#EDE9FE] px-3 py-1 text-xs font-black text-[#6D28D9]">
                            구간: {structureTypeLabel(detail.structure_type ?? "none")}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${detail.is_active ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                            {detail.is_active ? "숙제 배정 중" : "숙제 미배정"}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${detail.is_published ? "bg-blue-50 text-blue-600" : "bg-gray-200 text-gray-500"}`}>
                            {detail.is_published ? "학생 표시" : "학생 비표시"}
                          </span>
                        </div>
                        <p className="mt-4 text-xl font-black tracking-tight text-[#17213B]">{detail.title}</p>
                        <p className="mt-2 text-sm font-semibold text-[#667085]">{detail.full_title}</p>
                      </div>

                      {/* Meta grid */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-[#EEF2F7] bg-white p-4">
                          <p className="text-xs font-bold text-[#98A2B3]">시리즈</p>
                          <p className="mt-1 text-sm font-black text-[#17213B]">{detail.series_name}</p>
                        </div>
                        <div className="rounded-2xl border border-[#EEF2F7] bg-white p-4">
                          <p className="text-xs font-bold text-[#98A2B3]">과목</p>
                          <p className="mt-1 text-sm font-black text-[#17213B]">
                            {detail.subjects && detail.subjects.length > 0 ? detail.subjects.join(", ") : "-"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#EEF2F7] bg-white p-4">
                          <p className="text-xs font-bold text-[#98A2B3]">유형</p>
                          <p className="mt-1 text-sm font-black text-[#17213B]">{textbookTypeLabel(detail.type)}</p>
                        </div>
                        <div className="rounded-2xl border border-[#EEF2F7] bg-white p-4">
                          <p className="text-xs font-bold text-[#98A2B3]">체크 여부</p>
                          <p className="mt-1 text-sm font-black text-[#17213B]">
                            {detail.is_checkable ? "문항 체크 가능" : "문항 체크 불가"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#EEF2F7] bg-white p-4">
                          <p className="text-xs font-bold text-[#98A2B3]">구간 구조</p>
                          <p className="mt-1 text-sm font-black text-[#17213B]">
                            {structureTypeLabel(detail.structure_type ?? "none")}
                          </p>
                        </div>
                      </div>

                      {/* Sections panel */}
                      <div className="rounded-[28px] border border-[#EEF2F7] bg-[#FCFCFD] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs font-black text-[#98A2B3]">
                            단원/구간 ({(detail.sections ?? []).length}개)
                          </p>
                          <button
                            className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                              editingSections
                                ? "bg-[#F4F6FA] text-[#667085] hover:bg-[#EDEFF5]"
                                : "bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#E0E7FF]"
                            }`}
                            onClick={() => {
                              if (editingSections) {
                                setEditingSections(false);
                                setDetailSections((detail.sections ?? []).map(apiSectionToForm));
                                setDetailStructureType((detail.structure_type as StructureType) ?? "none");
                              } else {
                                setEditingSections(true);
                              }
                              setSectionsError("");
                              setSectionsMessage("");
                            }}
                            type="button"
                          >
                            {editingSections ? "닫기" : "구간 편집"}
                          </button>
                        </div>

                        {sectionsMessage ? (
                          <p className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-xs font-bold text-green-700">
                            {sectionsMessage}
                          </p>
                        ) : null}
                        {sectionsError ? (
                          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                            {sectionsError}
                          </p>
                        ) : null}

                        {editingSections ? (
                          <div className="space-y-4">
                            {/* Structure type selector in detail edit mode */}
                            <div>
                              <p className="mb-2 text-xs font-black text-[#344054]">구간 구조</p>
                              <div className="grid grid-cols-2 gap-2">
                                {STRUCTURE_TYPES.map((st) => (
                                  <button
                                    className={`flex flex-col items-center rounded-xl border px-2 py-2.5 text-center text-xs transition ${
                                      detailStructureType === st.value
                                        ? "border-[#0F172A] bg-[#0F172A] font-black text-white"
                                        : "border-[#E5E7EB] bg-white font-semibold text-[#344054] hover:bg-[#EEF2FF]"
                                    }`}
                                    key={st.value}
                                    onClick={() => setDetailStructureType(st.value)}
                                    type="button"
                                  >
                                    <span className="font-black">{st.label}</span>
                                    <span className={`text-[10px] ${detailStructureType === st.value ? "text-white/70" : "text-[#98A2B3]"}`}>
                                      {st.hint}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {detailStructureType !== "none" ? (
                              <SectionsEditor
                                sections={detailSections}
                                setSections={setDetailSections}
                                structureType={detailStructureType}
                              />
                            ) : (
                              <p className="rounded-xl bg-white px-3 py-3 text-xs font-bold text-[#98A2B3]">
                                구간 구조를 &apos;없음&apos;으로 선택하면 구간이 모두 삭제됩니다.
                              </p>
                            )}

                            <button
                              className="w-full rounded-xl bg-[#0F172A] py-2.5 text-xs font-black text-white disabled:opacity-50"
                              disabled={savingSections}
                              onClick={() => void handleSaveSections()}
                              type="button"
                            >
                              {savingSections ? "저장 중..." : "단원/구간 저장"}
                            </button>
                          </div>
                        ) : (detail.sections ?? []).length === 0 ? (
                          <p className="rounded-2xl bg-white px-3 py-3 text-xs font-bold text-[#98A2B3]">
                            등록된 구간이 없습니다. 위 버튼으로 추가해주세요.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {(detail.sections ?? []).map((s) => (
                              <div
                                className="rounded-xl bg-white px-3 py-3"
                                key={s.id}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    {s.unit_title ? (
                                      <p className="text-[10px] font-bold text-[#98A2B3]">{s.unit_title}</p>
                                    ) : null}
                                    <p className="text-xs font-black text-[#17213B]">{s.section_title}</p>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      {s.start_problem != null && s.end_problem != null ? (
                                        <span className="text-[10px] font-semibold text-[#667085]">
                                          문항 {s.start_problem}~{s.end_problem}
                                        </span>
                                      ) : null}
                                      {s.start_page != null && s.end_page != null ? (
                                        <span className="text-[10px] font-semibold text-[#667085]">
                                          p.{s.start_page}~{s.end_page}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 gap-1">
                                    {s.show_to_student ? (
                                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-500">
                                        표시                                      </span>
                                    ) : null}
                                    {s.use_for_homework ? (
                                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-500">
                                        숙제
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Access scope */}
                      <div className="rounded-[28px] border border-[#EEF2F7] bg-[#FCFCFD] p-4">
                        <p className="mb-3 text-xs font-black text-[#98A2B3]">표시 범위</p>
                        {assignmentsLoading ? (
                          <p className="text-xs text-[#98A2B3]">불러오는 중...</p>
                        ) : assignments ? (
                          <>
                            <div className="mb-4 flex flex-wrap gap-2">
                              <button
                                className={`rounded-full px-3 py-2 text-xs font-black transition ${!assignments.is_student_only ? "bg-[#0F172A] text-white" : "bg-[#F4F6FA] text-[#667085] hover:bg-[#EDEFF5]"}`}
                                disabled={savingAssignment}
                                onClick={() => void handleToggleStudentOnly(false)}
                                type="button"
                              >
                                전체 공개
                              </button>
                              <button
                                className={`rounded-full px-3 py-2 text-xs font-black transition ${assignments.is_student_only ? "bg-[#0F172A] text-white" : "bg-[#F4F6FA] text-[#667085] hover:bg-[#EDEFF5]"}`}
                                disabled={savingAssignment}
                                onClick={() => void handleToggleStudentOnly(true)}
                                type="button"
                              >
                                지정 학생만                              </button>
                            </div>

                            {assignments.is_student_only ? (
                              <div className="space-y-2">
                                <p className="text-[11px] font-black text-[#98A2B3]">배정된 학생</p>
                                {students.map((student) => {
                                  const isAssigned = assignments.assignments.some(
                                    (a) => a.student_id === student.id && a.is_active,
                                  );
                                  return (
                                    <div
                                      className="flex items-center justify-between rounded-2xl bg-white px-3 py-2"
                                      key={student.id}
                                    >
                                      <span className="text-xs font-bold text-[#344054]">
                                        {student.name}
                                        <span className="ml-1 font-medium text-[#98A2B3]">{student.grade}</span>
                                      </span>
                                      <button
                                        className={`rounded-full px-2.5 py-1.5 text-[11px] font-black transition ${isAssigned ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
                                        disabled={savingAssignment}
                                        onClick={() =>
                                          isAssigned
                                            ? void handleUnassignStudent(student.id)
                                            : void handleAssignStudent(student.id)
                                        }
                                        type="button"
                                      >
                                        {isAssigned ? "배정됨 (해제)" : "배정하기"}
                                      </button>
                                    </div>
                                  );
                                })}
                                {students.length === 0 ? (
                                  <p className="text-xs text-[#98A2B3]">등록된 학생이 없습니다.</p>
                                ) : null}
                              </div>
                            ) : (
                              <p className="rounded-2xl bg-white px-3 py-3 text-xs font-bold text-[#667085]">
                                모든 학생에게 표시됩니다.
                              </p>
                            )}
                          </>
                        ) : null}
                      </div>

                      {/* Item list */}
                      <div className="rounded-[28px] border border-[#EEF2F7] bg-[#FCFCFD] p-4">
                        <p className="mb-3 text-xs font-black text-[#98A2B3]">
                          문항 목록 ({detail.items.length}개)
                        </p>
                        <div className="max-h-64 overflow-y-auto rounded-2xl bg-white p-3">
                          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                            {detail.items.map((item) => (
                              <span
                                className={`rounded-xl px-2 py-2 text-center text-xs font-black ${item.is_active ? "bg-[#F8FAFC] text-[#344054] shadow-sm" : "bg-gray-200 text-gray-400"}`}
                                key={item.id}
                              >
                                {item.item_number}번</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : (
                <section className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
                  <p className="text-xs font-bold text-[#98A2B3]">상세 보기 안내</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-[#17213B]">교재를 선택해주세요</h2>
                  <p className="mt-2 text-sm leading-6 text-[#667085]">
                    왼쪽 목록에서 교재를 선택하면 표시 범위, 단원/구간 정보, 문항 목록 및 수정 기능을 볼 수 있습니다.
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}



