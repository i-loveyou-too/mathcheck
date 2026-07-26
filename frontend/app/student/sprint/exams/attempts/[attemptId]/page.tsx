"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { ApiError, apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type Question = {
  id: number;
  question_no: number;
  question_type: "choice" | "short_answer" | string;
  score: number;
  response: null | { question_id: number; answer: string[]; saved_at: string | null };
};

type Paper = {
  assignment_paper_id: number;
  subject_code: string;
  subject_name: string;
  score_group_code: string;
  score_group_name: string;
  listening_youtube_url?: string | null;
  question_count: number;
  questions: Question[];
};

type AttemptDetail = {
  attempt: { id: number; assignment_id: number; attempt_no: number; status: "started" | "submitted" | "scored" | "voided"; started_at: string | null; submitted_at: string | null };
  assignment: { id: number; status: string; due_at: string | null };
  exam: { id: number; title: string; exam_date: string | null };
  papers: Paper[];
  progress: { answered_count: number; unanswered_count: number; total_question_count: number };
};

type SaveResponse = { answered_count: number; unanswered_count: number; total_question_count: number; saved_at: string };
type SubmitResponse = { attempt_id: number; status: string; submitted_at: string | null; answered_count: number; unanswered_count: number; total_question_count: number };

function formatTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function choiceValues(question: Question) {
  return question.question_type === "choice" ? ["1", "2", "3", "4", "5"] : [];
}

function youtubeEmbedUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    let videoId: string | null = null;
    if (url.hostname === "www.youtube.com" && url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (url.hostname === "www.youtube.com" && url.pathname.startsWith("/embed/")) {
      const parts = url.pathname.split("/").filter(Boolean);
      videoId = parts.length === 2 && parts[0] === "embed" ? parts[1] : null;
    } else if (url.hostname === "youtu.be") {
      const parts = url.pathname.split("/").filter(Boolean);
      videoId = parts.length === 1 ? parts[0] : null;
    }
    if (!videoId || !/^[A-Za-z0-9_-]{6,128}$/.test(videoId)) return null;
    const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
    embedUrl.searchParams.set("playsinline", "1");
    if (typeof window !== "undefined" && window.location.origin) {
      embedUrl.searchParams.set("origin", window.location.origin);
    }
    return embedUrl.toString();
  } catch {
    return null;
  }
}

