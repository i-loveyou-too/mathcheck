"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getStudent } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const subjects = ["국어", "수학", "영어", "탐구", "기타"];

type ImageItem = { id: number; original_filename: string | null; mime_type: string; size_bytes: number; width: number | null; height: number | null };
type Submission = {
  id: number;
  learning_date: string;
  total_minutes: number;
  subject_breakdown: Record<string, number>;
  memo: string | null;
  status: "draft" | "pending" | "approved" | "rejected" | "cancelled";
  approved_minutes: number | null;
  review_note: string | null;
  images: ImageItem[];
};
type CurrentData = {
  learning_date: string;
  daily_goal_minutes: number | null;
  submission: Submission | null;
  stats: { today_approved_minutes: number; week_approved_minutes: number; sprint_approved_minutes: number; achievement_rate: number | null };
};

function minutesLabel(minutes: number | null | undefined) {
  if (!minutes) return "0분";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}시간 ${m}분` : `${m}분`;
}

export default function StudentSprintStudyTimePage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [data, setData] = useState<CurrentData | null>(null);
  const [learningDate, setLearningDate] = useState(getStudyDate());
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("0");
  const [breakdown, setBreakdown] = useState<Record<string, string>>({});
  const [memo, setMemo] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const totalMinutes = Number(hours || 0) * 60 + Number(minutes || 0);

  const load = async (id: number, date: string) => {
    const result = await apiFetch<CurrentData>(`/student/sprint/study-time/current?student_id=${id}&learning_date=${date}`);
    setData(result);
    if (result.submission) {
      setHours(String(Math.floor(result.submission.total_minutes / 60)));
      setMinutes(String(result.submission.total_minutes % 60));
      setMemo(result.submission.memo ?? "");
      const next: Record<string, string> = {};
      Object.entries(result.submission.subject_breakdown ?? {}).forEach(([key, value]) => { next[key] = String(value); });
      setBreakdown(next);
    }
  };

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void load(student.id, learningDate).catch((reason) => setError(reason instanceof Error ? reason.message : "공부시간 정보를 불러오지 못했습니다."));
  }, [router]);

  const changeDate = (date: string) => {
    setLearningDate(date);
    setError("");
    setNotice("");
    if (studentId) void load(studentId, date).catch((reason) => setError(reason instanceof Error ? reason.message : "날짜 정보를 불러오지 못했습니다."));
  };

  const saveDraft = async () => {
    if (!studentId) return null;
    const subject_breakdown: Record<string, number> = {};
    Object.entries(breakdown).forEach(([key, value]) => {
      const numeric = Number(value || 0);
      if (numeric > 0) subject_breakdown[key] = numeric;
    });
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<CurrentData>("/student/sprint/study-time/drafts", {
        method: "POST",
        body: {
          student_id: studentId,
          learning_date: learningDate,
          total_minutes: totalMinutes,
          subject_breakdown: Object.keys(subject_breakdown).length ? subject_breakdown : null,
          memo: memo || null,
        },
      });
      setData(result);
      setNotice("임시저장했습니다.");
      return result.submission;
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "임시저장에 실패했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (submission: Submission) => {
    if (!studentId || !API_BASE_URL || files.length === 0) return;
    for (const file of files.slice(0, 3)) {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_BASE_URL}/student/sprint/study-time/${submission.id}/images?student_id=${studentId}`, {
        method: "POST",
        body,
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "사진 업로드에 실패했습니다.");
      }
    }
    setFiles([]);
  };

  const submit = async () => {
    if (!studentId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const submission = await saveDraft();
      if (!submission) return;
      await uploadFiles(submission);
      const refreshed = await apiFetch<CurrentData>(`/student/sprint/study-time/current?student_id=${studentId}&learning_date=${learningDate}`);
      if (!refreshed.submission?.images.length) throw new Error("인증 사진을 1장 이상 올려주세요.");
      await apiFetch(`/student/sprint/study-time/${refreshed.submission.id}/submit`, {
        method: "POST",
        body: { student_id: studentId },
      });
      await load(studentId, learningDate);
      setNotice("제출했습니다. 관리자 승인 후 통계에 반영됩니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "제출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = async () => {
    if (!studentId || !data?.submission) return;
    await apiFetch(`/student/sprint/study-time/${data.submission.id}/cancel`, { method: "POST", body: { student_id: studentId } });
    await load(studentId, learningDate);
  };

  const imageUrl = (imageId: number) => `${API_BASE_URL}/student/sprint/study-time/images/${imageId}?student_id=${studentId}`;
  const locked = data?.submission?.status === "pending" || data?.submission?.status === "approved";
  const reviewComment = data?.submission?.review_note?.trim();
  const isRejected = data?.submission?.status === "rejected";
  const isApproved = data?.submission?.status === "approved";
  const commentTitle = data?.submission?.status === "pending" ? "이전 반려 사유" : "선생님 코멘트";
  const commentClassName = isRejected
    ? "border-red-100 bg-red-50 text-red-700"
    : isApproved
      ? "border-sky-100 bg-sky-50 text-sky-700"
      : "border-amber-100 bg-amber-50 text-amber-700";

  return (
    <ScreenShell withBottomNav>
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm font-black tracking-[0.18em] text-[#FF6B4A]">STUDY PROOF</p>
          <h1 className="mt-1 text-2xl font-black text-[#17213B]">공부시간 인증</h1>
        </div>
        <button onClick={() => router.push("/student/sprint")} className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#5C63FF] shadow-sm">SPRINT</button>
      </div>

      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
      {notice && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

      <section className="rounded-[28px] bg-[#17213B] p-5 text-white shadow-card">
        <p className="text-xs font-bold text-white/55">오늘 목표</p>
        <div className="mt-2 flex items-end justify-between">
          <h2 className="text-3xl font-black">{minutesLabel(data?.daily_goal_minutes)}</h2>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{data?.submission?.status ?? "not_submitted"}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-lg font-black">{minutesLabel(data?.stats.today_approved_minutes)}</p><p className="text-white/50">오늘 승인</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-lg font-black">{minutesLabel(data?.stats.week_approved_minutes)}</p><p className="text-white/50">이번 주</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-lg font-black">{minutesLabel(data?.stats.sprint_approved_minutes)}</p><p className="text-white/50">누적</p></div>
        </div>
      </section>

      <section className="rounded-[28px] bg-white p-5 shadow-card">
        <label className="text-xs font-black text-[#7A859F]">학습일<input type="date" value={learningDate} onChange={(event) => changeDate(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[#E5EAF1] px-4 text-[#17213B]" /></label>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-black text-[#7A859F]">시간<input disabled={locked} type="number" min="0" max="24" value={hours} onChange={(event) => setHours(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[#E5EAF1] px-4 text-[#17213B] disabled:bg-gray-100" /></label>
          <label className="text-xs font-black text-[#7A859F]">분<input disabled={locked} type="number" min="0" max="59" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[#E5EAF1] px-4 text-[#17213B] disabled:bg-gray-100" /></label>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {subjects.map((subject) => <label key={subject} className="text-xs font-bold text-[#7A859F]">{subject}<input disabled={locked} type="number" min="0" value={breakdown[subject] ?? ""} onChange={(event) => setBreakdown({ ...breakdown, [subject]: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-[#E5EAF1] px-3 text-[#17213B] disabled:bg-gray-100" placeholder="분" /></label>)}
        </div>
        <textarea disabled={locked} value={memo} onChange={(event) => setMemo(event.target.value)} rows={3} className="mt-4 w-full resize-none rounded-2xl border border-[#E5EAF1] p-3 text-sm outline-none disabled:bg-gray-100" placeholder="메모" />
        <input disabled={locked} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))} className="mt-4 block w-full text-sm" />
        {files.length > 0 && <p className="mt-2 text-xs font-bold text-[#5C63FF]">새 사진 {files.length}장 선택됨</p>}
        {reviewComment && (
          <div className={`mt-3 rounded-2xl border px-4 py-3 ${commentClassName}`}>
            <p className="text-xs font-black">{commentTitle}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-bold">{reviewComment}</p>
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button disabled={busy || locked || totalMinutes < 1} onClick={() => void saveDraft()} className="h-12 rounded-2xl bg-[#F0F2F8] text-sm font-black text-[#17213B] disabled:opacity-40">임시저장</button>
          <button disabled={busy || locked || totalMinutes < 1} onClick={() => void submit()} className="h-12 rounded-2xl bg-[#FF6B4A] text-sm font-black text-white disabled:opacity-40">제출</button>
        </div>
        {data?.submission?.status === "pending" && <button onClick={() => void cancelPending()} className="mt-2 h-11 w-full rounded-2xl bg-gray-100 text-sm font-black text-gray-600">제출 취소 후 수정</button>}
      </section>

      {data?.submission?.images?.length ? (
        <section className="rounded-[28px] bg-white p-5 shadow-card">
          <h2 className="text-lg font-black text-[#17213B]">제출 사진</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {data.submission.images.map((image) => <img key={image.id} src={imageUrl(image.id)} alt="study proof" className="aspect-square rounded-2xl object-cover" />)}
          </div>
        </section>
      ) : null}
    </ScreenShell>
  );
}
