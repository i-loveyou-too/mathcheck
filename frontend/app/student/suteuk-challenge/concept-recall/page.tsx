"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { MathText } from "@/components/math-text";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type ConceptItem = {
  code: string;
  day: number;
  subject: string;
  subject_label: string;
  chapter: string;
  chapter_order: number;
  order: number;
  prompt: string;
  card: {
    title: string;
    formula: string | null;
    explanation: string;
    application: string;
    caution: string;
  };
  response: "know" | "unsure" | "dont_know" | null;
  final_status: "understood_after_card" | "still_dont_know" | null;
  completed: boolean;
};

type ChapterSummary = {
  subject_label: string;
  chapter: string;
  total: number;
  completed: number;
  progress_rate: number;
};

type ConceptRecall = {
  assignment_id: number;
  student_id: number;
  day_number: number;
  title: string;
  current_index: number;
  summary: {
    total: number;
    completed: number;
    remaining: number;
    progress_rate: number;
    counts: {
      know: number;
      unsure: number;
      dont_know: number;
      understood_after_card: number;
      still_dont_know: number;
    };
    chapters: ChapterSummary[];
  };
  items: ConceptItem[];
};

function statusText(item: ConceptItem) {
  if (item.response === "know") return "알아요";
  if (item.final_status === "understood_after_card") return "카드 보고 이해";
  if (item.final_status === "still_dont_know") return "질문 필요";
  if (item.response === "unsure") return "애매해요";
  if (item.response === "dont_know") return "모르겠어요";
  return "미완료";
}

