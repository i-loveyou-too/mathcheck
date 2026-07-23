"use client";

import Link from "next/link";
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
// SPRINT DAY/스트라이크와의 연결 표시용 — 기존 대시보드 조회 API를 읽기 전용으로 재사용한다.
type SprintContext = { dayNumber: number | null; strikeEffective: number; strikeThreshold: number };

const statusLabels: Record<string, string> = {
  draft: "임시저장", pending: "검토 대기", approved: "승인 완료", rejected: "반려됨", cancelled: "취소됨", not_submitted: "미제출",
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
  const [sprintContext, setSprintContext] = useState<SprintContext | null>(null);

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
    // DAY/스트라이크 연결 표시는 순수 장식용이라 실패해도 조용히 무시한다 (제출 흐름과 무관).
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
  const currentStatusLabel = statusLabels[data?.submission?.status ?? "not_submitted"] ?? "미제출";

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
          <h1 className="break-keep text-3xl font-black tracking-[-0.05em] text-[#10213D]">공부시간 인증</h1>
          {isApproved && <span className="shrink-0 break-keep rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-600">완료 · 진행률 반영됨</span>}
        </div>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 break-keep rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-6 rounded-[28px] bg-white/95 p-5 shadow-[0_18px_36px_rgba(49,89,130,0.18)] ring-1 ring-[#DCEBFA]">
          <p className="text-xs font-bold text-[#6E7F99]">오늘 목표</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <h2 className="text-3xl font-black text-[#10213D]">{minutesLabel(data?.daily_goal_minutes)}</h2>
            <span className="shrink-0 break-keep rounded-full bg-[#EAF5FF] px-3 py-1.5 text-xs font-black text-[#2874E8]">{currentStatusLabel}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-2xl bg-[#F5F9FF] p-3"><p className="text-lg font-black text-[#10213D]">{minutesLabel(data?.stats.today_approved_minutes)}</p><p className="break-keep text-[#8CA0BD]">오늘 승인</p></div>
            <div className="rounded-2xl bg-[#F5F9FF] p-3"><p className="text-lg font-black text-[#10213D]">{minutesLabel(data?.stats.week_approved_minutes)}</p><p className="break-keep text-[#8CA0BD]">이번 주</p></div>
            <div className="rounded-2xl bg-[#F5F9FF] p-3"><p className="text-lg font-black text-[#10213D]">{minutesLabel(data?.stats.sprint_approved_minutes)}</p><p className="break-keep text-[#8CA0BD]">누적</p></div>
          </div>
          {sprintContext && (
            <div className="mt-4 flex items-center justify-between border-t border-[#EAF0FA] pt-3 text-xs font-bold text-[#8CA0BD]">
              <span className="break-keep">이 인증을 완료하면 SPRINT 진행률이 올라가요.</span>
              <span className="shrink-0 break-keep text-[#E5533C]">스트라이크 {sprintContext.strikeEffective}/{sprintContext.strikeThreshold}</span>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
          <label className="break-keep text-xs font-black text-[#6E7F99]">학습일<input type="date" value={learningDate} onChange={(event) => changeDate(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[#DFEAF6] px-4 text-[#10213D]" /></label>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="break-keep text-xs font-black text-[#6E7F99]">시간<input disabled={locked} type="number" min="0" max="24" value={hours} onChange={(event) => setHours(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[#DFEAF6] px-4 text-[#10213D] disabled:bg-[#F5F8FC]" /></label>
            <label className="break-keep text-xs font-black text-[#6E7F99]">분<input disabled={locked} type="number" min="0" max="59" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[#DFEAF6] px-4 text-[#10213D] disabled:bg-[#F5F8FC]" /></label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {subjects.map((subject) => <label key={subject} className="break-keep text-xs font-bold text-[#6E7F99]">{subject}<input disabled={locked} type="number" min="0" value={breakdown[subject] ?? ""} onChange={(event) => setBreakdown({ ...breakdown, [subject]: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-[#DFEAF6] px-3 text-[#10213D] disabled:bg-[#F5F8FC]" placeholder="분" /></label>)}
          </div>
          <textarea disabled={locked} value={memo} onChange={(event) => setMemo(event.target.value)} rows={3} className="mt-4 w-full resize-none rounded-2xl border border-[#DFEAF6] p-3 text-sm text-[#10213D] outline-none disabled:bg-[#F5F8FC]" placeholder="메모" />
          <input disabled={locked} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))} className="mt-4 block w-full text-sm" />
          {files.length > 0 && <p className="mt-2 break-keep text-xs font-bold text-[#2874E8]">새 사진 {files.length}장 선택됨</p>}
          {reviewComment && (
            <div className={`mt-3 rounded-2xl border px-4 py-3 ${commentClassName}`}>
              <p className="break-keep text-xs font-black">{commentTitle}</p>
              <p className="mt-1 whitespace-pre-wrap break-keep text-sm font-bold">{reviewComment}</p>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button disabled={busy || locked || totalMinutes < 1} onClick={() => void saveDraft()} className="h-12 break-keep rounded-2xl bg-[#EAF5FF] text-sm font-black text-[#2874E8] disabled:opacity-40">임시저장</button>
            <button disabled={busy || locked || totalMinutes < 1} onClick={() => void submit()} className="h-12 break-keep rounded-2xl bg-[#2874E8] text-sm font-black text-white disabled:opacity-40">제출</button>
          </div>
          {data?.submission?.status === "pending" && <button onClick={() => void cancelPending()} className="mt-2 h-11 w-full break-keep rounded-2xl bg-[#F5F8FC] text-sm font-black text-[#6E7F99]">제출 취소 후 수정</button>}
        </section>

        {data?.submission?.images?.length ? (
          <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <h2 className="break-keep text-lg font-black text-[#10213D]">제출 사진</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {data.submission.images.map((image) => <img key={image.id} src={imageUrl(image.id)} alt="study proof" className="aspect-square rounded-2xl object-cover" />)}
            </div>
          </section>
        ) : null}
      </div>
    </ScreenShell>
  );
}
