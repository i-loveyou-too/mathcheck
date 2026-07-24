"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);

const SUBJECT_OPTIONS = [
  { code: "korean", label: "국어" },
  { code: "math", label: "수학" },
  { code: "english", label: "영어" },
  { code: "life_ethics", label: "생활과 윤리" },
  { code: "ethics_thought", label: "윤리와 사상" },
  { code: "social_culture", label: "사회문화" },
  { code: "east_asian_history", label: "동아시아사" },
];

const STATUS_LABELS: Record<string, string> = {
  scheduled: "예정", open: "응시 가능", closed: "마감",
  not_started: "미응시", in_progress: "진행 중", completed: "완료",
  needs_selection: "선택과목 설정 필요", draft: "작성 중", submitted: "제출됨", graded: "채점 완료", confirmed: "확정",
};

type Media = { id: number; media_type: "paper_pdf" | "listening_audio"; original_filename: string | null; mime_type: string; file_size: number; duration_seconds: number | null; student_url: string; admin_url: string };
type GradeCut = { grade: number; minimum_score: number };
type Question = { question_no: number; correct_answer: number; score_points: number; category: string | null; is_scored: boolean; memo: string | null };
type Paper = {
  id: number; mock_exam_round_id: number; subject_group: string; subject_code: string; subject_label: string;
  title: string; question_count: number; total_score: number; scoring_policy: string; is_required: boolean; is_active: boolean;
  has_answer_key: boolean; answer_key_total: number; grade_cuts: GradeCut[]; media: Media[]; questions?: Question[];
};
type ParticipantPaper = {
  id: number; paper_id: number | null; subject_slot: string; slot_label: string; subject_label: string | null;
  status: string; submitted_at: string | null; raw_score: number | null; max_score: number | null; correct_count: number | null;
  wrong_count: number; unanswered_count: number; paper: Paper | null;
};
type Participant = { id: number; student_id: number; status: string; papers: ParticipantPaper[] };
type RoundStats = {
  total_participants: number; inquiry_unset_count: number; not_attempted_count: number; draft_count: number;
  submitted_count: number; graded_count: number; completed_count: number;
};
type Round = {
  id: number; sprint_program_id: number; round_no: number; title: string; exam_date: string; start_time: string | null;
  submission_deadline_at: string; status: string; is_active: boolean; papers: Paper[]; stats?: RoundStats; participants?: Participant[];
};

