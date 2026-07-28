"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
import { StudentTextbook, StudentTextbookListResponse } from "@/lib/types";

type TextbookProgressBrief = {
  summary: { total: number; done: number };
};

function TextbookCardItem({
  done,
  href,
  itemCount,
  title,
  total,
}: {
  done?: number;
  href?: string;
  itemCount: number;
  title: string;
  total?: number;
}) {
  const progressRate = total && total > 0 ? Math.round(((done ?? 0) / total) * 100) : undefined;

  const content = (
    <article className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold leading-snug text-[#17213B]">{title}</h3>
          <p className="mt-0.5 text-xs font-medium text-gray-400">{itemCount}문항</p>
          {progressRate !== undefined ? (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-orange-50">
                <div
                  className="h-full rounded-full bg-orange-400 transition-all duration-500"
                  style={{ width: `${progressRate}%` }}
                />
              </div>
              <p className="mt-1 text-right text-xs font-bold text-orange-400">{progressRate}%</p>
            </div>
          ) : null}
        </div>
        <span className="shrink-0 rounded-2xl bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-500">
          {href ? "열기" : "준비중"}
        </span>
      </div>
    </article>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {content}
    </Link>
  );
}

export default function StudentMockExamTextbooksPage() {
  const router = useRouter();
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, { done: number; total: number }>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("전체");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    const studentId = student.id;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const data = await apiFetch<StudentTextbookListResponse>(
          `/student/textbooks/mock-exams?student_id=${studentId}`
        );
        const visible = data.textbooks.filter((t) => t.is_active && t.is_published);
        setTextbooks(visible);

        const map: Record<string, { done: number; total: number }> = {};
        await Promise.all(
          visible
            .filter((t) => t.textbook_key)
            .map(async (t) => {
              try {
                const prog = await apiFetch<TextbookProgressBrief>(
                  `/student/textbook-progress/${t.textbook_key}?student_id=${studentId}`
                );
                map[t.textbook_key] = { done: prog.summary.done, total: prog.summary.total };
              } catch {
                // silently skip if progress unavailable
              }
            })
        );
        setProgressMap(map);
      } catch {
        setLoadError("교재 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  // 관리자가 저장한 시리즈명을 그대로, 등장 순서대로 중복 제거해서 노출한다(하드코딩 금지).
  const seriesOptions = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const textbook of textbooks) {
      if (textbook.series_name && !seen.has(textbook.series_name)) {
        seen.add(textbook.series_name);
        names.push(textbook.series_name);
      }
    }
    return ["전체", ...names];
  }, [textbooks]);

  const filteredTextbooks = useMemo(
    () => (seriesFilter === "전체" ? textbooks : textbooks.filter((t) => t.series_name === seriesFilter)),
    [textbooks, seriesFilter]
  );

  return (
    <ScreenShell withBottomNav>
      <Header
        backHref="/student/subjects"
        logoutType="student"
        subtitle="시리즈를 선택하고 모의고사 교재 진도를 체크해요."
        title="모의고사"
      />

      {seriesOptions.length > 1 && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {seriesOptions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setSeriesFilter(name)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition ${
                seriesFilter === name ? "bg-orange-400 text-white" : "bg-orange-50 text-orange-500"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <section>
        {loading ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-center text-sm font-medium text-gray-400">
            불러오는 중...
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center text-sm font-medium text-red-500">
            {loadError}
          </div>
        ) : filteredTextbooks.length > 0 ? (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
            {filteredTextbooks.map((textbook) => (
              <TextbookCardItem
                key={textbook.id}
                done={textbook.textbook_key ? progressMap[textbook.textbook_key]?.done : undefined}
                href={textbook.textbook_key ? `/student/textbooks/${textbook.textbook_key}` : undefined}
                itemCount={textbook.item_count}
                title={textbook.full_title}
                total={textbook.textbook_key ? progressMap[textbook.textbook_key]?.total : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-center text-sm font-medium text-gray-400">
            아직 등록된 모의고사 교재가 없습니다.
          </div>
        )}
      </section>

      <StudentBottomNav />
    </ScreenShell>
  );
}
