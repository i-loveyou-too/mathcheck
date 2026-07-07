"use client";

import { useEffect, useState } from "react";
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

type TextbookCard = {
  title: string;
  itemCount: number;
  href?: string;
  textbookKey?: string | null;
  done?: number;
  total?: number;
};

type TextbookSelectionPageProps = {
  title: string;
  subjectQueryValues: string[];
  deepLearningEmptyMessage?: string;
  protocolEmptyMessage?: string;
};

function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20 3H4v7h16V3zm-2 5H6V5h12v3zM4 14h16v7H4v-7zm2 3h12v2H6v-2z" />
    </svg>
  );
}

function TextbookCardItem({ done, href, itemCount, textbookKey, title, total }: TextbookCard) {
  const progressRate =
    total && total > 0 ? Math.round((done ?? 0) / total * 100) : undefined;

  const content = (
    <article className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold leading-snug text-[#17213B]">{title}</h3>
          <p className="mt-0.5 text-xs font-medium text-gray-400">{itemCount}문항</p>
          {progressRate !== undefined ? (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-indigo-50">
                <div
                  className="h-full rounded-full bg-indigo-400 transition-all duration-500"
                  style={{ width: `${progressRate}%` }}
                />
              </div>
              <p className="mt-1 text-right text-xs font-bold text-indigo-400">{progressRate}%</p>
            </div>
          ) : null}
        </div>
        <span className="shrink-0 rounded-2xl bg-[#EEF2FF] px-3 py-1.5 text-xs font-bold text-indigo-500">
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

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      {icon}
      <h2 className="text-base font-black text-[#17213B]">{title}</h2>
    </div>
  );
}

export function TextbookSelectionPage({
  deepLearningEmptyMessage,
  protocolEmptyMessage = "아직 공개된 프로토콜 교재가 없습니다.",
  subjectQueryValues,
  title,
}: TextbookSelectionPageProps) {
  const router = useRouter();
  const [deepLearningBooks, setDeepLearningBooks] = useState<TextbookCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    const studentId = student.id;

    const loadTextbooks = async () => {
      setLoading(true);
      setLoadError("");

      try {
        let textbooks: StudentTextbook[] = [];

        for (const subjectValue of subjectQueryValues) {
          const data = await apiFetch<StudentTextbookListResponse>(
            `/student/textbooks/by-subject/${encodeURIComponent(subjectValue)}?student_id=${studentId}`
          );
          textbooks = data.textbooks.filter(
            (textbook) => textbook.is_active && textbook.is_published
          );
          if (textbooks.length > 0) {
            break;
          }
        }

        const progressMap: Record<string, { done: number; total: number }> = {};
        await Promise.all(
          textbooks
            .filter((t) => t.textbook_key)
            .map(async (t) => {
              try {
                const prog = await apiFetch<TextbookProgressBrief>(
                  `/student/textbook-progress/${t.textbook_key}?student_id=${studentId}`
                );
                progressMap[t.textbook_key] = {
                  done: prog.summary.done,
                  total: prog.summary.total,
                };
              } catch {
                // silently skip if progress unavailable
              }
            })
        );

        setDeepLearningBooks(
          textbooks.map((textbook) => ({
            title: textbook.full_title,
            itemCount: textbook.item_count,
            href: textbook.textbook_key
              ? `/student/textbooks/${textbook.textbook_key}`
              : undefined,
            textbookKey: textbook.textbook_key,
            done: progressMap[textbook.textbook_key]?.done,
            total: progressMap[textbook.textbook_key]?.total,
          }))
        );
      } catch {
        setLoadError("교재 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void loadTextbooks();
  }, [router, subjectQueryValues]);

  return (
    <ScreenShell withBottomNav>
      <Header
        backHref="/student/subjects"
        logoutType="student"
        subtitle="교재를 선택하고 문제별 진도를 체크해요."
        title={title}
      />

      <section>
        <SectionHeader
          icon={
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100">
              <BookIcon className="h-5 w-5 text-indigo-500" />
            </div>
          }
          title="딥러닝 Deep Learning"
        />
        {loading ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-center text-sm font-medium text-gray-400">
            불러오는 중...
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center text-sm font-medium text-red-500">
            {loadError}
          </div>
        ) : deepLearningBooks.length > 0 ? (
          <div className="space-y-3">
            {deepLearningBooks.map((book) => (
              <TextbookCardItem
                done={book.done}
                href={book.href}
                itemCount={book.itemCount}
                key={book.title}
                textbookKey={book.textbookKey}
                title={book.title}
                total={book.total}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-center text-sm font-medium text-gray-400">
            {deepLearningEmptyMessage}
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          icon={
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
              <ServerIcon className="h-5 w-5 text-emerald-500" />
            </div>
          }
          title="프로토콜 Protocol"
        />
        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-gray-300">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-300">{protocolEmptyMessage}</p>
        </div>
      </section>

      <StudentBottomNav />
    </ScreenShell>
  );
}
