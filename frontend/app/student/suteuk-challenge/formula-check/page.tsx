"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { MathText } from "@/components/math-text";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type FormulaQuestion = {
  code: string;
  day: number;
  subject: string;
  chapter: string;
  concept_code: string | null;
  type: "multiple_choice" | "true_false" | "situation_choice";
  prompt: string;
  choices: string[];
  answer_index: number | null;
  explanation: string;
  selected_answer: number | null;
  is_correct: boolean | null;
  concept_status: {
    response: string | null;
    final_status: string | null;
    completed: boolean;
  } | null;
};

type FormulaQuiz = {
  assignment_id: number;
  student_id: number;
  day_number: number;
  title: string;
  expected_total: number;
  current_index: number;
  summary: {
    expected_total: number;
    total: number;
    answered: number;
    correct: number;
    incorrect: number;
    score_rate: number;
    completed: boolean;
    wrong_concepts: {
      question_code: string;
      concept_code: string;
      subject: string;
      chapter: string;
      prompt: string;
      explanation: string;
    }[];
  };
  items: FormulaQuestion[];
};

function choicePrefix(index: number) {
  return ["①", "②", "③", "④", "⑤"][index] ?? `${index + 1}.`;
}

function FormulaCheckContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [data, setData] = useState<FormulaQuiz | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const assignmentId = Number(params.get("assignment_id") || 0);
  const dayNumber = Number(params.get("day") || 1);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    const load = async () => {
      const result = await apiFetch<FormulaQuiz>(
        `/student/suteuk-challenge/assignments/${assignmentId}/formula-check?student_id=${student.id}&day_number=${dayNumber}`,
      );
      setData(result);
      setIndex(result.current_index);
    };
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "공식 CHECK를 불러오지 못했습니다."));
  }, [assignmentId, dayNumber, router]);

  const current = data?.items[index] ?? null;
  const completed = Boolean(data?.summary.completed);
  const wrongItems = useMemo(() => data?.items.filter((item) => item.is_correct === false) ?? [], [data]);

  const answer = async (selected: number) => {
    if (!data || !current || !studentId) return;
    setSaving(true);
    setError("");
    try {
      const updated = await apiFetch<FormulaQuiz>("/student/suteuk-challenge/formula-check/answers", {
        method: "PATCH",
        body: {
          student_id: studentId,
          assignment_id: data.assignment_id,
          question_code: current.code,
          selected_answer: selected,
        },
      });
      setData(updated);
      const updatedIndex = updated.items.findIndex((item) => item.code === current.code);
      if (updatedIndex >= 0) setIndex(updatedIndex);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "응답을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (!data) return;
    const next = data.items.findIndex((item, itemIndex) => itemIndex > index && item.selected_answer === null);
    if (next >= 0) {
      setIndex(next);
      return;
    }
    setIndex(Math.min(index + 1, data.items.length - 1));
  };

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[#F7FAFF] px-5 pb-28 pt-7">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#E13D3D]">DAY {dayNumber} · 공식 CHECK</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-[#17213B]">
              {data ? `${Math.min(index + 1, data.items.length)} / ${data.items.length || data.expected_total}` : "- / -"}
            </h1>
          </div>
          <Link href={`/student/suteuk-challenge?day=${dayNumber}`} className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#17213B] shadow-sm">
            체크리스트
          </Link>
        </header>

        {error ? <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p> : null}

        {!data || !current ? (
          <div className="rounded-[28px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3]">공식 CHECK 정보를 기다리는 중입니다.</div>
        ) : completed ? (
          <section className="rounded-[28px] bg-white p-6 shadow-sm">
            <p className="text-sm font-black text-[#E13D3D]">공식 CHECK 완료</p>
            <h2 className="mt-2 text-3xl font-black text-[#17213B]">{data.summary.correct} / {data.summary.total}</h2>
            <p className="mt-1 text-lg font-black text-[#17213B]">{data.summary.score_rate}%</p>
            {wrongItems.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-base font-black text-[#17213B]">다시 볼 개념</h3>
                <div className="mt-3 space-y-2">
                  {wrongItems.map((item) => (
                    <div key={item.code} className="rounded-2xl bg-[#F8FAFC] px-4 py-3">
                      <p className="text-sm font-black text-[#17213B]">{item.chapter}</p>
                      <p className="mt-1 text-sm font-semibold text-[#667085]"><MathText text={item.prompt} /></p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <section className="rounded-[28px] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-full bg-[#FFF0F0] px-3 py-1 text-xs font-black text-[#E13D3D]">{current.chapter}</span>
                <span className="text-xs font-black text-[#98A2B3]">{data.summary.answered} / {data.summary.total} 응답</span>
              </div>
              <div className="text-xl font-black leading-8 text-[#17213B]">
                <MathText text={current.prompt} />
              </div>
              <div className="mt-5 space-y-3">
                {current.choices.map((choice, choiceIndex) => {
                  const selected = current.selected_answer === choiceIndex;
                  const answered = current.selected_answer !== null;
                  const correct = current.answer_index === choiceIndex;
                  return (
                    <button
                      key={`${current.code}-${choiceIndex}`}
                      type="button"
                      disabled={saving || answered}
                      onClick={() => answer(choiceIndex)}
                      className={`flex w-full items-center gap-3 rounded-[22px] border px-4 py-4 text-left text-base font-black transition ${
                        answered && correct
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : selected
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-[#E5EAF2] bg-white text-[#17213B] hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <span className="shrink-0 text-lg">{choicePrefix(choiceIndex)}</span>
                      <MathText text={choice} />
                    </button>
                  );
                })}
              </div>
            </section>

            {current.selected_answer !== null ? (
              <section className={`mt-4 rounded-[24px] p-5 ${current.is_correct ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                <p className="text-lg font-black">{current.is_correct ? "정답이에요." : "다시 확인할 개념"}</p>
                {!current.is_correct && current.answer_index !== null ? (
                  <p className="mt-2 text-sm font-bold">
                    정답: {choicePrefix(current.answer_index)} <MathText text={current.choices[current.answer_index]} />
                  </p>
                ) : null}
                <p className="mt-3 text-sm font-bold leading-6"><MathText text={current.explanation} /></p>
                <button onClick={goNext} className="mt-4 h-11 w-full rounded-2xl bg-[#17213B] text-sm font-black text-white">
                  다음 문제
                </button>
              </section>
            ) : null}
          </>
        )}
      </div>
    </ScreenShell>
  );
}

export default function FormulaCheckPage() {
  return (
    <Suspense fallback={<ScreenShell withBottomNav><div className="p-8 text-center font-bold text-[#98A2B3]">공식 CHECK를 불러오는 중입니다.</div></ScreenShell>}>
      <FormulaCheckContent />
    </Suspense>
  );
}
