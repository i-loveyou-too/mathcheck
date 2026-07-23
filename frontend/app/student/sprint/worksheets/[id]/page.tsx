"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getStudent } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const MAX_IMAGES = 10;

type SubmissionFile = {
  id: number;
  file_kind: "pdf" | "image";
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
};
type Submission = {
  id: number;
  submission_method: "pdf" | "images" | null;
  status: "draft" | "pending" | "approved" | "rejected";
  submitted_at: string | null;
  review_note: string | null;
  files: SubmissionFile[];
};
type Assignment = {
  id: number;
  title: string;
  subject: string | null;
  assigned_date: string;
  due_date: string | null;
  submission_status: "not_submitted" | "draft" | "pending" | "approved" | "rejected";
  submission: Submission | null;
};
// SPRINT DAY/스트라이크와의 연결 표시용 — 기존 대시보드 조회 API를 읽기 전용으로 재사용한다.
type SprintContext = { dayNumber: number | null; strikeEffective: number; strikeThreshold: number };

const statusLabels: Record<string, string> = {
  not_submitted: "제출 전", draft: "작성 중", pending: "검토 대기", approved: "승인 완료", rejected: "반려됨",
};

export default function StudentSprintWorksheetDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const assignmentId = Number(params.id);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [data, setData] = useState<Assignment | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [pendingPdf, setPendingPdf] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sprintContext, setSprintContext] = useState<SprintContext | null>(null);

  const load = async (id: number) => {
    const result = await apiFetch<Assignment>(`/student/sprint/worksheets/${assignmentId}?student_id=${id}`);
    setData(result);
  };

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void load(student.id).catch((reason) => setError(reason instanceof ApiError ? reason.message : "문제지 정보를 불러오지 못했습니다."));
    void apiFetch<{ program: { day_info: { day_number: number } } | null; strike_summary?: { effective: number; threshold: number } }>(
      `/student/sprint/dashboard?student_id=${student.id}&study_date=${getStudyDate()}`,
    )
      .then((dashboard) => {
        if (!dashboard.program) return;
        setSprintContext({
          dayNumber: dashboard.program.day_info?.day_number ?? null,
          strikeEffective: dashboard.strike_summary?.effective ?? 0,
          strikeThreshold: dashboard.strike_summary?.threshold ?? 3,
        });
      })
      .catch(() => null);
  }, [router, assignmentId]);

  useEffect(() => {
    const urls = pendingImages.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [pendingImages]);

  const submission = data?.submission ?? null;
  const canEdit = !submission || submission.status === "draft" || submission.status === "rejected";
  const method = submission?.submission_method ?? null;
  const uploadedCount = submission?.files.length ?? 0;

  const uploadOne = async (file: File) => {
    if (!studentId) return;
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`${API_BASE_URL}/student/sprint/worksheets/${assignmentId}/submission-files?student_id=${studentId}`, {
      method: "POST",
      body,
      credentials: "include",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail || "파일 업로드에 실패했습니다.");
    }
  };

  const uploadPendingImages = async () => {
    if (!studentId || pendingImages.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    const remaining = [...pendingImages];
    try {
      while (remaining.length > 0) {
        await uploadOne(remaining[0]);
        remaining.shift();
        setPendingImages([...remaining]);
      }
      await load(studentId);
      setNotice("사진을 추가했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "사진 업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const uploadPendingPdf = async () => {
    if (!studentId || !pendingPdf) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await uploadOne(pendingPdf);
      setPendingPdf(null);
      await load(studentId);
      setNotice("PDF를 업로드했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PDF 업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const deleteFile = async (fileId: number) => {
    if (!studentId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/student/sprint/worksheets/submission-files/${fileId}?student_id=${studentId}`, { method: "DELETE" });
      await load(studentId);
      setNotice("파일을 삭제했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "파일 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const finalSubmit = async () => {
    if (!studentId || !submission) return;
    if (pendingImages.length > 0 || pendingPdf) {
      setError("선택한 파일을 먼저 업로드해주세요.");
      return;
    }
    if (uploadedCount === 0) {
      setError("PDF 또는 사진을 1개 이상 올려주세요.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/student/sprint/worksheets/${assignmentId}/submit`, {
        method: "POST",
        body: { student_id: studentId },
      });
      await load(studentId);
      setNotice("제출했습니다. 관리자 승인 후 진행률에 반영됩니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "제출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const fileUrl = (fileId: number) => `${API_BASE_URL}/student/sprint/worksheets/submission-files/${fileId}?student_id=${studentId}`;
  const worksheetFileUrl = studentId ? `${API_BASE_URL}/student/sprint/worksheets/${assignmentId}/file?student_id=${studentId}` : "#";
  const reviewComment = submission?.review_note?.trim();
  const isRejected = submission?.status === "rejected";
  const isApproved = submission?.status === "approved";

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[70vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <div className="flex items-center justify-between">
          <Link href="/student/sprint/worksheets" className="break-keep text-sm font-black text-[#2874E8]">← 문제지 목록</Link>
          {sprintContext?.dayNumber != null && (
            <span className="shrink-0 break-keep rounded-full bg-white/80 px-3 py-1.5 text-xs font-black text-[#2874E8] ring-1 ring-[#DCEBFA]">DAY {sprintContext.dayNumber}</span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="break-keep text-2xl font-black tracking-[-0.05em] text-[#10213D]">{data.title}</h1>
          {isApproved && <span className="shrink-0 break-keep rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-600">완료 · 진행률 반영됨</span>}
        </div>
        <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">
          {data.subject ? `${data.subject} · ` : ""}배정일 {data.assigned_date}{data.due_date ? ` · 마감 ${data.due_date}` : ""}
        </p>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 break-keep rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-6 rounded-[28px] bg-white/95 p-5 shadow-[0_18px_36px_rgba(49,89,130,0.18)] ring-1 ring-[#DCEBFA]">
          <p className="text-xs font-bold text-[#6E7F99]">STEP 1</p>
          <h2 className="mt-1 break-keep text-xl font-black text-[#10213D]">문제지 받기</h2>
          <a
            href={worksheetFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block h-12 break-keep rounded-2xl bg-[#10213D] text-center text-sm font-black leading-[3rem] text-white"
          >
            PDF 문제지 다운로드
          </a>
          {sprintContext && (
            <div className="mt-4 flex items-center justify-between border-t border-[#EAF0FA] pt-3 text-xs font-bold text-[#8CA0BD]">
              <span className="break-keep">풀이를 제출하면 SPRINT 진행률이 올라가요.</span>
              <span className="shrink-0 break-keep text-[#E5533C]">스트라이크 {sprintContext.strikeEffective}/{sprintContext.strikeThreshold}</span>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[#6E7F99]">STEP 2</p>
              <h2 className="mt-1 break-keep text-xl font-black text-[#10213D]">풀이 제출하기</h2>
            </div>
            <span className="shrink-0 break-keep rounded-full bg-[#EAF5FF] px-3 py-1.5 text-xs font-black text-[#2874E8]">{statusLabels[data.submission_status]}</span>
          </div>

          {reviewComment && (
            <div className={`mt-3 rounded-2xl border px-4 py-3 ${isRejected ? "border-red-100 bg-red-50 text-red-700" : "border-sky-100 bg-sky-50 text-sky-700"}`}>
              <p className="break-keep text-xs font-black">{isRejected ? "반려 사유" : "선생님 코멘트"}</p>
              <p className="mt-1 whitespace-pre-wrap break-keep text-sm font-bold">{reviewComment}</p>
            </div>
          )}

          {uploadedCount > 0 && (
            <div className="mt-4">
              <p className="break-keep text-xs font-black text-[#6E7F99]">{method === "pdf" ? "제출한 PDF" : "제출한 사진"}</p>
              {method === "images" ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {submission!.files.map((file) => (
                    <div key={file.id} className="relative aspect-square overflow-hidden rounded-2xl bg-[#F5F8FC]">
                      <img src={fileUrl(file.id)} alt="풀이 사진" className="h-full w-full object-cover" />
                      {canEdit && (
                        <button onClick={() => void deleteFile(file.id)} disabled={busy} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-black text-white">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {submission!.files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between rounded-2xl border border-[#DFEAF6] px-4 py-3">
                      <a href={fileUrl(file.id)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate break-keep text-sm font-bold text-[#2874E8]">{file.original_filename || "제출 PDF"}</a>
                      {canEdit && <button onClick={() => void deleteFile(file.id)} disabled={busy} className="shrink-0 break-keep rounded-full bg-[#FFF0F0] px-3 py-1 text-xs font-black text-red-500">삭제</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {canEdit && (method === "images" || uploadedCount === 0) && (
            <div className="mt-4">
              <p className="break-keep text-xs font-black text-[#6E7F99]">사진으로 제출 ({uploadedCount + pendingImages.length}/{MAX_IMAGES})</p>
              {previewUrls.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {previewUrls.map((url, index) => (
                    <div key={url} className="relative aspect-square overflow-hidden rounded-2xl bg-[#F5F8FC]">
                      <img src={url} alt="선택한 사진" className="h-full w-full object-cover" />
                      <button onClick={() => setPendingImages((current) => current.filter((_, i) => i !== index))} disabled={busy} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-black text-white">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {uploadedCount + pendingImages.length < MAX_IMAGES && (
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []).slice(0, MAX_IMAGES - uploadedCount - pendingImages.length);
                    setPendingImages((current) => [...current, ...files]);
                    event.target.value = "";
                  }}
                  className="mt-3 block w-full text-sm"
                />
              )}
              {pendingImages.length > 0 && (
                <button disabled={busy} onClick={() => void uploadPendingImages()} className="mt-3 h-11 w-full break-keep rounded-2xl bg-[#10213D] text-sm font-black text-white disabled:opacity-40">사진 올리기</button>
              )}
            </div>
          )}

          {canEdit && (method === "pdf" || uploadedCount === 0) && (
            <div className="mt-4">
              <p className="break-keep text-xs font-black text-[#6E7F99]">PDF로 제출</p>
              {uploadedCount === 0 && (
                <>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => setPendingPdf(event.target.files?.[0] ?? null)}
                    className="mt-3 block w-full text-sm"
                  />
                  {pendingPdf && (
                    <button disabled={busy} onClick={() => void uploadPendingPdf()} className="mt-3 h-11 w-full break-keep rounded-2xl bg-[#10213D] text-sm font-black text-white disabled:opacity-40">PDF 올리기</button>
                  )}
                </>
              )}
            </div>
          )}

          {canEdit && (
            <button
              disabled={busy || uploadedCount === 0}
              onClick={() => void finalSubmit()}
              className="mt-5 h-12 w-full break-keep rounded-2xl bg-[#2874E8] text-sm font-black text-white disabled:opacity-40"
            >
              최종 제출
            </button>
          )}
        </section>
      </div>
    </ScreenShell>
  );
}
