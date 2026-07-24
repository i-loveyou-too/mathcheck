"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getStudent } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const MAX_IMAGES = 3;

type ProofType = "planner" | "seat_check";
type ImageItem = { id: number; original_filename: string | null };
type Attempt = {
  id: number;
  attempt_no: number;
  submitted_at: string;
  timing_status: string;
  review_status: string;
  review_note: string | null;
};
type Submission = {
  id: number;
  workflow_status: string;
  timing_status: string;
  submitted_at: string | null;
  review_note: string | null;
  memo: string | null;
  images: ImageItem[];
  attempts: Attempt[];
};
type Current = {
  learning_date: string;
  proof_type: ProofType;
  deadline_time: string | null;
  deadline_at: string | null;
  timing_status: string;
  submission: Submission | null;
};
// SPRINT DAY/진행률/스트라이크와의 연결 표시용 — 기존 대시보드 조회 API를 읽기 전용으로 재사용한다.
type SprintContext = {
  dayNumber: number | null;
  strikeEffective: number;
  strikeThreshold: number;
};

const labels = {
  planner: { title: "플래너 제출", proof: "planner" as ProofType, hint: "오늘 학습 계획이 보이도록 찍어주세요." },
  seat_check: { title: "착석 인증", proof: "seat_check" as ProofType, hint: "공부 시작 자리와 준비 상태가 보이도록 찍어주세요." },
};

const timingLabels: Record<string, string> = { on_time: "정상", late: "지각", missing: "미제출", not_due: "미제출", disabled: "비활성" };
const reviewLabels: Record<string, string> = { pending: "검토 대기", approved: "승인", rejected: "반려" };

function statusLabel(submission: Submission | null, timing: string) {
  if (!submission) return timing === "missing" ? "미제출" : "제출 전";
  if (submission.workflow_status === "pending") return "검토 대기";
  if (submission.workflow_status === "approved") return submission.timing_status === "late" ? "지각 승인" : "승인 완료";
  if (submission.workflow_status === "rejected") return "반려됨";
  return "임시저장";
}

