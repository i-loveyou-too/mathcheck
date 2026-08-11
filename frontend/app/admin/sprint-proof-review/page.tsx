"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

type ProofType = "seat_check" | "planner" | "study_time";
type ReviewStatus = "all" | "pending" | "approved" | "rejected";

type ImageItem = {
  id: number;
  admin_url: string;
  original_filename: string | null;
};

type ReviewItem = {
  id: number;
  student_id: number;
  student_name: string;
  program_id: number;
  program_title: string;
  proof_type: ProofType;
  proof_label: string;
  proof_date: string;
  submitted_at: string | null;
  image_url: string | null;
  images: ImageItem[];
  review_status: "pending" | "approved" | "rejected";
  metadata: {
    memo?: string | null;
    timing_status?: string | null;
    deadline_time?: string | null;
    total_minutes?: number;
    approved_minutes?: number | null;
    subject_breakdown?: Record<string, number>;
    review_note?: string | null;
  };
};

type MissingStudent = {
  student_id: number;
  student_name: string;
  program_id: number;
  program_title: string;
  missing_types: ProofType[];
};

type ReviewResponse = {
  today: string;
  proof_date: string;
  summary: {
    pending_total: number;
    pending_by_type: Record<ProofType, number>;
    missing_student_count: number;
  };
  missing: {
    proof_date: string;
    counts: Record<ProofType, number>;
    student_count: number;
    students: MissingStudent[];
  };
  items: ReviewItem[];
  count: number;
};

type Student = { id: number; name: string; grade: string };

const proofLabels: Record<ProofType, string> = {
  seat_check: "착석",
  planner: "플래너",
  study_time: "공부시간",
};

const statusLabels: Record<string, string> = {
  all: "전체",
  pending: "미검토",
  approved: "승인",
  rejected: "반려",
};

function minutesLabel(minutes: number | null | undefined) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours ? `${hours}시간 ${mins}분` : `${mins}분`;
}

function imageUrl(url: string) {
  return url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
}

