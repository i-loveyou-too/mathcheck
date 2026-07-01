"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { cn } from "@/lib/utils";
import { getStudent } from "@/lib/storage";

type ProblemStatus = "not-started" | "question" | "done";

type TextbookChecklistPageProps = {
  title: string;
  backHref: string;
  startNumber: number;
  endNumber: number;
};

const statusOptions: { label: string; value: ProblemStatus }[] = [
  { label: "아직 안함", value: "not-started" },
  { label: "△", value: "question" },
  { label: "○", value: "done" },
];

const statusStyles: Record<
  ProblemStatus,
  {
    card: string;
    label: string;
    selectedButton: string;
    idleButton: string;
  }
> = {
  "not-started": {
    card: "bg-gray-100 text-gray-600",
    label: "text-gray-400",
    selectedButton: "bg-gray-700 text-white shadow-sm",
    idleButton: "bg-gray-100 text-gray-400 hover:bg-gray-200",
  },
  question: {
    card: "bg-amber-100 text-amber-700",
    label: "text-amber-600",
    selectedButton: "bg-amber-400 text-amber-950 shadow-sm",
    idleButton: "bg-amber-50 text-amber-500 hover:bg-amber-100",
  },
  done: {
    card: "bg-emerald-100 text-emerald-700",
    label: "text-emerald-600",
    selectedButton: "bg-emerald-500 text-white shadow-sm",
    idleButton: "bg-emerald-50 text-emerald-500 hover:bg-emerald-100",
  },
};

function getStatusLabel(status: ProblemStatus) {
  if (status === "done") return "완료";
  if (status === "question") return "질문";
  return "아직 안함";
}

export function TextbookChecklistPage({
  backHref,
  endNumber,
  startNumber,
  title,
}: TextbookChecklistPageProps) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<number, ProblemStatus>>({});

  useEffect(() => {
    if (!getStudent()) {
      router.push("/login");
    }
  }, [router]);

  const problemNumbers = useMemo(
    () => Array.from({ length: endNumber - startNumber + 1 }, (_, index) => startNumber + index),
    [endNumber, startNumber]
  );

  const summary = useMemo(() => {
    const total = problemNumbers.length;
    const done = problemNumbers.filter((number) => statuses[number] === "done").length;
    const question = problemNumbers.filter((number) => statuses[number] === "question").length;

    return {
      total,
      done,
      question,
      notStarted: total - done - question,
    };
  }, [problemNumbers, statuses]);

  const handleStatusChange = (problemNumber: number, status: ProblemStatus) => {
    setStatuses((current) => ({
      ...current,
      [problemNumber]: status,
    }));
  };

  return (
    <ScreenShell withBottomNav>
      <Header
        backHref={backHref}
        logoutType="student"
        subtitle="문제별 체크는 이 화면에서만 임시로 반영됩니다."
        title={title}
      />

      <section className="rounded-3xl bg-[#0F172A] p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/40">진도 요약</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs text-white/50">전체</p>
            <p className="mt-1 text-2xl font-black">{summary.total}문항</p>
          </div>
          <div className={cn("rounded-2xl p-3", statusStyles.done.card)}>
            <p className="text-xs">○ 완료</p>
            <p className="mt-1 text-2xl font-black">{summary.done}개</p>
          </div>
          <div className={cn("rounded-2xl p-3", statusStyles.question.card)}>
            <p className="text-xs">△ 질문</p>
            <p className="mt-1 text-2xl font-black">{summary.question}개</p>
          </div>
          <div className={cn("rounded-2xl p-3", statusStyles["not-started"].card)}>
            <p className="text-xs">아직 안함</p>
            <p className="mt-1 text-2xl font-black">{summary.notStarted}개</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-gray-900">문제 목록</h2>
        <div className="space-y-3">
          {problemNumbers.map((problemNumber) => {
            const selectedStatus = statuses[problemNumber] ?? "not-started";

            return (
              <article className="rounded-2xl bg-white p-4 shadow-card" key={problemNumber}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{problemNumber}번</h3>
                    <p
                      className={cn(
                        "mt-1 text-xs font-semibold",
                        statusStyles[selectedStatus].label
                      )}
                    >
                      {getStatusLabel(selectedStatus)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {statusOptions.map((option) => {
                      const isSelected = selectedStatus === option.value;

                      return (
                        <button
                          className={cn(
                            "h-9 min-w-16 rounded-full px-3 text-xs font-bold transition",
                            isSelected
                              ? statusStyles[option.value].selectedButton
                              : statusStyles[option.value].idleButton
                          )}
                          key={option.value}
                          onClick={() => handleStatusChange(problemNumber, option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <StudentBottomNav />
    </ScreenShell>
  );
}