function NoActiveSprint({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <div className="mt-10 rounded-[28px] bg-white/95 p-8 text-center shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF5FF] text-2xl">🏃</div>
          <h2 className="mt-5 break-keep text-xl font-black text-[#10213D]">참여 중인 SPRINT가 없습니다</h2>
          <p className="mt-2 break-keep text-sm text-[#6E7F99]">활성화된 SPRINT가 있을 때만 인증을 제출할 수 있어요.</p>
          <div className="mt-6 flex flex-col gap-2">
            <button onClick={() => router.push("/student/sprint")} className="h-12 break-keep rounded-2xl bg-[#2874E8] text-sm font-black text-white">SPRINT 홈으로 돌아가기</button>
            <button onClick={() => router.push("/student")} className="h-12 break-keep rounded-2xl bg-[#EAF5FF] text-sm font-black text-[#2874E8]">오늘도 해냄으로 전환</button>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

export function ProofForm({ proofType }: { proofType: ProofType }) {
  const router = useRouter();
  const meta = labels[proofType];
  const [studentId, setStudentId] = useState<number | null>(null);
  const [learningDate, setLearningDate] = useState(getStudyDate());
  const [data, setData] = useState<Current | null>(null);
  const [noActiveSprint, setNoActiveSprint] = useState(false);
  const [memo, setMemo] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sprintContext, setSprintContext] = useState<SprintContext | null>(null);

  const load = async (id: number, targetDate = learningDate) => {
    const result = await apiFetch<Current>(`/student/sprint/proofs/current?student_id=${id}&proof_type=${meta.proof}&learning_date=${targetDate}`);
    setData(result);
    setNoActiveSprint(false);
    setMemo(result.submission?.memo ?? "");
  };

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void load(student.id).catch((reason) => {
      if (reason instanceof ApiError && reason.status === 404) {
        setNoActiveSprint(true);
        return;
      }
      setError(reason instanceof Error ? reason.message : "인증 정보를 불러오지 못했습니다.");
    });
    // DAY/진행률/스트라이크 연결 표시는 순수 장식용이라 실패해도 조용히 무시한다 (제출 흐름과 무관).
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
  }, [router]);

  useEffect(() => {
    const urls = pendingFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [pendingFiles]);

  if (noActiveSprint) return <NoActiveSprint router={router} />;

  const uploadedCount = data?.submission?.images.length ?? 0;
  const locked = data?.submission?.workflow_status === "pending" || data?.submission?.workflow_status === "approved";
  const canAddMore = uploadedCount + pendingFiles.length < MAX_IMAGES;
  const imageUrl = (imageId: number) => `${API_BASE_URL}/student/sprint/proofs/images/${imageId}?student_id=${studentId}`;
  const reviewComment = data?.submission?.review_note?.trim();
  const isRejected = data?.submission?.workflow_status === "rejected";
  const isApproved = data?.submission?.workflow_status === "approved";
  const commentTitle = data?.submission?.workflow_status === "pending" ? "이전 반려 사유" : "선생님 코멘트";
  const commentClassName = isRejected
    ? "border-red-100 bg-red-50 text-red-700"
    : isApproved
      ? "border-sky-100 bg-sky-50 text-sky-700"
      : "border-amber-100 bg-amber-50 text-amber-700";

  const saveDraft = async (silent = false) => {
    if (!studentId) return null;
    setBusy(true);
    setError("");
    if (!silent) setNotice("");
    try {
      const submission = await apiFetch<Submission>("/student/sprint/proofs/drafts", {
        method: "POST",
        body: { student_id: studentId, learning_date: learningDate, proof_type: meta.proof, memo: memo || null },
      });
      if (!silent) {
        setNotice("임시저장했습니다.");
        await load(studentId);
      }
      return submission;
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "임시저장에 실패했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addPendingFiles = (files: FileList | null) => {
    if (!files) return;
    const next = [...pendingFiles, ...Array.from(files)].slice(0, MAX_IMAGES - uploadedCount);
    setPendingFiles(next);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((current) => current.filter((_, i) => i !== index));
  };

  const uploadPendingPhotos = async () => {
    if (!studentId || pendingFiles.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let submissionId = data?.submission?.id;
      if (!submissionId) {
        const draft = await saveDraft(true);
        if (!draft) return;
        submissionId = draft.id;
      }
      for (const file of pendingFiles) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`${API_BASE_URL}/student/sprint/proofs/${submissionId}/images?student_id=${studentId}`, {
          method: "POST",
          body,
          credentials: "include",
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.detail || "사진 업로드에 실패했습니다.");
        }
      }
      setPendingFiles([]);
      await load(studentId);
      setNotice("사진을 추가했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "사진 업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const deleteUploadedImage = async (imageId: number) => {
    if (!studentId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/student/sprint/proofs/images/${imageId}?student_id=${studentId}`, { method: "DELETE" });
      await load(studentId);
      setNotice("사진을 삭제했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "사진 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const finalSubmit = async () => {
    if (!studentId) return;
    if (pendingFiles.length > 0) {
      setError("선택한 사진을 먼저 업로드해주세요.");
      return;
    }
    if (uploadedCount === 0) {
      setError("사진을 1장 이상 올려주세요.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const submissionId = data?.submission?.id;
      if (!submissionId) throw new Error("먼저 임시저장 후 사진을 올려주세요.");
      await apiFetch(`/student/sprint/proofs/${submissionId}/submit`, {
        method: "POST",
        body: { student_id: studentId },
      });
      router.push("/student/sprint");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "제출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const currentStatus = statusLabel(data?.submission ?? null, data?.timing_status ?? "not_due");
  const isDone = data?.submission?.workflow_status === "approved";

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <div className="flex items-center justify-between">
          <Link href="/student/sprint" className="break-keep text-sm font-black text-[#2874E8]">← SPRINT 홈</Link>
          {sprintContext?.dayNumber != null && (
            <span className="shrink-0 break-keep rounded-full bg-white/80 px-3 py-1.5 text-xs font-black text-[#2874E8] ring-1 ring-[#DCEBFA]">DAY {sprintContext.dayNumber}</span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="break-keep text-3xl font-black tracking-[-0.05em] text-[#10213D]">{meta.title}</h1>
          {isDone && <span className="shrink-0 break-keep rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-600">완료 · 진행률 반영됨</span>}
        </div>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 break-keep rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-6 rounded-[28px] bg-white/95 p-5 shadow-[0_18px_36px_rgba(49,89,130,0.18)] ring-1 ring-[#DCEBFA]">
          <p className="text-xs font-bold text-[#6E7F99]">오늘 마감</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <h2 className="text-3xl font-black text-[#10213D]">{data?.deadline_time ?? "미설정"}</h2>
            <span className="shrink-0 break-keep rounded-full bg-[#EAF5FF] px-3 py-1.5 text-xs font-black text-[#2874E8]">{currentStatus}</span>
          </div>
          <p className="mt-3 break-keep text-sm text-[#6E7F99]">{meta.hint}</p>
          {sprintContext && (
            <div className="mt-4 flex items-center justify-between border-t border-[#EAF0FA] pt-3 text-xs font-bold text-[#8CA0BD]">
              <span className="break-keep">이 인증을 완료하면 SPRINT 진행률이 올라가요.</span>
              <span className="shrink-0 break-keep text-[#E5533C]">스트라이크 {sprintContext.strikeEffective}/{sprintContext.strikeThreshold}</span>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
          <label className="break-keep text-xs font-black text-[#6E7F99]">학습일<input type="date" value={learningDate} onChange={(event) => { setLearningDate(event.target.value); setPendingFiles([]); if (studentId) void load(studentId, event.target.value); }} className="mt-1.5 h-12 w-full rounded-2xl border border-[#DFEAF6] px-4 text-[#10213D]" /></label>
          <textarea disabled={locked} value={memo} onChange={(event) => setMemo(event.target.value)} rows={3} className="mt-4 w-full resize-none rounded-2xl border border-[#DFEAF6] p-3 text-sm text-[#10213D] outline-none disabled:bg-[#F5F8FC]" placeholder="메모" />
          {reviewComment && (
            <div className={`mt-3 rounded-2xl border px-4 py-3 ${commentClassName}`}>
              <p className="break-keep text-xs font-black">{commentTitle}</p>
              <p className="mt-1 whitespace-pre-wrap break-keep text-sm font-bold">{reviewComment}</p>
            </div>
          )}
          <button disabled={busy || locked} onClick={() => void saveDraft()} className="mt-4 h-12 w-full break-keep rounded-2xl bg-[#EAF5FF] text-sm font-black text-[#2874E8] disabled:opacity-40">임시저장</button>
        </section>

        <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
          <div className="flex items-center justify-between">
            <h2 className="break-keep text-lg font-black text-[#10213D]">사진</h2>
            <span className="shrink-0 break-keep text-xs font-bold text-[#8CA0BD]">{uploadedCount + pendingFiles.length} / {MAX_IMAGES}장</span>
          </div>

          {uploadedCount > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {data!.submission!.images.map((image) => (
                <div key={image.id} className="relative aspect-square overflow-hidden rounded-2xl">
                  <img src={imageUrl(image.id)} alt="proof" className="h-full w-full object-cover" />
                  {!locked && (
                    <button onClick={() => void deleteUploadedImage(image.id)} disabled={busy} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-black text-white">✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {pendingFiles.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 break-keep text-xs font-bold text-[#8CA0BD]">업로드 대기 중</p>
              <div className="grid grid-cols-3 gap-2">
                {previewUrls.map((url, index) => (
                  <div key={url} className="relative aspect-square overflow-hidden rounded-2xl ring-2 ring-[#2874E8]/40">
                    <img src={url} alt="preview" className="h-full w-full object-cover" />
                    <button onClick={() => removePendingFile(index)} disabled={busy} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-black text-white">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!locked && canAddMore && (
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => { addPendingFiles(event.target.files); event.target.value = ""; }} className="mt-4 block w-full text-sm" />
          )}
          {!locked && pendingFiles.length > 0 && (
            <button disabled={busy} onClick={() => void uploadPendingPhotos()} className="mt-3 h-11 w-full break-keep rounded-2xl bg-[#10213D] text-sm font-black text-white disabled:opacity-40">{busy ? "업로드 중..." : "사진 올리기"}</button>
          )}
          {!locked && !canAddMore && <p className="mt-3 break-keep text-xs font-bold text-[#8CA0BD]">최대 {MAX_IMAGES}장까지 올릴 수 있어요.</p>}

          <button disabled={busy || locked || uploadedCount === 0} onClick={() => void finalSubmit()} className="mt-4 h-12 w-full break-keep rounded-2xl bg-[#2874E8] text-sm font-black text-white disabled:opacity-40">
            {locked ? currentStatus : "최종 제출"}
          </button>
        </section>

        {data?.submission && data.submission.attempts.length > 0 && (
          <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <h2 className="break-keep text-lg font-black text-[#10213D]">제출 이력</h2>
            <div className="mt-3 space-y-2">
              {data.submission.attempts.slice().reverse().map((attempt) => (
                <div key={attempt.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#EAF0FA] px-3 py-2">
                  <div className="min-w-0">
                    <p className="break-keep text-sm font-black text-[#10213D]">{attempt.attempt_no}회차 · {new Date(attempt.submitted_at).toLocaleString("ko-KR")}</p>
                    <p className="mt-0.5 break-keep text-xs font-bold text-[#6E7F99]">{timingLabels[attempt.timing_status] ?? attempt.timing_status}{attempt.review_note ? ` · ${attempt.review_note}` : ""}</p>
                  </div>
                  <span className="shrink-0 break-keep rounded-md bg-[#EAF5FF] px-2 py-1 text-[10px] font-black text-[#2874E8]">{reviewLabels[attempt.review_status] ?? attempt.review_status}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </ScreenShell>
  );
}
