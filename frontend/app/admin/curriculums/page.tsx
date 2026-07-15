"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch } from "@/lib/api";
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

type CurriculumNode = {
  id: number;
  title: string;
  node_type: string;
  group_name: string;
  group_order: number;
  status: string;
  link_url: string | null;
};

type CurriculumGroup = {
  name: string;
  order: number;
  group_number: number;
  nodes: CurriculumNode[];
};

type CurriculumNodesResponse = {
  groups: CurriculumGroup[];
  edges: { from_node_id: number; to_node_id: number; edge_type: string }[];
};

function buildPageHref(studentId: string, curriculumId?: number | null) {
  const params = new URLSearchParams();
  if (studentId) {
    params.set("student_id", studentId);
  }
  if (curriculumId) {
    params.set("curriculum_id", String(curriculumId));
  }
  const query = params.toString();
  return query ? `/admin/curriculums?${query}` : "/admin/curriculums";
}

function getStatusLabel(status: string) {
  if (status === "completed") return "완료";
  if (status === "in_progress") return "진행 중";
  if (status === "paused") return "보류";
  if (status === "skipped") return "건너뜀";
  return "예정";
}

function getStatusClass(status: string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-600";
  if (status === "in_progress") return "bg-[#EEF2FF] text-[#4F46E5]";
  if (status === "paused") return "bg-amber-50 text-amber-600";
  if (status === "skipped") return "bg-slate-100 text-slate-500";
  return "bg-[#F4F6FA] text-[#667085]";
}

function AdminCurriculumsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryStudentId = searchParams.get("student_id") ?? "";
  const queryCurriculumId = searchParams.get("curriculum_id") ?? "";

  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(queryStudentId);

  const [curriculums, setCurriculums] = useState<CurriculumListItem[]>([]);
  const [curriculumsLoading, setCurriculumsLoading] = useState(false);
  const [curriculumsError, setCurriculumsError] = useState("");

  const [detail, setDetail] = useState<CurriculumNodesResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    setSelectedStudentId(queryStudentId);
  }, [queryStudentId]);

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
        const result = await apiFetch<AdminStudentSummary[]>("/admin/students");
        setStudents(result);
      } catch (error) {
        setStudents([]);
        setStudentsError(error instanceof Error ? error.message : "학생 목록을 불러오지 못했습니다.");
      } finally {
        setStudentsLoading(false);
      }
    };

    void loadStudents();
  }, [router]);

  useEffect(() => {
    if (!selectedStudentId) {
      setCurriculums([]);
      setCurriculumsError("");
      return;
    }

    const loadCurriculums = async () => {
      setCurriculumsLoading(true);
      setCurriculumsError("");
      try {
        const result = await apiFetch<CurriculumListItem[]>(
          `/admin/students/${selectedStudentId}/curriculums`,
        );
        setCurriculums(result);
      } catch (error) {
        setCurriculums([]);
        setCurriculumsError(error instanceof Error ? error.message : "진도표 목록을 불러오지 못했습니다.");
      } finally {
        setCurriculumsLoading(false);
      }
    };

    void loadCurriculums();
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedStudentId || !queryCurriculumId) {
      setDetail(null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }

    const curriculumId = Number(queryCurriculumId);
    if (Number.isNaN(curriculumId)) {
      setDetail(null);
      setDetailError("올바르지 않은 진도표입니다.");
      setDetailLoading(false);
      return;
    }

    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailError("");
      try {
        const result = await apiFetch<CurriculumNodesResponse>(
          `/admin/students/${selectedStudentId}/curriculums/${curriculumId}/nodes`,
        );
        setDetail(result);
      } catch (error) {
        setDetail(null);
        setDetailError(error instanceof Error ? error.message : "진도표 상세를 불러오지 못했습니다.");
      } finally {
        setDetailLoading(false);
      }
    };

    void loadDetail();
  }, [queryCurriculumId, selectedStudentId]);

  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === selectedStudentId) ?? null,
    [selectedStudentId, students],
  );

  const detailSummary = useMemo(() => {
    const nodes = detail?.groups.flatMap((group) => group.nodes) ?? [];
    return {
      total: nodes.length,
      inProgress: nodes.filter((node) => node.status === "in_progress").length,
      completed: nodes.filter((node) => node.status === "completed").length,
    };
  }, [detail]);

  return (
    <main className="min-h-screen bg-[#F4F6FA]">
      <div className="mx-auto max-w-7xl px-4 pb-32 pt-7 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <section className="rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <p className="text-sm font-semibold text-[#7C8799]">관리자</p>
            <h1 className="mt-2 text-[2rem] font-black tracking-tight text-[#17213B] sm:text-[2.3rem]">
              진도표
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#667085]">
              학생별 배정된 커리큘럼을 확인하고 상세 진도 흐름으로 바로 이동할 수 있습니다.
            </p>
          </section>

          <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-4">
              <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                <label className="mb-2 block text-sm font-black text-[#17213B]" htmlFor="curriculum-student">
                  학생 선택
                </label>
                <select
                  className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-bold text-[#17213B] outline-none"
                  id="curriculum-student"
                  onChange={(event) => {
                    const nextStudentId = event.target.value;
                    setSelectedStudentId(nextStudentId);
                    router.replace(buildPageHref(nextStudentId));
                  }}
                  value={selectedStudentId}
                >
                  <option value="">학생을 선택해주세요.</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} · {student.grade}
                    </option>
                  ))}
                </select>
                {studentsLoading ? (
                  <p className="mt-3 text-xs font-bold text-[#98A2B3]">학생 목록을 불러오는 중입니다.</p>
                ) : null}
                {studentsError ? (
                  <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{studentsError}</p>
                ) : null}
                {selectedStudent ? (
                  <div className="mt-4 rounded-2xl bg-[#F8FAFC] px-4 py-3">
                    <p className="text-sm font-black text-[#17213B]">{selectedStudent.name}</p>
                    <p className="mt-1 text-xs font-bold text-[#98A2B3]">{selectedStudent.grade}</p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-[#17213B]">배정된 커리큘럼</h2>
                    <p className="mt-1 text-xs font-semibold text-[#98A2B3]">
                      학생별 진도표 목록과 상세 진입
                    </p>
                  </div>
                  {selectedStudentId && curriculums.length > 0 ? (
                    <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-black text-[#4F46E5]">
                      {curriculums.length}개
                    </span>
                  ) : null}
                </div>

                {!selectedStudentId ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-8 text-center text-sm font-bold text-[#98A2B3]">
                    학생을 선택해주세요.
                  </div>
                ) : curriculumsLoading ? (
                  <p className="mt-4 text-sm font-bold text-[#98A2B3]">진도표를 불러오는 중입니다.</p>
                ) : curriculumsError ? (
                  <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{curriculumsError}</p>
                ) : curriculums.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-8 text-center text-sm font-bold text-[#98A2B3]">
                    배정된 진도표가 없습니다.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {curriculums.map((item) => (
                      <article className="rounded-[24px] border border-[#EEF2FF] bg-[#FBFCFE] p-4" key={item.student_curriculum_id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-[#635BFF]">{item.subject}</p>
                            <h3 className="mt-1 text-base font-black text-[#17213B]">{item.title}</h3>
                            {item.description ? (
                              <p className="mt-1 text-xs font-medium text-[#98A2B3]">{item.description}</p>
                            ) : null}
                          </div>
                          <Link
                            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#4F46E5] shadow-sm hover:bg-[#EEF2FF]"
                            href={buildPageHref(selectedStudentId, item.student_curriculum_id)}
                          >
                            상세보기
                          </Link>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                          <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-[#4F46E5]">
                            진행 중 {item.in_progress_count}
                          </span>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">
                            완료 {item.completed_count}
                          </span>
                          <span className="rounded-full bg-[#F4F6FA] px-3 py-1 text-[#667085]">
                            예정 {item.planned_count}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-[#17213B]">커리큘럼 상세</h2>
                  <p className="mt-1 text-xs font-semibold text-[#98A2B3]">
                    단계별 노드와 연결된 진입 링크를 확인할 수 있습니다.
                  </p>
                </div>
                {detail ? (
                  <div className="flex flex-wrap gap-2 text-xs font-black">
                    <span className="rounded-full bg-[#F4F6FA] px-3 py-1 text-[#667085]">전체 {detailSummary.total}</span>
                    <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-[#4F46E5]">진행 중 {detailSummary.inProgress}</span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">완료 {detailSummary.completed}</span>
                  </div>
                ) : null}
              </div>

              {!selectedStudentId ? (
                <div className="mt-6 rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-12 text-center text-sm font-bold text-[#98A2B3]">
                  학생을 먼저 선택해주세요.
                </div>
              ) : !queryCurriculumId ? (
                <div className="mt-6 rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-12 text-center text-sm font-bold text-[#98A2B3]">
                  왼쪽 목록에서 상세보기로 진입해주세요.
                </div>
              ) : detailLoading ? (
                <p className="mt-6 text-sm font-bold text-[#98A2B3]">상세를 불러오는 중입니다.</p>
              ) : detailError ? (
                <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">{detailError}</p>
              ) : !detail ? (
                <div className="mt-6 rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-12 text-center text-sm font-bold text-[#98A2B3]">
                  표시할 상세 정보가 없습니다.
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {detail.groups.map((group) => (
                    <section className="rounded-[24px] border border-[#EEF2FF] bg-[#FBFCFE] p-4" key={group.name}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-black text-[#17213B]">
                          {group.group_number}. {group.name}
                        </h3>
                        <span className="text-xs font-bold text-[#98A2B3]">{group.nodes.length}개 노드</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {group.nodes.map((node) => (
                          <div className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between" key={node.id}>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-[#17213B]">{node.title}</p>
                              <p className="mt-1 text-xs font-semibold text-[#98A2B3]">
                                {node.node_type} · {getStatusLabel(node.status)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-black ${getStatusClass(node.status)}`}>
                                {getStatusLabel(node.status)}
                              </span>
                              {node.link_url ? (
                                <Link
                                  className="rounded-full bg-[#0F172A] px-3 py-1.5 text-xs font-black text-white hover:bg-[#1E293B]"
                                  href={node.link_url}
                                >
                                  연결 보기
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </section>
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
              <h1 className="mt-2 text-[2rem] font-black tracking-tight text-[#17213B] sm:text-[2.3rem]">
                진도표
              </h1>
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