export default function AdminSprintProofReviewPage() {
  const router = useRouter();
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [filters, setFilters] = useState({
    review_status: "pending" as ReviewStatus,
    proof_type: "all",
    student_id: "",
    proof_date: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const params = useMemo(() => {
    const search = new URLSearchParams();
    search.set("review_status", filters.review_status);
    search.set("proof_type", filters.proof_type);
    if (filters.student_id) search.set("student_id", filters.student_id);
    if (filters.proof_date) search.set("proof_date", filters.proof_date);
    return search.toString();
  }, [filters]);

  const load = async () => {
    setError("");
    try {
      const [reviewRows, studentRows] = await Promise.all([
        apiFetch<ReviewResponse>(`/admin/sprint-proof-review?${params}`),
        apiFetch<Student[]>("/admin/students"),
      ]);
      setData(reviewRows);
      setStudents(studentRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "인증 검토 목록을 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load();
  }, [params, router]);

  const applyReview = async (item: ReviewItem, action: "approve" | "reject") => {
    const key = `${item.proof_type}-${item.id}`;
    if (busyId) return;
    const comment = action === "reject" ? window.prompt("반려 사유를 입력하세요.") : null;
    if (action === "reject" && !comment?.trim()) return;
    setBusyId(key);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/sprint-proof-review/${item.proof_type}/${item.id}/${action}`, {
        method: "POST",
        body: { comment: comment?.trim() || null },
      });
      if (filters.review_status === "pending") {
        setData((current) => current ? { ...current, items: current.items.filter((row) => row.id !== item.id || row.proof_type !== item.proof_type) } : current);
      }
      setNotice(action === "approve" ? "승인했습니다." : "반려했습니다.");
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "검토 처리를 완료하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const pendingByType = data?.summary.pending_by_type ?? { seat_check: 0, planner: 0, study_time: 0 };
  const missingCounts = data?.missing.counts ?? { seat_check: 0, planner: 0, study_time: 0 };

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1280px] px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#FF6B4A]">SPRINT PROOF REVIEW</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">인증 통합 검토</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">착석·플래너·공부시간 인증을 한 화면에서 확인합니다.</p>
          </div>
          <Link href="/admin/challenges" className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#17213B] shadow-sm">
            챌린지 관리
          </Link>
        </div>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-[20px] bg-white p-4 shadow-card">
            <p className="text-xs font-bold text-[#98A2B3]">미검토 전체</p>
            <p className="mt-2 text-2xl font-black text-[#17213B]">{data?.summary.pending_total ?? 0}</p>
          </div>
          <div className="rounded-[20px] bg-white p-4 shadow-card">
            <p className="text-xs font-bold text-[#98A2B3]">오늘 미제출</p>
            <p className="mt-2 text-2xl font-black text-[#17213B]">{data?.summary.missing_student_count ?? 0}명</p>
          </div>
          <div className="rounded-[20px] bg-white p-4 shadow-card">
            <p className="text-xs font-bold text-[#98A2B3]">착석 미검토</p>
            <p className="mt-2 text-2xl font-black text-[#17213B]">{pendingByType.seat_check}</p>
          </div>
          <div className="rounded-[20px] bg-white p-4 shadow-card">
            <p className="text-xs font-bold text-[#98A2B3]">플래너 미검토</p>
            <p className="mt-2 text-2xl font-black text-[#17213B]">{pendingByType.planner}</p>
          </div>
          <div className="rounded-[20px] bg-white p-4 shadow-card">
            <p className="text-xs font-bold text-[#98A2B3]">공부시간 미검토</p>
            <p className="mt-2 text-2xl font-black text-[#17213B]">{pendingByType.study_time}</p>
          </div>
        </section>

        <section className="mt-5 rounded-[24px] bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#17213B]">오늘 미제출</h2>
              <p className="mt-1 text-sm font-bold text-[#7A859F]">
                착석 {missingCounts.seat_check}명 · 플래너 {missingCounts.planner}명 · 공부시간 {missingCounts.study_time}명
              </p>
            </div>
            <span className="rounded-full bg-[#FFF4ED] px-3 py-1.5 text-xs font-black text-[#FF6B4A]">{data?.missing.proof_date ?? "-"}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data?.missing.students.length === 0 && (
              <p className="rounded-2xl bg-[#F8FAFC] px-4 py-5 text-center text-sm font-bold text-[#98A2B3] md:col-span-2 xl:col-span-3">오늘 미제출 학생이 없습니다.</p>
            )}
            {data?.missing.students.map((student) => (
              <div key={student.student_id} className="rounded-2xl border border-[#EEF1F5] bg-[#F8FAFC] p-4">
                <p className="text-sm font-black text-[#17213B]">{student.student_name}</p>
                <p className="mt-1 text-xs font-bold text-[#98A2B3]">{student.program_title}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {student.missing_types.map((type) => (
                    <span key={type} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-red-500">
                      {proofLabels[type]} 미제출
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-[24px] bg-white p-4 shadow-card">
          <div className="grid gap-3 lg:grid-cols-[160px_180px_180px_180px_auto]">
            <label className="text-xs font-bold text-[#667085]">
              상태
              <select value={filters.review_status} onChange={(event) => setFilters({ ...filters, review_status: event.target.value as ReviewStatus })} className="mt-1.5 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 font-bold text-[#17213B]">
                <option value="pending">미검토</option>
                <option value="all">전체</option>
                <option value="approved">승인</option>
                <option value="rejected">반려</option>
              </select>
            </label>
            <label className="text-xs font-bold text-[#667085]">
              인증 종류
              <select value={filters.proof_type} onChange={(event) => setFilters({ ...filters, proof_type: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 font-bold text-[#17213B]">
                <option value="all">전체</option>
                <option value="seat_check">착석</option>
                <option value="planner">플래너</option>
                <option value="study_time">공부시간</option>
              </select>
            </label>
            <label className="text-xs font-bold text-[#667085]">
              학생
              <select value={filters.student_id} onChange={(event) => setFilters({ ...filters, student_id: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 font-bold text-[#17213B]">
                <option value="">전체</option>
                {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-[#667085]">
              날짜
              <input type="date" value={filters.proof_date} onChange={(event) => setFilters({ ...filters, proof_date: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 font-bold text-[#17213B]" />
            </label>
            <button type="button" onClick={() => setFilters({ review_status: "pending", proof_type: "all", student_id: "", proof_date: "" })} className="h-11 self-end rounded-xl bg-[#17213B] px-4 text-xs font-black text-white">
              초기화
            </button>
          </div>
        </section>

        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-5 space-y-3">
          {data?.items.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">검토할 인증이 없습니다.</div>}
          {data?.items.map((item) => {
            const busy = busyId === `${item.proof_type}-${item.id}`;
            return (
              <article key={`${item.proof_type}-${item.id}`} className="grid gap-4 rounded-[24px] bg-white p-4 shadow-card lg:grid-cols-[116px_minmax(0,1fr)_220px]">
                <button type="button" onClick={() => item.image_url && setPreviewUrl(imageUrl(item.image_url))} className="aspect-square overflow-hidden rounded-2xl bg-[#F1F5F9]">
                  {item.image_url ? (
                    <img src={imageUrl(item.image_url)} alt={`${item.proof_label} 사진`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs font-black text-[#98A2B3]">사진 없음</span>
                  )}
                </button>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-black text-[#17213B]">{item.student_name}</h2>
                    <span className="rounded-full bg-[#EAF5FF] px-2.5 py-1 text-xs font-black text-[#2874E8]">{item.proof_label}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.review_status === "pending" ? "bg-amber-50 text-amber-700" : item.review_status === "approved" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                      {statusLabels[item.review_status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-[#667085]">{item.program_title}</p>
                  <div className="mt-3 grid gap-2 text-xs font-bold text-[#7A859F] sm:grid-cols-2">
                    <p>인증일: <span className="text-[#17213B]">{item.proof_date}</span></p>
                    <p>제출: <span className="text-[#17213B]">{item.submitted_at ? new Date(item.submitted_at).toLocaleString("ko-KR") : "-"}</span></p>
                    {item.metadata.deadline_time && <p>마감: <span className="text-[#17213B]">{item.metadata.deadline_time}</span></p>}
                    {item.metadata.timing_status && <p>시간 판정: <span className="text-[#17213B]">{item.metadata.timing_status}</span></p>}
                    {item.metadata.total_minutes != null && <p>제출 시간: <span className="text-[#17213B]">{minutesLabel(item.metadata.total_minutes)}</span></p>}
                    {item.metadata.approved_minutes != null && <p>승인 시간: <span className="text-[#17213B]">{minutesLabel(item.metadata.approved_minutes)}</span></p>}
                  </div>
                  {item.metadata.memo && <p className="mt-3 rounded-2xl bg-[#F8FAFC] px-3 py-2 text-sm font-semibold text-[#475569]">{item.metadata.memo}</p>}
                  {item.metadata.subject_breakdown && Object.keys(item.metadata.subject_breakdown).length > 0 && (
                    <p className="mt-2 text-xs font-bold text-[#98A2B3]">
                      {Object.entries(item.metadata.subject_breakdown).map(([key, value]) => `${key} ${value}분`).join(" · ")}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-start gap-2 lg:flex-col">
                  <button disabled={busy || item.review_status === "approved" || !item.image_url} onClick={() => void applyReview(item, "approve")} className="h-10 rounded-xl bg-emerald-500 px-4 text-xs font-black text-white disabled:opacity-40">
                    {busy ? "처리 중" : "승인"}
                  </button>
                  <button disabled={busy || item.review_status === "rejected"} onClick={() => void applyReview(item, "reject")} className="h-10 rounded-xl bg-red-50 px-4 text-xs font-black text-red-600 disabled:opacity-40">
                    반려
                  </button>
                  <Link href={`/admin/sprints/${item.program_id}`} className="h-10 rounded-xl bg-[#F0F2F8] px-4 text-xs font-black leading-10 text-[#17213B]">
                    SPRINT 상세
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {previewUrl && (
        <button type="button" onClick={() => setPreviewUrl(null)} className="fixed inset-0 z-40 flex items-center justify-center bg-black/72 p-4">
          <img src={previewUrl} alt="확대 사진" className="max-h-[88vh] max-w-[92vw] rounded-2xl object-contain" />
        </button>
      )}

      <AdminBottomNav />
    </main>
  );
}