function formatBytes(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AdminMockExamRoundsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const programId = Number(params.id);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [expanded, setExpanded] = useState<Record<number, Round>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "SPRINT 모의고사", exam_date: today, start_time: "09:00", submission_deadline_time: "23:00" });

  const load = async () => {
    setRounds(await apiFetch<Round[]>(`/admin/sprints/${programId}/mock-exam-rounds`));
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "회차 목록을 불러오지 못했습니다."));
  }, [programId, router]);

  const refreshExpanded = async (roundId: number) => {
    const detail = await apiFetch<Round>(`/admin/mock-exam-rounds/${roundId}`);
    setExpanded((prev) => ({ ...prev, [roundId]: detail }));
  };

  const toggleExpand = async (roundId: number) => {
    if (expanded[roundId]) {
      setExpanded((prev) => { const next = { ...prev }; delete next[roundId]; return next; });
      return;
    }
    await refreshExpanded(roundId);
  };

  const run = async (action: () => Promise<unknown>, message: string, roundId?: number) => {
    setError(""); setNotice("");
    try {
      await action();
      await load();
      if (roundId && expanded[roundId]) await refreshExpanded(roundId);
      setNotice(message);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "요청을 처리하지 못했습니다.");
    }
  };

  const createRound = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/sprints/${programId}/mock-exam-rounds`, {
        method: "POST",
        body: { title: form.title, exam_date: form.exam_date, start_time: form.start_time, submission_deadline_time: form.submission_deadline_time },
      });
      await load();
      setNotice("회차를 등록했습니다. 이제 과목별 시험지를 추가하세요.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "회차를 등록하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href={`/admin/sprints/${programId}`} className="text-sm font-bold text-[#64748B]">← SPRINT 상세</Link>
        <div className="mt-4">
          <p className="text-sm font-bold text-[#FF6B4A]">MOCK EXAM ROUNDS (이전 방식)</p>
          <h1 className="mt-1 text-3xl font-black text-[#17213B]">모의고사 회차 관리</h1>
          <p className="mt-2 text-sm font-semibold text-[#7A859F]">회차 하나에 국어·수학·영어·탐구(4과목 중 택2) 시험지를 등록하면, 이 SPRINT 학생에게 자동 배정됩니다.</p>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
          <p className="text-sm font-black text-amber-800">ℹ 새 모의고사 관리 화면이 생겼습니다.</p>
          <p className="mt-1 text-xs font-bold text-amber-700">
            이제 공통 시험을 한 번 등록해 여러 학생에게 배정하는{" "}
            <Link href="/admin/mock-exams" className="underline">SPRINT 모의고사 관리</Link>
            {" "}화면을 사용하세요. 이 회차 화면은 기존에 배정·응시 기록이 있는 학생을 위해 유지되며, 기존 데이터는 그대로 보존됩니다.
          </p>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <div className="mt-6 grid gap-5 lg:grid-cols-[340px_1fr]">
          <form onSubmit={createRound} className="h-fit rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">새 회차 등록</h2>
            <div className="mt-4 space-y-3 text-xs font-bold text-[#7A859F]">
              <label className="block">제목<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">시험일<input type="date" required value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">시작 시간<input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">제출 마감<input type="time" required value={form.submission_deadline_time} onChange={(e) => setForm({ ...form, submission_deadline_time: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            </div>
            <button disabled={saving} className="mt-5 h-12 w-full rounded-2xl bg-[#5C63FF] text-sm font-black text-white disabled:opacity-50">{saving ? "등록 중..." : "회차 등록"}</button>
          </form>

          <section className="space-y-4">
            {rounds.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">등록된 회차가 없습니다.</div>}
            {rounds.map((round) => {
              const detail = expanded[round.id];
              return (
                <article key={round.id} className="rounded-[24px] bg-white p-5 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black text-[#17213B]">{round.round_no}회차 · {round.title}</h2>
                        <span className="rounded-md bg-[#F1F3FF] px-2 py-0.5 text-[10px] font-black text-[#5C63FF]">{STATUS_LABELS[round.status] ?? round.status}</span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-[#7A859F]">시험일 {round.exam_date} · 마감 {new Date(round.submission_deadline_at).toLocaleString("ko-KR")} · 시험지 {round.papers.length}/7</p>
                      {round.stats && (
                        <p className="mt-1 text-xs font-bold text-[#98A2B3]">
                          참가 {round.stats.total_participants} · 탐구 미설정 {round.stats.inquiry_unset_count} · 미응시 {round.stats.not_attempted_count} · 제출 {round.stats.submitted_count} · 채점완료 {round.stats.graded_count} · 회차완료 {round.stats.completed_count}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void run(() => apiFetch(`/admin/mock-exam-rounds/${round.id}/sync-participants`, { method: "POST" }), "참가자를 다시 동기화했습니다.", round.id)} className="rounded-xl bg-[#F0F2F8] px-3 py-2 text-xs font-black text-[#17213B]">참가자 동기화</button>
                      <button onClick={() => void run(() => apiFetch(`/admin/mock-exam-rounds/${round.id}/confirm-all`, { method: "POST" }), "채점 완료 항목을 확정했습니다.", round.id)} className="rounded-xl bg-[#17213B] px-3 py-2 text-xs font-black text-white">전체 확정</button>
                      <button onClick={() => void toggleExpand(round.id)} className="rounded-xl bg-[#EAF5FF] px-3 py-2 text-xs font-black text-[#2874E8]">{detail ? "접기" : "관리하기"}</button>
                    </div>
                  </div>

                  {detail && (
                    <RoundDetail
                      round={detail}
                      onChanged={() => { void load(); void refreshExpanded(round.id); }}
                      onNotice={(msg) => setNotice(msg)}
                      onError={(msg) => setError(msg)}
                    />
                  )}
                </article>
              );
            })}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}

function RoundDetail({ round, onChanged, onNotice, onError }: { round: Round; onChanged: () => void; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const availableCodes = SUBJECT_OPTIONS.filter((opt) => !round.papers.some((p) => p.subject_code === opt.code));
  const [newPaperCode, setNewPaperCode] = useState(availableCodes[0]?.code ?? "");
  const [questionCount, setQuestionCount] = useState("20");
  const [totalScore, setTotalScore] = useState("100");
  const [creatingPaper, setCreatingPaper] = useState(false);

  const createPaper = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPaperCode) return;
    setCreatingPaper(true);
    try {
      await apiFetch(`/admin/mock-exam-rounds/${round.id}/papers`, {
        method: "POST",
        body: { subject_code: newPaperCode, question_count: Number(questionCount), total_score: Number(totalScore) },
      });
      onChanged();
      onNotice("시험지를 추가했습니다.");
    } catch (reason) {
      onError(reason instanceof ApiError ? reason.message : "시험지를 추가하지 못했습니다.");
    } finally {
      setCreatingPaper(false);
    }
  };

  return (
    <div className="mt-4 space-y-4 border-t border-[#EEF1F7] pt-4">
      {availableCodes.length > 0 && (
        <form onSubmit={createPaper} className="flex flex-wrap items-end gap-2 rounded-xl bg-[#F8F9FC] p-3">
          <label className="text-xs font-bold text-[#7A859F]">과목
            <select value={newPaperCode} onChange={(e) => setNewPaperCode(e.target.value)} className="mt-1 block h-10 w-40 rounded-lg bg-white px-2 text-sm text-[#17213B]">
              {availableCodes.map((opt) => <option key={opt.code} value={opt.code}>{opt.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-[#7A859F]">문항 수<input type="number" min="1" value={questionCount} onChange={(e) => setQuestionCount(e.target.value)} className="mt-1 block h-10 w-20 rounded-lg bg-white px-2 text-sm text-[#17213B]" /></label>
          <label className="text-xs font-bold text-[#7A859F]">총점<input type="number" min="1" value={totalScore} onChange={(e) => setTotalScore(e.target.value)} className="mt-1 block h-10 w-24 rounded-lg bg-white px-2 text-sm text-[#17213B]" /></label>
          <button disabled={creatingPaper} className="h-10 rounded-lg bg-[#5C63FF] px-4 text-xs font-black text-white disabled:opacity-50">시험지 추가</button>
        </form>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {round.papers.map((paper) => (
          <PaperCard key={paper.id} paper={paper} onChanged={onChanged} onNotice={onNotice} onError={onError} />
        ))}
      </div>

      {round.participants && round.participants.length > 0 && (
        <div className="rounded-xl border border-[#EEF1F7] p-3">
          <h3 className="text-sm font-black text-[#17213B]">참가자 현황</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="text-[#98A2B3]">
                  <th className="py-1 pr-3">학생ID</th>
                  <th className="py-1 pr-3">상태</th>
                  {["국어", "수학", "영어", "탐구1", "탐구2"].map((label) => <th key={label} className="py-1 pr-3">{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {round.participants.map((participant) => {
                  const slotOf = (slot: string) => participant.papers.find((p) => p.subject_slot === slot);
                  return (
                    <tr key={participant.id} className="border-t border-[#F1F3FA]">
                      <td className="py-1.5 pr-3 font-bold text-[#17213B]">#{participant.student_id}</td>
                      <td className="py-1.5 pr-3"><span className="rounded-md bg-[#F1F3FF] px-2 py-0.5 font-black text-[#5C63FF]">{STATUS_LABELS[participant.status] ?? participant.status}</span></td>
                      {["korean", "math", "english", "inquiry_1", "inquiry_2"].map((slot) => {
                        const pp = slotOf(slot);
                        return (
                          <td key={slot} className="py-1.5 pr-3 text-[#40516D]">
                            {pp ? `${STATUS_LABELS[pp.status] ?? pp.status}${pp.raw_score != null ? ` (${pp.raw_score}점)` : ""}` : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PaperCard({ paper, onChanged, onNotice, onError }: { paper: Paper; onChanged: () => void; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const [showQuestions, setShowQuestions] = useState(false);
  const [showGradeCuts, setShowGradeCuts] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [gradeCutValues, setGradeCutValues] = useState<Record<number, string>>(
    Object.fromEntries(paper.grade_cuts.map((gc) => [gc.grade, String(gc.minimum_score)])),
  );
  const [savingGradeCuts, setSavingGradeCuts] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const pdfMedia = paper.media.find((m) => m.media_type === "paper_pdf");
  const audioMedia = paper.media.find((m) => m.media_type === "listening_audio");

  const parseBulk = (): { question_no: number; correct_answer: number; score_points: number; category: string | null }[] => {
    const rows: { question_no: number; correct_answer: number; score_points: number; category: string | null }[] = [];
    for (const line of bulkText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(",").map((p) => p.trim());
      if (parts.length < 3) continue;
      rows.push({
        question_no: Number(parts[0]),
        correct_answer: Number(parts[1]),
        score_points: Number(parts[2]),
        category: parts[3] || null,
      });
    }
    return rows;
  };

  const saveQuestions = async () => {
    const rows = parseBulk();
    if (rows.length === 0) {
      onError("형식: 문항번호,정답,배점 (한 줄에 한 문항)");
      return;
    }
    setSavingQuestions(true);
    try {
      await apiFetch(`/admin/mock-exam-papers/${paper.id}/questions`, { method: "PUT", body: { questions: rows } });
      onChanged();
      onNotice("정답을 저장했습니다.");
      setBulkText("");
    } catch (reason) {
      onError(reason instanceof ApiError ? reason.message : "정답을 저장하지 못했습니다.");
    } finally {
      setSavingQuestions(false);
    }
  };

  const saveGradeCuts = async () => {
    const grade_cuts = Object.entries(gradeCutValues)
      .filter(([, value]) => value !== "")
      .map(([grade, value]) => ({ grade: Number(grade), minimum_score: Number(value) }));
    setSavingGradeCuts(true);
    try {
      await apiFetch(`/admin/mock-exam-papers/${paper.id}/grade-cuts`, { method: "PUT", body: { grade_cuts } });
      onChanged();
      onNotice("등급컷을 저장했습니다.");
    } catch (reason) {
      onError(reason instanceof ApiError ? reason.message : "등급컷을 저장하지 못했습니다.");
    } finally {
      setSavingGradeCuts(false);
    }
  };

  const uploadPdf = async (file: File) => {
    setUploadingPdf(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_BASE_URL}/admin/mock-exam-papers/${paper.id}/paper-file`, { method: "POST", body, credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || "업로드 실패");
      onChanged();
      onNotice("문제지 PDF를 업로드했습니다.");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "업로드하지 못했습니다.");
    } finally {
      setUploadingPdf(false);
    }
  };

  const uploadAudio = async (file: File) => {
    setUploadingAudio(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_BASE_URL}/admin/mock-exam-papers/${paper.id}/listening-audio`, { method: "POST", body, credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || "업로드 실패");
      onChanged();
      onNotice("영어듣기 MP3를 업로드했습니다.");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "업로드하지 못했습니다.");
    } finally {
      setUploadingAudio(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#EEF1F7] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-sm font-black text-[#17213B]">{paper.subject_label}</span>
          <span className="ml-2 text-xs font-bold text-[#98A2B3]">{paper.question_count}문항 · {paper.total_score}점</span>
        </div>
        <div className="flex gap-1.5">
          {paper.has_answer_key ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">정답 등록됨</span> : <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-500">정답 미등록</span>}
          {pdfMedia ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">PDF 있음</span> : <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">PDF 없음</span>}
          {paper.subject_code === "english" && (audioMedia ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">듣기 있음</span> : <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">듣기 없음</span>)}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => setShowQuestions((v) => !v)} className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">정답/배점 {showQuestions ? "닫기" : "입력"}</button>
        <button onClick={() => setShowGradeCuts((v) => !v)} className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">등급컷 {showGradeCuts ? "닫기" : "입력"}</button>
        <label className="cursor-pointer rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">
          {uploadingPdf ? "업로드 중..." : pdfMedia ? "PDF 교체" : "PDF 업로드"}
          <input type="file" accept="application/pdf" className="hidden" disabled={uploadingPdf} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPdf(f); e.target.value = ""; }} />
        </label>
        {pdfMedia && <a href={`${API_BASE_URL}${pdfMedia.admin_url}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">PDF 보기</a>}
        {paper.subject_code === "english" && (
          <label className="cursor-pointer rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">
            {uploadingAudio ? "업로드 중..." : audioMedia ? "MP3 교체" : "MP3 업로드"}
            <input type="file" accept="audio/mpeg,.mp3" className="hidden" disabled={uploadingAudio} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAudio(f); e.target.value = ""; }} />
          </label>
        )}
      </div>

      {paper.subject_code === "english" && audioMedia && (
        <div className="mt-2 rounded-lg bg-[#F8F9FC] p-2">
          <p className="text-[11px] font-bold text-[#7A859F]">{audioMedia.original_filename} · {formatBytes(audioMedia.file_size)}{formatDuration(audioMedia.duration_seconds) ? ` · ${formatDuration(audioMedia.duration_seconds)}` : ""}</p>
          <audio controls preload="metadata" src={`${API_BASE_URL}${audioMedia.admin_url}`} className="mt-1 w-full" />
        </div>
      )}

      {showQuestions && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] font-bold text-[#98A2B3]">형식: 문항번호,정답,배점,영역(선택) — 한 줄에 한 문항. 채점 대상 배점 합은 총점({paper.total_score})과 같아야 합니다.</p>
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} placeholder={"1,3,4\n2,5,3\n3,1,4"} className="w-full resize-none rounded-lg bg-[#F5F6FA] p-2 font-mono text-xs text-[#17213B]" />
          <button disabled={savingQuestions} className="h-9 rounded-lg bg-[#5C63FF] px-4 text-xs font-black text-white disabled:opacity-50" onClick={() => void saveQuestions()}>{savingQuestions ? "저장 중..." : "정답 저장 (전체 재채점)"}</button>
          {paper.questions && paper.questions.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-lg bg-[#F8F9FC] p-2 text-[11px] text-[#7A859F]">
              {paper.questions.map((q) => (
                <span key={q.question_no} className="mr-2 inline-block">{q.question_no}번:{q.correct_answer}번/{q.score_points}점{q.category ? `(${q.category})` : ""}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {showGradeCuts && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((grade) => (
              <label key={grade} className="text-[11px] font-bold text-[#7A859F]">{grade}등급
                <input type="number" min="0" max={paper.total_score} value={gradeCutValues[grade] ?? ""} onChange={(e) => setGradeCutValues({ ...gradeCutValues, [grade]: e.target.value })} className="mt-1 block h-9 w-full rounded-lg bg-[#F5F6FA] px-2 text-xs text-[#17213B]" />
              </label>
            ))}
          </div>
          <button disabled={savingGradeCuts} className="h-9 rounded-lg bg-[#5C63FF] px-4 text-xs font-black text-white disabled:opacity-50" onClick={() => void saveGradeCuts()}>{savingGradeCuts ? "저장 중..." : "등급컷 저장"}</button>
        </div>
      )}
    </div>
  );
}
