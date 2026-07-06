"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { ApiError, apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { cn } from "@/lib/utils";

type ProblemStatus = "not-started" | "question" | "done";
type ApiProblemStatus = "not_started" | "partial" | "done";

type ChecklistItem = {
  id?: number;
  itemNumber: number;
  title: string;
  status: ProblemStatus;
};

type TextbookProgressResponse = {
  textbook: {
    id: number;
    key: string;
    subject: string | null;
    title: string;
    full_title: string;
    problem_count: number;
  };
  summary: {
    total: number;
    done: number;
    partial: number;
    not_started: number;
  };
  items: {
    id: number;
    item_number: number;
    title: string;
    status: ApiProblemStatus;
  }[];
};

type StudentItemProgressResponse = {
  student_id: number;
  item_id: number;
  status: ApiProblemStatus;
  updated_at: string;
};

type TextbookChecklistPageProps = {
  title: string;
  backHref: string;
  startNumber: number;
  endNumber: number;
  progressKey?: string;
};

const statusOptions: { label: string; value: ProblemStatus }[] = [
  { label: "아직 안함", value: "not-started" },
  { label: "질문", value: "question" },
  { label: "완료", value: "done" },
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

function toUiStatus(status: ApiProblemStatus): ProblemStatus {
  if (status === "done") return "done";
  if (status === "partial") return "question";
  return "not-started";
}

function toApiStatus(status: ProblemStatus): ApiProblemStatus {
  if (status === "done") return "done";
  if (status === "question") return "partial";
  return "not_started";
}

function getStatusLabel(status: ProblemStatus) {
  if (status === "done") return "완료";
  if (status === "question") return "질문";
  return "아직 안함";
}

export function TextbookChecklistPage({
  backHref,
  endNumber,
  progressKey,
  startNumber,
  title,
}: TextbookChecklistPageProps) {
  const router = useRouter();
  const [studentId, setStudentId] = useState<number | null>(null);
  const [apiTitle, setApiTitle] = useState<string | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [statuses, setStatuses] = useState<Record<number, ProblemStatus>>({});
  const [loading, setLoading] = useState(Boolean(progressKey));
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savingItemId, setSavingItemId] = useState<number | null>(null);

  const isDbBacked = Boolean(progressKey);

  const fetchProgress = useCallback(
    async (nextStudentId: number) => {
      if (!progressKey) return;

      setLoading(true);
      setLoadError("");

      try {
        const data = await apiFetch<TextbookProgressResponse>(
          `/student/textbook-progress/${progressKey}?student_id=${nextStudentId}`
        );

        setApiTitle(data.textbook.full_title);
        setItems(
          data.items.map((item) => ({
            id: item.id,
            itemNumber: item.item_number,
            title: item.title,
            status: toUiStatus(item.status),
          }))
        );
      } catch (err) {
        if (err instanceof ApiError) {
          console.error("[textbook-progress] failed", {
            status: err.status,
            body: err.body,
            progressKey,
          });
        } else {
          console.error("[textbook-progress] failed", err);
        }
        setLoadError("진도 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [progressKey]
  );

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    setStudentId(student.id);

    if (progressKey) {
      void fetchProgress(student.id);
    }
  }, [fetchProgress, progressKey, router]);

  const dummyItems = useMemo<ChecklistItem[]>(
    () =>
      Array.from({ length: endNumber - startNumber + 1 }, (_, index) => {
        const itemNumber = startNumber + index;
        return {
          itemNumber,
          title: `${itemNumber}번`,
          status: statuses[itemNumber] ?? "not-started",
        };
      }),
    [endNumber, startNumber, statuses]
  );

  const visibleItems = isDbBacked ? items : dummyItems;

  const summary = useMemo(() => {
    const total = visibleItems.length;
    const done = visibleItems.filter((item) => item.status === "done").length;
    const question = visibleItems.filter((item) => item.status === "question").length;

    return {
      total,
      done,
      question,
      notStarted: total - done - question,
    };
  }, [visibleItems]);

  const handleStatusChange = async (item: ChecklistItem, status: ProblemStatus) => {
    setSaveError("");

    if (!isDbBacked) {
      setStatuses((current) => ({
        ...current,
        [item.itemNumber]: status,
      }));
      return;
    }

    if (!studentId || !item.id) return;

    const previousItems = items;
    setSavingItemId(item.id);
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id ? { ...currentItem, status } : currentItem
      )
    );

    try {
      await apiFetch<StudentItemProgressResponse>("/student/item-progress", {
        method: "POST",
        body: {
          student_id: studentId,
          item_id: item.id,
          status: toApiStatus(status),
        },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        console.error("[item-progress] save failed", { status: err.status, body: err.body });
      } else {
        console.error("[item-progress] save failed", err);
      }
      setSaveError("저장하지 못했습니다. 다시 시도해주세요.");
      setItems(previousItems);
      await fetchProgress(studentId);
    } finally {
      setSavingItemId(null);
    }
  };

  return (
    <ScreenShell withBottomNav>
      <Header
        backHref={backHref}
        logoutType="student"
        subtitle={
          isDbBacked
            ? "문제별 체크는 교재별로 저장됩니다."
            : "문제별 체크는 이 화면에서만 임시로 반영됩니다."
        }
        title={apiTitle ?? title}
      />

      <section className="rounded-3xl bg-white p-5 shadow-card">
        <h2 className="text-base font-bold text-indigo-500">진도 요약</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#EEF2FF] p-4">
            <p className="text-xl leading-none">📋</p>
            <p className="mt-2 text-xs font-semibold text-indigo-400">전체</p>
            <p className="mt-0.5 text-2xl font-black text-indigo-900">{summary.total}문항</p>
          </div>
          <div className={cn("rounded-2xl p-4", statusStyles.done.card)}>
            <p className="text-xl leading-none">✅</p>
            <p className="mt-2 text-xs font-semibold">완료</p>
            <p className="mt-0.5 text-2xl font-black">{summary.done}개</p>
          </div>
          <div className={cn("rounded-2xl p-4", statusStyles.question.card)}>
            <p className="text-xl leading-none">⚠️</p>
            <p className="mt-2 text-xs font-semibold">질문</p>
            <p className="mt-0.5 text-2xl font-black">{summary.question}개</p>
          </div>
          <div className={cn("rounded-2xl p-4", statusStyles["not-started"].card)}>
            <p className="text-xl leading-none">🕐</p>
            <p className="mt-2 text-xs font-semibold">아직 안함</p>
            <p className="mt-0.5 text-2xl font-black">{summary.notStarted}개</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-gray-900">문제 목록</h2>

        {loading ? <p className="text-sm font-semibold text-gray-400">불러오는 중...</p> : null}
        {loadError ? <p className="text-sm font-semibold text-red-500">{loadError}</p> : null}
        {saveError ? <p className="mb-3 text-sm font-semibold text-red-500">{saveError}</p> : null}

        {!loading && !loadError && visibleItems.length === 0 ? (
          <p className="text-sm font-semibold text-gray-400">표시할 문제가 없습니다.</p>
        ) : null}

        <div className="space-y-3">
          {visibleItems.map((item) => {
            const selectedStatus = item.status;

            return (
              <article className="rounded-2xl bg-white p-4 shadow-card" key={item.id ?? item.itemNumber}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{item.itemNumber}번</h3>
                    {item.title !== `${item.itemNumber}번` ? (
                      <p className="mt-1 text-xs font-medium text-gray-500">{item.title}</p>
                    ) : null}
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
                            "h-9 min-w-16 rounded-full px-3 text-xs font-bold transition disabled:opacity-60",
                            isSelected
                              ? statusStyles[option.value].selectedButton
                              : statusStyles[option.value].idleButton
                          )}
                          disabled={savingItemId === item.id}
                          key={option.value}
                          onClick={() => void handleStatusChange(item, option.value)}
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

      <div className="flex items-start gap-2.5 rounded-2xl bg-indigo-50 px-4 py-3.5">
        <span className="shrink-0 text-base">ℹ️</span>
        <p className="text-xs font-medium leading-relaxed text-indigo-400">
          상태를 변경하면 자동으로 저장돼요.
        </p>
      </div>

      <StudentBottomNav />
    </ScreenShell>
  );
}