export default function StudentSprintExamAttemptPage() {
  const router = useRouter();
  const params = useParams<{ attemptId: string }>();
  const attemptId = Number(params.attemptId);
  const [data, setData] = useState<AttemptDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [activePaperIndex, setActivePaperIndex] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingQuestionIds, setSavingQuestionIds] = useState<Set<number>>(() => new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmitResponse | null>(null);

  const load = async () => {
    const result = await apiFetch<AttemptDetail>(`/student/sprint-exam-v2/attempts/${attemptId}`);
    setData(result);
    const nextAnswers: Record<number, string[]> = {};
    for (const paper of result.papers) {
      for (const question of paper.questions) {
        if (question.response?.answer?.length) nextAnswers[question.id] = question.response.answer;
      }
    }
    setAnswers(nextAnswers);
  };

  useEffect(() => {
    if (!getStudent()) {
      router.push("/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "OMR을 불러오지 못했습니다."));
  }, [router, attemptId]);

  const progress = useMemo(() => {
    const total = data?.progress.total_question_count ?? 0;
    const answered = Object.values(answers).filter((value) => value.length > 0).length;
    return { total, answered, unanswered: Math.max(total - answered, 0) };
  }, [answers, data]);

  const activePaper = data?.papers[activePaperIndex] ?? data?.papers[0] ?? null;
  const activeListeningEmbedUrl =
    activePaper?.subject_code === "english" ? youtubeEmbedUrl(activePaper.listening_youtube_url) : null;
  const isSaving = savingQuestionIds.size > 0;

  const saveAnswer = async (question: Question, answer: string[]) => {
    if (savingQuestionIds.has(question.id)) return;
    setAnswers((current) => ({ ...current, [question.id]: answer }));
    setSavingQuestionIds((current) => new Set(current).add(question.id));
    setError("");
    try {
      const saved = await apiFetch<SaveResponse>(`/student/sprint-exam-v2/attempts/${attemptId}/responses/${question.id}`, {
        method: "PATCH",
        body: { answer },
      });
      setNotice(`자동 저장됨 · ${saved.answered_count}/${saved.total_question_count}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "답안을 저장하지 못했습니다.");
    } finally {
      setSavingQuestionIds((current) => {
        const next = new Set(current);
        next.delete(question.id);
        return next;
      });
    }
  };

  const submit = async () => {
    if (isSaving) {
      setError("답안을 저장하는 중입니다. 저장이 끝난 뒤 다시 제출해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetch<SubmitResponse>(`/student/sprint-exam-v2/attempts/${attemptId}/submit`, { method: "POST" });
      setSubmitted(result);
      setShowConfirm(false);
      setNotice("");
      router.push(`/student/sprint/exams/attempts/${attemptId}/result`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "제출하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[70vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "OMR을 불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  if (submitted || data.attempt.status !== "started") {
    const done = submitted;
    return (
      <ScreenShell withBottomNav>
        <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
          <section className="mt-16 rounded-[28px] bg-white/95 p-8 text-center shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#18A566] text-4xl font-black text-[#18A566]">✓</div>
            <h1 className="mt-6 break-keep text-2xl font-black text-[#10213D]">제출이 완료되었습니다.</h1>
            <p className="mt-2 break-keep text-sm font-bold leading-6 text-[#6E7F99]">채점과 결과 공개가 끝나면 결과 화면에서 확인할 수 있습니다.</p>
            <div className="mt-6 rounded-2xl bg-[#F6FAFF] p-4 text-left text-sm">
              <div className="flex justify-between gap-4"><span className="font-bold text-[#6E7F99]">시험명</span><span className="text-right font-black text-[#10213D]">{data.exam.title}</span></div>
              <div className="mt-2 flex justify-between gap-4"><span className="font-bold text-[#6E7F99]">응답</span><span className="font-black text-[#10213D]">{done?.answered_count ?? progress.answered} / {done?.total_question_count ?? progress.total}</span></div>
              <div className="mt-2 flex justify-between gap-4"><span className="font-bold text-[#6E7F99]">제출 시간</span><span className="font-black text-[#10213D]">{formatTime(done?.submitted_at ?? data.attempt.submitted_at)}</span></div>
            </div>
            <Link href={`/student/sprint/exams/attempts/${attemptId}/result`} className="mt-6 block h-12 rounded-2xl border border-[#A9CBFA] text-sm font-black leading-[3rem] text-[#2874E8]">결과 상태 확인</Link>
            <Link href={`/student/sprint/exams/${data.assignment.id}`} className="mt-3 block h-12 rounded-2xl bg-[#2874E8] text-sm font-black leading-[3rem] text-white">시험 상세로 돌아가기</Link>
          </section>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-40 pt-10">
        <div className="flex items-center justify-between">
          <Link href={`/student/sprint/exams/${data.assignment.id}`} className="break-keep text-sm font-black text-[#2874E8]">← 시험 상세</Link>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isSaving}
            className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#2874E8] shadow-sm ring-1 ring-[#DCEBFA] disabled:opacity-45"
          >
            {isSaving ? "답안 저장 중" : "제출 전 확인"}
          </button>
        </div>

        <header className="mt-5">
          <p className="text-sm font-black tracking-[0.18em] text-[#2874E8]">OMR ANSWER</p>
          <h1 className="mt-1 break-keep text-2xl font-black tracking-[-0.04em] text-[#10213D]">{data.exam.title}</h1>
          <p className="mt-2 break-keep text-sm font-bold leading-6 text-[#6E7F99]">문제 본문은 표시하지 않습니다. 종이 시험지를 보며 답만 체크하세요.</p>
        </header>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 break-keep rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="sticky top-0 z-20 -mx-5 mt-5 bg-[#EFF9FF]/95 px-5 py-3 backdrop-blur">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.papers.map((paper, index) => (
              <button
                key={paper.assignment_paper_id}
                onClick={() => setActivePaperIndex(index)}
                className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-black ${index === activePaperIndex ? "bg-[#2874E8] text-white" : "bg-white text-[#52637D] ring-1 ring-[#DFEAF6]"}`}
              >
                {paper.subject_name}
              </button>
            ))}
          </div>
        </section>

        {activePaper && (
          <section className="mt-4 rounded-[26px] bg-white/95 p-5 shadow-[0_14px_32px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="break-keep text-lg font-black text-[#10213D]">{activePaper.subject_name}</h2>
                <p className="mt-1 text-xs font-bold text-[#8CA0BD]">{activePaper.question_count}문항</p>
              </div>
              <span className="rounded-full bg-[#EAF5FF] px-3 py-1.5 text-xs font-black text-[#2874E8]">
                {activePaper.questions.filter((q) => (answers[q.id] ?? []).length > 0).length} / {activePaper.question_count}
              </span>
            </div>

            {activePaper.subject_code === "english" && activePaper.listening_youtube_url && (
              <div className="mb-5 rounded-[22px] border border-[#DCEBFA] bg-[#F7FBFF] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="break-keep text-sm font-black text-[#10213D]">영어 듣기평가</h3>
                    <p className="mt-1 break-keep text-xs font-bold text-[#6E7F99]">자동재생 없이 필요한 때 직접 재생하세요.</p>
                  </div>
                </div>
                {activeListeningEmbedUrl ? (
                  <div className="aspect-video overflow-hidden rounded-2xl bg-black">
                    <iframe
                      title={`${activePaper.subject_name} listening video`}
                      src={activeListeningEmbedUrl}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <p className="break-keep rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">듣기 영상 링크를 확인해주세요.</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              {activePaper.questions.map((question) => {
                const selected = answers[question.id] ?? [];
                const choices = choiceValues(question);
                return (
                  <div key={question.id} className="grid grid-cols-[2.25rem_1fr] items-center gap-2 border-t border-[#EDF2F8] py-3 first:border-t-0">
                    <div className="text-center text-sm font-black text-[#10213D]">{question.question_no}</div>
                    {choices.length > 0 ? (
                      <div className="grid grid-cols-5 gap-2">
                        {choices.map((value) => {
                          const active = selected.includes(value);
                          return (
                            <button
                              key={value}
                              onClick={() => void saveAnswer(question, active ? [] : [value])}
                              disabled={savingQuestionIds.has(question.id)}
                              className={`aspect-square rounded-full text-sm font-black ring-1 transition disabled:opacity-55 ${active ? "bg-[#2874E8] text-white ring-[#2874E8]" : "bg-white text-[#617089] ring-[#B9C7DA]"}`}
                              aria-label={`${question.question_no}번 ${value}번`}
                            >
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <input
                        defaultValue={selected[0] ?? ""}
                        onBlur={(event) => void saveAnswer(question, event.target.value.trim() ? [event.target.value.trim()] : [])}
                        disabled={savingQuestionIds.has(question.id)}
                        className="h-11 rounded-2xl border border-[#C7D5E8] bg-white px-4 text-sm font-bold text-[#10213D] outline-none focus:border-[#2874E8]"
                        placeholder="주관식 답안"
                      />
                    )}
                    {savingQuestionIds.has(question.id) && <p className="col-span-2 pl-11 text-xs font-bold text-[#8CA0BD]">저장 중...</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-4 pb-4">
            <section className="w-full max-w-[430px] rounded-[28px] bg-white p-5 shadow-2xl">
              <h2 className="break-keep text-xl font-black text-[#10213D]">제출 전 확인</h2>
              <div className="mt-4 rounded-2xl bg-[#F6FAFF] p-4 text-sm">
                <div className="flex justify-between"><span className="font-bold text-[#6E7F99]">전체 문항</span><span className="font-black text-[#10213D]">{progress.total}</span></div>
                <div className="mt-2 flex justify-between"><span className="font-bold text-[#6E7F99]">선택 완료</span><span className="font-black text-[#10213D]">{progress.answered}</span></div>
                <div className="mt-2 flex justify-between"><span className="font-bold text-[#6E7F99]">미응답</span><span className={`font-black ${progress.unanswered > 0 ? "text-[#E25050]" : "text-[#17895E]"}`}>{progress.unanswered}</span></div>
              </div>
              {progress.unanswered > 0 && <p className="mt-3 break-keep rounded-2xl bg-[#FFF6E2] px-4 py-3 text-xs font-bold leading-5 text-[#9A6500]">빈 문항이 있습니다. 그래도 제출할 수 있지만, 제출 후에는 수정할 수 없습니다.</p>}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button onClick={() => setShowConfirm(false)} className="h-12 rounded-2xl border border-[#C7D5E8] text-sm font-black text-[#2874E8]">이전으로</button>
                <button disabled={submitting || isSaving} onClick={() => void submit()} className="h-12 rounded-2xl bg-[#2874E8] text-sm font-black text-white disabled:opacity-45">{submitting ? "제출 중..." : isSaving ? "답안 저장 중" : "제출하기"}</button>
              </div>
            </section>
          </div>
        )}

        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 px-5">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isSaving}
            className="h-14 w-full rounded-[20px] bg-[#2874E8] text-base font-black text-white shadow-[0_16px_35px_rgba(40,116,232,0.28)] disabled:opacity-55"
          >
            {isSaving ? "답안 저장 중..." : `제출 전 확인 · ${progress.answered}/${progress.total}`}
          </button>
        </div>
      </div>
    </ScreenShell>
  );
}
