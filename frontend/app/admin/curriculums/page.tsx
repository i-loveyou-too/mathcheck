"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { type CurriculumNodesResponse, GroupSection } from "@/components/curriculum-graph";
import { ApiError, apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { AdminStudentSummary } from "@/lib/types";

type CurriculumListItem = {
  student_curriculum_id: number;
  curriculum_id: number;
  subject: string;
  title: string;
  description: string | null;
  in_progress_count: number;
  completed_count: number;
  planned_count: number;
};

type CurriculumAdminItem = {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
};

type CurriculumNodeAdmin = {
  id: number;
  title: string;
  node_type: "textbook" | "lecture" | "exam" | "custom" | "review";
  group_name: string;
  group_order: number;
  order_index: number;
  textbook_id: number | null;
  lecture_assignment_id: number | null;
  description: string | null;
  is_active: boolean;
  prerequisite_node_ids: number[];
};

type CurriculumEdgeAdmin = { id: number; from_node_id: number; to_node_id: number; edge_type: string };

type CurriculumAdminDetail = {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
  nodes: CurriculumNodeAdmin[];
  edges: CurriculumEdgeAdmin[];
};

type TextbookOption = { id: number; title: string; short_title: string; subject: string };

type LectureAssignmentOption = { id: number; subject: string; course_title: string; status: string };

const NODE_TYPE_OPTIONS: { value: CurriculumNodeAdmin["node_type"]; label: string }[] = [
  { value: "textbook", label: "교재" },
  { value: "lecture", label: "인강" },
  { value: "exam", label: "시험" },
  { value: "custom", label: "사용자 정의" },
];

function nodeTypeLabel(type: string) {
  return NODE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return `[${err.status}] ${err.message}`;
  if (err instanceof Error) return err.message;
  return fallback;
}

function buildPageHref(studentId: string, curriculumId?: number | null) {
  const params = new URLSearchParams();
  if (studentId) params.set("student_id", studentId);
  if (curriculumId) params.set("curriculum_id", String(curriculumId));
  const query = params.toString();
  return query ? `/admin/curriculums?${query}` : "/admin/curriculums";
}

type StageGroup = { name: string; order: number; nodes: CurriculumNodeAdmin[] };

function groupNodesByStage(nodes: CurriculumNodeAdmin[]): StageGroup[] {
  const map = new Map<string, StageGroup>();
  for (const node of nodes) {
    const existing = map.get(node.group_name);
    if (existing) {
      existing.nodes.push(node);
    } else {
      map.set(node.group_name, { name: node.group_name, order: node.group_order, nodes: [node] });
    }
  }
  const groups = Array.from(map.values());
  groups.forEach((g) => g.nodes.sort((a, b) => a.order_index - b.order_index));
  groups.sort((a, b) => a.order - b.order);
  return groups;
}

type NodeFormState = {
  mode: "create" | "edit";
  nodeId: number | null;
  groupName: string;
  groupOrder: number;
  orderIndex: number;
  title: string;
  nodeType: CurriculumNodeAdmin["node_type"];
  textbookId: string;
  lectureAssignmentId: string;
  description: string;
};

const inputCls =
  "w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-bold text-[#17213B] outline-none focus:border-[#0F172A]";

function AdminCurriculumsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryStudentId = searchParams.get("student_id") ?? "";
  const queryCurriculumId = searchParams.get("curriculum_id") ?? "";

  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(queryStudentId);

  const [assignedCurriculums, setAssignedCurriculums] = useState<CurriculumListItem[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [assignedError, setAssignedError] = useState("");

  const [allCurriculums, setAllCurriculums] = useState<CurriculumAdminItem[]>([]);

  const [selectedCurriculumId, setSelectedCurriculumId] = useState<number | null>(
    queryCurriculumId ? Number(queryCurriculumId) : null,
  );
  const [detail, setDetail] = useState<CurriculumAdminDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [preview, setPreview] = useState<CurriculumNodesResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [textbookOptions, setTextbookOptions] = useState<TextbookOption[]>([]);
  const [lectureOptions, setLectureOptions] = useState<LectureAssignmentOption[]>([]);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [newCurriculumForm, setNewCurriculumForm] = useState({ subject: "", title: "", description: "" });
  const [creatingCurriculum, setCreatingCurriculum] = useState(false);
  const [assignExistingId, setAssignExistingId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [editCurriculumForm, setEditCurriculumForm] = useState({ subject: "", title: "", description: "" });
  const [savingCurriculum, setSavingCurriculum] = useState(false);

  const [nodeForm, setNodeForm] = useState<NodeFormState | null>(null);
  const [savingNode, setSavingNode] = useState(false);
  const [prereqSelection, setPrereqSelection] = useState<Set<number>>(new Set());

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }
    const loadStudents = async () => {
      setStudentsLoading(true);
      setStudentsError("");
      try {
        setStudents(await apiFetch<AdminStudentSummary[]>("/admin/students"));
      } catch (err) {
        setStudentsError(errorMessage(err, "학생 목록을 불러오지 못했습니다."));
      } finally {
        setStudentsLoading(false);
      }
    };
    void loadStudents();
  }, [router]);

  const fetchAssignedCurriculums = useCallback(async (studentId: string) => {
    setAssignedLoading(true);
    setAssignedError("");
    try {
      setAssignedCurriculums(await apiFetch<CurriculumListItem[]>(`/admin/students/${studentId}/curriculums`));
    } catch (err) {
      setAssignedCurriculums([]);
      setAssignedError(errorMessage(err, "커리큘럼 목록을 불러오지 못했습니다."));
    } finally {
      setAssignedLoading(false);
    }
  }, []);

  const fetchStudentContext = useCallback(async (studentId: string) => {
    try {
      const [textbookRes, lectureRes] = await Promise.all([
        apiFetch<{ textbooks: { id: number; title: string; short_title: string; subject: string }[] }>(
          `/admin/textbooks-for-student/${studentId}`,
        ),
        apiFetch<LectureAssignmentOption[]>(`/admin/lecture-assignments?student_id=${studentId}`),
      ]);
      setTextbookOptions(textbookRes.textbooks.map((t) => ({ id: t.id, title: t.title, short_title: t.short_title, subject: t.subject })));
      setLectureOptions(lectureRes.filter((l) => l.status === "active"));
    } catch {
      setTextbookOptions([]);
      setLectureOptions([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedStudentId) {
      setAssignedCurriculums([]);
      setTextbookOptions([]);
      setLectureOptions([]);
      return;
    }
    void fetchAssignedCurriculums(selectedStudentId);
    void fetchStudentContext(selectedStudentId);
  }, [selectedStudentId, fetchAssignedCurriculums, fetchStudentContext]);

  useEffect(() => {
    apiFetch<CurriculumAdminItem[]>("/admin/curriculums")
      .then(setAllCurriculums)
      .catch(() => setAllCurriculums([]));
  }, []);

  const fetchDetail = useCallback(async (curriculumId: number) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await apiFetch<CurriculumAdminDetail>(`/admin/curriculums/${curriculumId}`);
      setDetail(result);
      setEditCurriculumForm({ subject: result.subject, title: result.title, description: result.description ?? "" });
    } catch (err) {
      setDetail(null);
      setDetailError(errorMessage(err, "커리큘럼 상세를 불러오지 못했습니다."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const fetchPreview = useCallback(async (curriculumId: number, studentId: string) => {
    if (!studentId) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const assigned = await apiFetch<CurriculumListItem[]>(`/admin/students/${studentId}/curriculums`);
      const match = assigned.find((c) => c.curriculum_id === curriculumId);
      if (!match) {
        setPreview(null);
        return;
      }
      const result = await apiFetch<CurriculumNodesResponse>(
        `/admin/students/${studentId}/curriculums/${match.student_curriculum_id}/nodes`,
      );
      setPreview(result);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCurriculumId) {
      void fetchDetail(selectedCurriculumId);
    } else {
      setDetail(null);
    }
  }, [selectedCurriculumId, fetchDetail]);

  const refreshAll = useCallback(async () => {
    if (selectedCurriculumId) await fetchDetail(selectedCurriculumId);
    if (selectedCurriculumId && selectedStudentId) await fetchPreview(selectedCurriculumId, selectedStudentId);
    if (selectedStudentId) await fetchAssignedCurriculums(selectedStudentId);
  }, [selectedCurriculumId, selectedStudentId, fetchDetail, fetchPreview, fetchAssignedCurriculums]);

  useEffect(() => {
    if (selectedCurriculumId && selectedStudentId) {
      void fetchPreview(selectedCurriculumId, selectedStudentId);
    } else {
      setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCurriculumId, selectedStudentId, detail]);

  const selectStudent = (id: string) => {
    setSelectedStudentId(id);
    setSelectedCurriculumId(null);
    setDetail(null);
    setMessage("");
    setError("");
    router.replace(buildPageHref(id));
  };

  const selectCurriculum = (id: number) => {
    setSelectedCurriculumId(id);
    setNodeForm(null);
    setMessage("");
    setError("");
    router.replace(buildPageHref(selectedStudentId, id));
  };

  const handleCreateCurriculum = async () => {
    if (!selectedStudentId) return;
    if (!newCurriculumForm.subject.trim() || !newCurriculumForm.title.trim()) {
      setError("과목과 제목을 입력해주세요.");
      return;
    }
    setCreatingCurriculum(true);
    setError("");
    try {
      const created = await apiFetch<CurriculumAdminItem>("/admin/curriculums", {
        method: "POST",
        body: {
          subject: newCurriculumForm.subject.trim(),
          title: newCurriculumForm.title.trim(),
          description: newCurriculumForm.description.trim() || null,
          student_id: Number(selectedStudentId),
        },
      });
      setNewCurriculumForm({ subject: "", title: "", description: "" });
      setMessage(`"${created.title}" 커리큘럼을 만들고 이 학생에게 배정했습니다.`);
      setAllCurriculums((prev) => [...prev, created]);
      await fetchAssignedCurriculums(selectedStudentId);
      selectCurriculum(created.id);
    } catch (err) {
      setError(errorMessage(err, "커리큘럼 생성에 실패했습니다."));
    } finally {
      setCreatingCurriculum(false);
    }
  };

  const handleAssignExisting = async () => {
    if (!selectedStudentId || !assignExistingId) return;
    setAssigning(true);
    setError("");
    try {
      await apiFetch(`/admin/students/${selectedStudentId}/curriculums`, {
        method: "POST",
        body: { curriculum_id: Number(assignExistingId) },
      });
      setAssignExistingId("");
      setMessage("커리큘럼을 배정했습니다.");
      await fetchAssignedCurriculums(selectedStudentId);
    } catch (err) {
      setError(errorMessage(err, "배정에 실패했습니다."));
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (item: CurriculumListItem) => {
    if (!selectedStudentId) return;
    if (!window.confirm(`"${item.title}" 배정을 해제하시겠습니까? (완료 기록은 보존되고, 나중에 다시 배정하면 이어서 표시됩니다.)`)) return;
    setError("");
    try {
      await apiFetch(`/admin/students/${selectedStudentId}/curriculums/${item.student_curriculum_id}`, { method: "DELETE" });
      setMessage("배정을 해제했습니다.");
      await fetchAssignedCurriculums(selectedStudentId);
      if (selectedCurriculumId === item.curriculum_id) setPreview(null);
    } catch (err) {
      setError(errorMessage(err, "배정 해제에 실패했습니다."));
    }
  };

  const handleSaveCurriculumInfo = async () => {
    if (!selectedCurriculumId) return;
    if (!editCurriculumForm.subject.trim() || !editCurriculumForm.title.trim()) {
      setError("과목과 제목을 입력해주세요.");
      return;
    }
    setSavingCurriculum(true);
    setError("");
    try {
      await apiFetch(`/admin/curriculums/${selectedCurriculumId}`, {
        method: "PATCH",
        body: {
          subject: editCurriculumForm.subject.trim(),
          title: editCurriculumForm.title.trim(),
          description: editCurriculumForm.description.trim() || null,
        },
      });
      setMessage("커리큘럼 정보를 수정했습니다.");
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err, "수정에 실패했습니다."));
    } finally {
      setSavingCurriculum(false);
    }
  };

  const handleDeleteCurriculum = async () => {
    if (!selectedCurriculumId || !detail) return;
    if (!window.confirm(`"${detail.title}" 커리큘럼을 삭제하시겠습니까? (배정된 학생 화면에서 즉시 사라집니다. 완료 기록은 보존됩니다.)`)) return;
    setError("");
    try {
      await apiFetch(`/admin/curriculums/${selectedCurriculumId}`, { method: "DELETE" });
      setMessage("커리큘럼을 삭제했습니다.");
      setAllCurriculums((prev) => prev.filter((c) => c.id !== selectedCurriculumId));
      setSelectedCurriculumId(null);
      setDetail(null);
      if (selectedStudentId) await fetchAssignedCurriculums(selectedStudentId);
    } catch (err) {
      setError(errorMessage(err, "삭제에 실패했습니다."));
    }
  };

  const stages = useMemo(() => (detail ? groupNodesByStage(detail.nodes) : []), [detail]);

  const nextGroupOrder = useMemo(() => (stages.length ? Math.max(...stages.map((s) => s.order)) + 1 : 1), [stages]);

  const [pendingStageName, setPendingStageName] = useState("");

  const openCreateNodeForm = (groupName: string, groupOrder: number) => {
    const stage = stages.find((s) => s.name === groupName);
    const nextOrderIndex = stage ? Math.max(...stage.nodes.map((n) => n.order_index), 0) + 1 : 1;
    setNodeForm({
      mode: "create",
      nodeId: null,
      groupName,
      groupOrder,
      orderIndex: nextOrderIndex,
      title: "",
      nodeType: "textbook",
      textbookId: "",
      lectureAssignmentId: "",
      description: "",
    });
    setPrereqSelection(new Set());
  };

  const openEditNodeForm = (node: CurriculumNodeAdmin) => {
    setNodeForm({
      mode: "edit",
      nodeId: node.id,
      groupName: node.group_name,
      groupOrder: node.group_order,
      orderIndex: node.order_index,
      title: node.title,
      nodeType: node.node_type,
      textbookId: node.textbook_id ? String(node.textbook_id) : "",
      lectureAssignmentId: node.lecture_assignment_id ? String(node.lecture_assignment_id) : "",
      description: node.description ?? "",
    });
    setPrereqSelection(new Set(node.prerequisite_node_ids));
  };

  const handleAddStage = () => {
    if (!pendingStageName.trim()) return;
    openCreateNodeForm(pendingStageName.trim(), nextGroupOrder);
    setPendingStageName("");
  };

  const handleRenameStage = async (stage: StageGroup) => {
    const nextName = window.prompt("새 단계 이름을 입력해주세요.", stage.name);
    if (!nextName || !nextName.trim() || nextName.trim() === stage.name || !selectedCurriculumId) return;
    setError("");
    try {
      await Promise.all(
        stage.nodes.map((node) =>
          apiFetch(`/admin/curriculums/${selectedCurriculumId}/nodes/${node.id}`, {
            method: "PATCH",
            body: { group_name: nextName.trim() },
          }),
        ),
      );
      setMessage("단계 이름을 수정했습니다.");
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err, "단계 이름 수정에 실패했습니다."));
    }
  };

  const handleMoveStage = async (stage: StageGroup, direction: -1 | 1) => {
    if (!selectedCurriculumId) return;
    const sorted = [...stages].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((s) => s.name === stage.name);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const target = sorted[targetIndex];
    setError("");
    try {
      await Promise.all([
        ...stage.nodes.map((node) =>
          apiFetch(`/admin/curriculums/${selectedCurriculumId}/nodes/${node.id}`, {
            method: "PATCH",
            body: { group_order: target.order },
          }),
        ),
        ...target.nodes.map((node) =>
          apiFetch(`/admin/curriculums/${selectedCurriculumId}/nodes/${node.id}`, {
            method: "PATCH",
            body: { group_order: stage.order },
          }),
        ),
      ]);
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err, "단계 순서 변경에 실패했습니다."));
    }
  };

  const handleMoveNode = async (stage: StageGroup, node: CurriculumNodeAdmin, direction: -1 | 1) => {
    if (!selectedCurriculumId) return;
    const sorted = [...stage.nodes].sort((a, b) => a.order_index - b.order_index);
    const index = sorted.findIndex((n) => n.id === node.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const target = sorted[targetIndex];
    setError("");
    try {
      await Promise.all([
        apiFetch(`/admin/curriculums/${selectedCurriculumId}/nodes/${node.id}`, {
          method: "PATCH",
          body: { order_index: target.order_index },
        }),
        apiFetch(`/admin/curriculums/${selectedCurriculumId}/nodes/${target.id}`, {
          method: "PATCH",
          body: { order_index: node.order_index },
        }),
      ]);
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err, "노드 순서 변경에 실패했습니다."));
    }
  };

  const handleSaveNode = async () => {
    if (!nodeForm || !selectedCurriculumId) return;
    if (!nodeForm.title.trim()) {
      setError("노드 제목을 입력해주세요.");
      return;
    }
    if (nodeForm.nodeType === "lecture" && !nodeForm.lectureAssignmentId) {
      setError("인강 노드는 연결할 인강 배정을 선택해주세요.");
      return;
    }
    setSavingNode(true);
    setError("");
    try {
      const basePayload = {
        title: nodeForm.title.trim(),
        node_type: nodeForm.nodeType,
        group_name: nodeForm.groupName,
        group_order: nodeForm.groupOrder,
        order_index: nodeForm.orderIndex,
        textbook_id: nodeForm.nodeType === "textbook" && nodeForm.textbookId ? Number(nodeForm.textbookId) : null,
        lecture_assignment_id: nodeForm.nodeType === "lecture" && nodeForm.lectureAssignmentId ? Number(nodeForm.lectureAssignmentId) : null,
        description: nodeForm.description.trim() || null,
        student_id: selectedStudentId ? Number(selectedStudentId) : null,
      };

      if (nodeForm.mode === "create") {
        await apiFetch(`/admin/curriculums/${selectedCurriculumId}/nodes`, {
          method: "POST",
          body: { ...basePayload, prerequisite_node_ids: Array.from(prereqSelection) },
        });
        setMessage("노드를 추가했습니다.");
      } else if (nodeForm.nodeId) {
        await apiFetch(`/admin/curriculums/${selectedCurriculumId}/nodes/${nodeForm.nodeId}`, {
          method: "PATCH",
          body: basePayload,
        });

        // Reconcile prerequisite edges against the current node's saved prerequisite set.
        const currentNode = detail?.nodes.find((n) => n.id === nodeForm.nodeId);
        const before = new Set(currentNode?.prerequisite_node_ids ?? []);
        const after = prereqSelection;
        const toAdd = Array.from(after).filter((id) => !before.has(id));
        const toRemove = Array.from(before).filter((id) => !after.has(id));

        await Promise.all([
          ...toAdd.map((fromId) =>
            apiFetch(`/admin/curriculums/${selectedCurriculumId}/edges`, {
              method: "POST",
              body: { from_node_id: fromId, to_node_id: nodeForm.nodeId },
            }),
          ),
          ...toRemove.map(async (fromId) => {
            const edge = detail?.edges.find((e) => e.from_node_id === fromId && e.to_node_id === nodeForm.nodeId);
            if (edge) {
              await apiFetch(`/admin/curriculums/${selectedCurriculumId}/edges/${edge.id}`, { method: "DELETE" });
            }
          }),
        ]);
        setMessage("노드를 수정했습니다.");
      }
      setNodeForm(null);
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err, "노드 저장에 실패했습니다."));
    } finally {
      setSavingNode(false);
    }
  };

  const handleDeleteNode = async (node: CurriculumNodeAdmin) => {
    if (!selectedCurriculumId) return;
    if (!window.confirm(`"${node.title}" 노드를 삭제하시겠습니까? (연결된 선행 관계도 함께 정리됩니다.)`)) return;
    setError("");
    try {
      await apiFetch(`/admin/curriculums/${selectedCurriculumId}/nodes/${node.id}`, { method: "DELETE" });
      setMessage("노드를 삭제했습니다.");
      if (nodeForm?.nodeId === node.id) setNodeForm(null);
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err, "노드 삭제에 실패했습니다."));
    }
  };

  const availablePrereqNodes = useMemo(
    () => (detail && nodeForm ? detail.nodes.filter((n) => n.id !== nodeForm.nodeId) : []),
    [detail, nodeForm],
  );

  const unassignedCurriculums = useMemo(
    () => allCurriculums.filter((c) => c.is_active && !assignedCurriculums.some((a) => a.curriculum_id === c.id)),
    [allCurriculums, assignedCurriculums],
  );

  const selectedStudent = useMemo(
    () => students.find((s) => String(s.id) === selectedStudentId) ?? null,
    [selectedStudentId, students],
  );

  return (
    <main className="min-h-screen bg-[#F4F6FA]">
      <div className="mx-auto max-w-7xl px-4 pb-32 pt-7 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <section className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <p className="text-sm font-semibold text-[#7C8799]">관리자</p>
            <h1 className="mt-2 text-[2rem] font-black tracking-tight text-[#17213B] sm:text-[2.3rem]">진도표</h1>
            <p className="mt-2 text-sm leading-6 text-[#667085]">
              학생을 선택한 뒤 커리큘럼을 만들고, 단계·노드·선행 관계를 등록하면 학생 화면에 흐름도로 표시됩니다.
            </p>
          </section>

          {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600">{message}</p> : null}
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{error}</p> : null}

          <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <label className="mb-2 block text-sm font-black text-[#17213B]" htmlFor="curriculum-student">
              1. 학생 선택
            </label>
            <select
              className={inputCls}
              id="curriculum-student"
              onChange={(e) => selectStudent(e.target.value)}
              value={selectedStudentId}
            >
              <option value="">학생을 선택해주세요.</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.grade}
                </option>
              ))}
            </select>
            {studentsLoading ? <p className="mt-3 text-xs font-bold text-[#98A2B3]">학생 목록을 불러오는 중입니다.</p> : null}
            {studentsError ? <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{studentsError}</p> : null}
            {selectedStudent ? (
              <div className="mt-4 rounded-2xl bg-[#F8FAFC] px-4 py-3">
                <p className="text-sm font-black text-[#17213B]">{selectedStudent.name}</p>
                <p className="mt-1 text-xs font-bold text-[#98A2B3]">{selectedStudent.grade}</p>
              </div>
            ) : null}
          </section>

          {selectedStudentId ? (
            <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <div className="space-y-4">
                <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                  <h2 className="text-lg font-black text-[#17213B]">2. 이 학생의 커리큘럼</h2>

                  {assignedLoading ? (
                    <p className="mt-4 text-sm font-bold text-[#98A2B3]">불러오는 중입니다.</p>
                  ) : assignedError ? (
                    <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{assignedError}</p>
                  ) : assignedCurriculums.length === 0 ? (
                    <p className="mt-4 rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-6 text-center text-sm font-bold text-[#98A2B3]">
                      아직 배정된 커리큘럼이 없습니다.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {assignedCurriculums.map((item) => (
                        <div
                          className={`rounded-2xl border p-3 ${
                            selectedCurriculumId === item.curriculum_id ? "border-[#635BFF] bg-[#F8F7FF]" : "border-[#EEF2FF] bg-[#FBFCFE]"
                          }`}
                          key={item.student_curriculum_id}
                        >
                          <button className="w-full text-left" onClick={() => selectCurriculum(item.curriculum_id)} type="button">
                            <p className="text-xs font-black text-[#635BFF]">{item.subject}</p>
                            <p className="mt-0.5 text-sm font-black text-[#17213B]">{item.title}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-black">
                              <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[#4F46E5]">진행 {item.in_progress_count}</span>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">완료 {item.completed_count}</span>
                              <span className="rounded-full bg-[#F4F6FA] px-2 py-0.5 text-[#667085]">예정 {item.planned_count}</span>
                            </div>
                          </button>
                          <button
                            className="mt-2 rounded-full bg-white px-3 py-1 text-[11px] font-black text-red-500 shadow-sm hover:bg-red-50"
                            onClick={() => void handleUnassign(item)}
                            type="button"
                          >
                            배정 해제
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {unassignedCurriculums.length > 0 ? (
                    <div className="mt-4 border-t border-black/5 pt-4">
                      <label className="mb-2 block text-xs font-bold text-[#667085]">기존 커리큘럼 배정하기</label>
                      <div className="flex gap-2">
                        <select className={inputCls} onChange={(e) => setAssignExistingId(e.target.value)} value={assignExistingId}>
                          <option value="">선택</option>
                          {unassignedCurriculums.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.subject} · {c.title}
                            </option>
                          ))}
                        </select>
                        <button
                          className="shrink-0 rounded-2xl bg-[#0F172A] px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                          disabled={!assignExistingId || assigning}
                          onClick={() => void handleAssignExisting()}
                          type="button"
                        >
                          배정
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 border-t border-black/5 pt-4">
                    <label className="mb-2 block text-xs font-bold text-[#667085]">새 커리큘럼 만들기</label>
                    <div className="space-y-2">
                      <input
                        className={inputCls}
                        onChange={(e) => setNewCurriculumForm((f) => ({ ...f, subject: e.target.value }))}
                        placeholder="과목 (예: 수학)"
                        value={newCurriculumForm.subject}
                      />
                      <input
                        className={inputCls}
                        onChange={(e) => setNewCurriculumForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="커리큘럼 제목 (예: 수학 커리큘럼)"
                        value={newCurriculumForm.title}
                      />
                      <textarea
                        className={`${inputCls} min-h-[64px] resize-y`}
                        onChange={(e) => setNewCurriculumForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="설명 (선택)"
                        value={newCurriculumForm.description}
                      />
                      <button
                        className="w-full rounded-2xl bg-[#0F172A] py-3 text-sm font-black text-white disabled:opacity-50"
                        disabled={creatingCurriculum}
                        onClick={() => void handleCreateCurriculum()}
                        type="button"
                      >
                        {creatingCurriculum ? "만드는 중..." : "만들고 이 학생에게 배정"}
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              <section className="space-y-4">
                {!selectedCurriculumId ? (
                  <div className="rounded-[28px] border border-white/80 bg-white p-8 text-center shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                    <p className="text-sm font-bold text-[#98A2B3]">왼쪽에서 커리큘럼을 선택하거나 새로 만들어주세요.</p>
                  </div>
                ) : detailLoading ? (
                  <p className="text-sm font-bold text-[#98A2B3]">불러오는 중입니다.</p>
                ) : detailError ? (
                  <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{detailError}</p>
                ) : detail ? (
                  <>
                    <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
                      <h2 className="text-lg font-black text-[#17213B]">3. 커리큘럼 기본정보</h2>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-[#667085]">과목</label>
                          <input
                            className={inputCls}
                            onChange={(e) => setEditCurriculumForm((f) => ({ ...f, subject: e.target.value }))}
                            value={editCurriculumForm.subject}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-[#667085]">제목</label>
                          <input
                            className={inputCls}
                            onChange={(e) => setEditCurriculumForm((f) => ({ ...f, title: e.target.value }))}
                            value={editCurriculumForm.title}
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="mb-1.5 block text-xs font-bold text-[#667085]">설명</label>
                        <textarea
                          className={`${inputCls} min-h-[64px] resize-y`}
                          onChange={(e) => setEditCurriculumForm((f) => ({ ...f, description: e.target.value }))}
                          value={editCurriculumForm.description}
                        />
                      </div>
                      <div className="mt-4 flex gap-3">
                        <button
                          className="flex-1 rounded-2xl bg-[#0F172A] py-3 text-sm font-black text-white disabled:opacity-50"
                          disabled={savingCurriculum}
                          onClick={() => void handleSaveCurriculumInfo()}
                          type="button"
                        >
                          저장
                        </button>
                        <button
                          className="rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-black text-red-500 hover:bg-red-50"
                          onClick={() => void handleDeleteCurriculum()}
                          type="button"
                        >
                          커리큘럼 삭제
                        </button>
                      </div>
                    </section>

                    <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-black text-[#17213B]">4. 단계 · 노드 · 선행 관계</h2>
                      </div>
                      <p className="mt-1 text-xs text-[#98A2B3]">
                        드래그 정렬은 지원하지 않습니다 — 위/아래 버튼으로 순서를 바꿔주세요.
                      </p>

                      <div className="mt-4 flex gap-2">
                        <input
                          className={inputCls}
                          onChange={(e) => setPendingStageName(e.target.value)}
                          placeholder="새 단계 이름 (예: 3단계 실전 적용)"
                          value={pendingStageName}
                        />
                        <button
                          className="shrink-0 rounded-2xl bg-[#0F172A] px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                          disabled={!pendingStageName.trim()}
                          onClick={handleAddStage}
                          type="button"
                        >
                          단계 추가
                        </button>
                      </div>

                      <div className="mt-4 space-y-4">
                        {stages.length === 0 ? (
                          <p className="rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-6 text-center text-sm font-bold text-[#98A2B3]">
                            아직 단계가 없습니다. 위에서 단계 이름을 입력하고 "단계 추가"를 눌러 첫 노드를 만들어보세요.
                          </p>
                        ) : (
                          stages
                            .sort((a, b) => a.order - b.order)
                            .map((stage, stageIndex) => (
                              <div className="rounded-2xl border border-[#EEF2FF] bg-[#FBFCFE] p-4" key={stage.name}>
                                <div className="flex items-center justify-between gap-3">
                                  <h3 className="text-sm font-black text-[#17213B]">
                                    {stageIndex + 1}. {stage.name}
                                  </h3>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#667085] shadow-sm disabled:opacity-30"
                                      disabled={stageIndex === 0}
                                      onClick={() => void handleMoveStage(stage, -1)}
                                      type="button"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#667085] shadow-sm disabled:opacity-30"
                                      disabled={stageIndex === stages.length - 1}
                                      onClick={() => void handleMoveStage(stage, 1)}
                                      type="button"
                                    >
                                      ▼
                                    </button>
                                    <button
                                      className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#4F46E5] shadow-sm"
                                      onClick={() => void handleRenameStage(stage)}
                                      type="button"
                                    >
                                      이름 수정
                                    </button>
                                    <button
                                      className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#0F172A] shadow-sm"
                                      onClick={() => openCreateNodeForm(stage.name, stage.order)}
                                      type="button"
                                    >
                                      + 노드
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-3 space-y-2">
                                  {stage.nodes.map((node, nodeIndex) => (
                                    <div className="flex flex-col gap-2 rounded-2xl bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between" key={node.id}>
                                      <div className="min-w-0">
                                        <p className="text-sm font-black text-[#17213B]">{node.title}</p>
                                        <p className="mt-0.5 text-xs font-semibold text-[#98A2B3]">
                                          {nodeTypeLabel(node.node_type)}
                                          {node.prerequisite_node_ids.length > 0
                                            ? ` · 선행 ${node.prerequisite_node_ids.length}개`
                                            : ""}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                          className="rounded-full bg-[#F4F6FA] px-2.5 py-1 text-xs font-black text-[#667085] disabled:opacity-30"
                                          disabled={nodeIndex === 0}
                                          onClick={() => void handleMoveNode(stage, node, -1)}
                                          type="button"
                                        >
                                          ▲
                                        </button>
                                        <button
                                          className="rounded-full bg-[#F4F6FA] px-2.5 py-1 text-xs font-black text-[#667085] disabled:opacity-30"
                                          disabled={nodeIndex === stage.nodes.length - 1}
                                          onClick={() => void handleMoveNode(stage, node, 1)}
                                          type="button"
                                        >
                                          ▼
                                        </button>
                                        <button
                                          className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-black text-[#4F46E5]"
                                          onClick={() => openEditNodeForm(node)}
                                          type="button"
                                        >
                                          수정
                                        </button>
                                        <button
                                          className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-500"
                                          onClick={() => void handleDeleteNode(node)}
                                          type="button"
                                        >
                                          삭제
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </section>

                    {nodeForm ? (
                      <section className="rounded-[28px] border border-[#635BFF]/30 bg-[#F8F7FF] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
                        <h2 className="text-lg font-black text-[#17213B]">
                          {nodeForm.mode === "create" ? `"${nodeForm.groupName}" 단계에 노드 추가` : "노드 수정"}
                        </h2>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-bold text-[#667085]">제목</label>
                            <input
                              className={inputCls}
                              onChange={(e) => setNodeForm((f) => (f ? { ...f, title: e.target.value } : f))}
                              value={nodeForm.title}
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-bold text-[#667085]">노드 유형</label>
                            <select
                              className={inputCls}
                              onChange={(e) =>
                                setNodeForm((f) => (f ? { ...f, nodeType: e.target.value as CurriculumNodeAdmin["node_type"] } : f))
                              }
                              value={nodeForm.nodeType}
                            >
                              {NODE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {nodeForm.nodeType === "textbook" ? (
                          <div className="mt-3">
                            <label className="mb-1.5 block text-xs font-bold text-[#667085]">연결할 교재</label>
                            <select
                              className={inputCls}
                              onChange={(e) => setNodeForm((f) => (f ? { ...f, textbookId: e.target.value } : f))}
                              value={nodeForm.textbookId}
                            >
                              <option value="">선택 안 함</option>
                              {textbookOptions.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.subject} · {t.short_title || t.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        {nodeForm.nodeType === "lecture" ? (
                          <div className="mt-3">
                            <label className="mb-1.5 block text-xs font-bold text-[#667085]">연결할 인강 배정 (이 학생의 배정만 표시)</label>
                            <select
                              className={inputCls}
                              onChange={(e) => setNodeForm((f) => (f ? { ...f, lectureAssignmentId: e.target.value } : f))}
                              value={nodeForm.lectureAssignmentId}
                            >
                              <option value="">선택</option>
                              {lectureOptions.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.subject} · {l.course_title}
                                </option>
                              ))}
                            </select>
                            {lectureOptions.length === 0 ? (
                              <p className="mt-1.5 text-[11px] font-bold text-[#98A2B3]">
                                이 학생에게 활성 상태인 인강 배정이 없습니다. 먼저 인강을 배정해주세요.
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3">
                          <label className="mb-1.5 block text-xs font-bold text-[#667085]">설명 (선택)</label>
                          <textarea
                            className={`${inputCls} min-h-[56px] resize-y`}
                            onChange={(e) => setNodeForm((f) => (f ? { ...f, description: e.target.value } : f))}
                            value={nodeForm.description}
                          />
                        </div>

                        <div className="mt-3">
                          <label className="mb-1.5 block text-xs font-bold text-[#667085]">선행 노드 (다중 선택)</label>
                          <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-3">
                            {availablePrereqNodes.length === 0 ? (
                              <p className="text-xs font-bold text-[#98A2B3]">선택할 수 있는 다른 노드가 없습니다.</p>
                            ) : (
                              availablePrereqNodes.map((n) => (
                                <label className="flex items-center gap-2 text-sm font-bold text-[#344054]" key={n.id}>
                                  <input
                                    checked={prereqSelection.has(n.id)}
                                    onChange={(e) =>
                                      setPrereqSelection((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(n.id);
                                        else next.delete(n.id);
                                        return next;
                                      })
                                    }
                                    type="checkbox"
                                  />
                                  {n.group_name} · {n.title}
                                </label>
                              ))
                            )}
                          </div>
                          {nodeForm.mode === "create" ? (
                            <p className="mt-1.5 text-[11px] font-bold text-[#98A2B3]">
                              새 노드는 아직 다른 노드가 선행하지 않으므로 순환 걱정 없이 자유롭게 선택할 수 있습니다.
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-4 flex gap-3">
                          <button
                            className="flex-1 rounded-2xl bg-[#0F172A] py-3 text-sm font-black text-white disabled:opacity-50"
                            disabled={savingNode}
                            onClick={() => void handleSaveNode()}
                            type="button"
                          >
                            {savingNode ? "저장 중..." : "저장"}
                          </button>
                          <button
                            className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#344054]"
                            onClick={() => setNodeForm(null)}
                            type="button"
                          >
                            취소
                          </button>
                        </div>
                      </section>
                    ) : null}

                    <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
                      <h2 className="text-lg font-black text-[#17213B]">5. 학생 화면 미리보기</h2>
                      <p className="mt-1 text-xs text-[#98A2B3]">
                        저장한 데이터를 다시 조회해 학생 화면과 동일한 방식으로 렌더링합니다.
                      </p>
                      <div className="mt-4 space-y-3">
                        {previewLoading ? (
                          <p className="py-6 text-center text-sm font-bold text-[#98A2B3]">불러오는 중...</p>
                        ) : !preview ? (
                          <p className="rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-6 text-center text-sm font-bold text-[#98A2B3]">
                            이 학생에게 배정되어 있지 않아 미리보기를 표시할 수 없습니다. 위에서 배정을 확인해주세요.
                          </p>
                        ) : preview.groups.length === 0 ? (
                          <p className="rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-6 text-center text-sm font-bold text-[#98A2B3]">
                            등록된 노드가 없습니다.
                          </p>
                        ) : (
                          preview.groups.map((group) => (
                            <GroupSection
                              defaultExpanded={!group.nodes.every((n) => n.status === "completed" || n.status === "skipped")}
                              edges={preview.edges}
                              filter="all"
                              group={group}
                              key={group.name}
                              onNodeClick={() => {}}
                            />
                          ))
                        )}
                      </div>
                    </section>
                  </>
                ) : null}
              </section>
            </section>
          ) : null}
        </div>
      </div>

      <AdminBottomNav />
    </main>
  );
}

export default function AdminCurriculumsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F4F6FA]">
          <div className="mx-auto max-w-7xl px-4 pb-32 pt-7 sm:px-6 lg:px-8">
            <div className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
              <p className="text-sm font-semibold text-[#7C8799]">관리자</p>
              <h1 className="mt-2 text-[2rem] font-black tracking-tight text-[#17213B] sm:text-[2.3rem]">진도표</h1>
              <p className="mt-2 text-sm leading-6 text-[#667085]">페이지를 불러오는 중입니다.</p>
            </div>
          </div>
          <AdminBottomNav />
        </main>
      }
    >
      <AdminCurriculumsPageContent />
    </Suspense>
  );
}