function ConceptRecallContent() {
  const router = useRouter();
  const params = useSearchParams();
  const assignmentId = Number(params.get("assignment_id") || 0);
  const dayNumber = Number(params.get("day") || 1);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [data, setData] = useState<ConceptRecall | null>(null);
  const [index, setIndex] = useState(0);
  const [showCard, setShowCard] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<string>("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (sid: number) => {
    const result = await apiFetch<ConceptRecall>(
      `/student/suteuk-challenge/assignments/${assignmentId}/concept-recall?student_id=${sid}&day_number=${dayNumber}`,
    );
    setData(result);
    setIndex(result.current_index);
    const current = result.items[result.current_index];
    setShowCard(Boolean(current && !current.completed && current.response && current.response !== "know"));
  };

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    if (!assignmentId) {
      setError("챌린지 배정 정보를 찾을 수 없습니다.");
      return;
    }
    setStudentId(student.id);
    void load(student.id).catch((reason) => setError(reason instanceof Error ? reason.message : "개념 체크를 불러오지 못했습니다."));
  }, [assignmentId, dayNumber, router]);

  const item = data?.items[index] ?? null;
  const filteredIndexes = useMemo(() => {
    if (!data) return [];
    return data.items
      .map((concept, conceptIndex) => ({ concept, conceptIndex }))
      .filter(({ concept }) => selectedChapter === "all" || concept.chapter === selectedChapter)
      .map(({ conceptIndex }) => conceptIndex);
  }, [data, selectedChapter]);

  const save = async (body: Record<string, unknown>) => {
    if (!studentId || !data || !item) return;
    setSaving(true);
    setError("");
    try {
      const updated = await apiFetch<ConceptRecall>("/student/suteuk-challenge/concept-progress", {
        method: "PATCH",
        body: {
          student_id: studentId,
          assignment_id: data.assignment_id,
          concept_code: item.code,
          ...body,
        },
      });
      setData(updated);
      if (body.response === "know" || body.final_status) {
        const next = updated.items.findIndex((concept) => !concept.completed);
        setIndex(next >= 0 ? next : Math.max(0, updated.items.length - 1));
        setShowCard(false);
      } else {
        setShowCard(true);
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "응답을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const done = data && data.summary.completed === data.summary.total;

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[#FFF7F7] px-5 pb-28 pt-7">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#E13D3D]">DAY {dayNumber} · 개념 떠올리기</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#17213B]">STEP 0</h1>
          </div>
          <Link href={`/student/suteuk-challenge?day=${dayNumber}`} className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#17213B] shadow-sm">
            오늘 할 일
          </Link>
        </header>

        {error ? <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p> : null}

        {!data || !item ? (
          <div className="rounded-[28px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3]">개념 체크를 준비하는 중입니다.</div>
        ) : done ? (
          <section className="rounded-[28px] bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-[#17213B]">개념 체크 완료</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-[#FFF7F7] p-4"><p className="text-sm font-bold text-[#98A2B3]">알아요</p><p className="mt-1 text-3xl font-black text-[#E13D3D]">{data.summary.counts.know}</p></div>
              <div className="rounded-2xl bg-[#FFF7F7] p-4"><p className="text-sm font-bold text-[#98A2B3]">카드 보고 이해</p><p className="mt-1 text-3xl font-black text-[#E13D3D]">{data.summary.counts.understood_after_card}</p></div>
              <div className="rounded-2xl bg-[#FFF7F7] p-4"><p className="text-sm font-bold text-[#98A2B3]">아직 어려움</p><p className="mt-1 text-3xl font-black text-[#E13D3D]">{data.summary.counts.still_dont_know}</p></div>
            </div>
            {data.items.filter((concept) => concept.final_status === "still_dont_know").length > 0 ? (
              <div className="mt-5">
                <h3 className="text-lg font-black text-[#17213B]">선생님께 질문이 필요한 개념</h3>
                <div className="mt-3 space-y-2">
                  {data.items.filter((concept) => concept.final_status === "still_dont_know").map((concept) => (
                    <div key={concept.code} className="rounded-2xl bg-[#F8FAFC] px-4 py-3 text-sm font-bold text-[#475467]">
                      {concept.subject_label} · {concept.chapter} · <MathText text={concept.card.title} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <section className="mb-4 rounded-[28px] bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-[#E13D3D]">전체 {data.summary.completed} / {data.summary.total}</p>
                  <h2 className="mt-1 text-xl font-black text-[#17213B]">{item.subject_label} · {item.chapter}</h2>
                </div>
                <p className="text-2xl font-black text-[#E13D3D]">{index + 1} / {data.summary.total}</p>
              </div>
              <div className="mt-4 h-3 rounded-full bg-[#FFE3E3]">
                <div className="h-full rounded-full bg-[#FF5A5F]" style={{ width: `${data.summary.progress_rate}%` }} />
              </div>
            </section>

            <section className="mb-4 flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedChapter("all")}
                className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black ${selectedChapter === "all" ? "bg-[#17213B] text-white" : "bg-white text-[#17213B]"}`}
              >
                전체
              </button>
              {data.summary.chapters.map((chapter) => (
                <button
                  key={chapter.chapter}
                  onClick={() => {
                    setSelectedChapter(chapter.chapter);
                    const target = data.items.findIndex((concept) => concept.chapter === chapter.chapter && !concept.completed);
                    if (target >= 0) setIndex(target);
                  }}
                  className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black ${selectedChapter === chapter.chapter ? "bg-[#17213B] text-white" : "bg-white text-[#17213B]"}`}
                >
                  {chapter.chapter} {chapter.completed}/{chapter.total}
                </button>
              ))}
            </section>

            <section className="rounded-[30px] bg-white p-6 shadow-[0_16px_36px_rgba(225,61,61,0.12)]">
              <p className="text-sm font-black text-[#E13D3D]"><MathText text={item.card.title} /></p>
              <h2 className="mt-3 break-keep text-2xl font-black leading-snug text-[#17213B]"><MathText text={item.prompt} /></h2>

              {!showCard ? (
                <div className="mt-6 grid gap-3">
                  <button disabled={saving} onClick={() => save({ response: "know" })} className="h-14 rounded-2xl bg-[#E13D3D] px-5 text-base font-black text-white">알아요</button>
                  <button disabled={saving} onClick={() => save({ response: "unsure" })} className="h-14 rounded-2xl bg-[#FFF0F0] px-5 text-base font-black text-[#E13D3D]">애매해요</button>
                  <button disabled={saving} onClick={() => save({ response: "dont_know" })} className="h-14 rounded-2xl bg-[#F8FAFC] px-5 text-base font-black text-[#475467]">모르겠어요</button>
                </div>
              ) : (
                <div className="mt-6 rounded-[24px] border border-[#F1DADA] bg-[#FFF7F7] p-5">
                  <h3 className="text-xl font-black text-[#17213B]"><MathText text={item.card.title} /></h3>
                  {item.card.formula ? <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-lg font-black text-[#E13D3D]"><MathText text={item.card.formula} /></p> : null}
                  <p className="mt-4 break-keep text-sm font-bold leading-6 text-[#475467]"><MathText text={item.card.explanation} /></p>
                  <p className="mt-3 break-keep text-sm font-bold leading-6 text-[#475467]"><MathText text={item.card.application} /></p>
                  <p className="mt-3 break-keep rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#E13D3D]"><MathText text={item.card.caution} /></p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button disabled={saving} onClick={() => save({ final_status: "understood_after_card" })} className="h-13 rounded-2xl bg-[#E13D3D] px-5 py-4 text-sm font-black text-white">이제 이해했어요</button>
                    <button disabled={saving} onClick={() => save({ final_status: "still_dont_know" })} className="h-13 rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#E13D3D]">아직 모르겠어요</button>
                  </div>
                  {item.final_status === "still_dont_know" ? (
                    <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#E13D3D]">선생님께 질문이 필요한 개념으로 표시되었어요.</p>
                  ) : null}
                </div>
              )}
            </section>

            <section className="mt-4 grid grid-cols-5 gap-2">
              {filteredIndexes.map((conceptIndex) => {
                const concept = data.items[conceptIndex];
                return (
                  <button
                    key={concept.code}
                    onClick={() => {
                      setIndex(conceptIndex);
                      setShowCard(Boolean(concept.response && concept.response !== "know" && !concept.completed));
                    }}
                    title={statusText(concept)}
                    className={`h-9 rounded-xl text-xs font-black ${conceptIndex === index ? "bg-[#17213B] text-white" : concept.completed ? "bg-[#E13D3D] text-white" : "bg-white text-[#98A2B3]"}`}
                  >
                    {conceptIndex + 1}
                  </button>
                );
              })}
            </section>
          </>
        )}
      </div>
    </ScreenShell>
  );
}

export default function StudentConceptRecallPage() {
  return (
    <Suspense fallback={<ScreenShell withBottomNav><div className="p-8 text-center font-bold text-[#98A2B3]">개념 체크를 불러오는 중입니다.</div></ScreenShell>}>
      <ConceptRecallContent />
    </Suspense>
  );
}
