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

type TextbookCard = {
  title: string;
  detail: string;
  href?: string;
};

type TextbookSelectionPageProps = {
  title: string;
  subjectQueryValues: string[];
  deepLearningEmptyMessage?: string;
  protocolEmptyMessage?: string;
};

function PlaceholderCard({ detail, href, title }: TextbookCard) {
  const content = (
    <article className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug text-gray-900">{title}</h3>
          <p className="mt-1 text-sm font-medium text-gray-500">{detail}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-bold text-[#3730A3]">
          {href ? "열기" : "준비중"}
        </span>
      </div>
    </article>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {content}
    </Link>
  );
}

function TextbookSection({
  emptyMessage,
  errorMessage,
  items,
  loading,
  title,
}: {
  emptyMessage?: string;
  errorMessage?: string;
  items: TextbookCard[];
  loading?: boolean;
  title: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-gray-900">{title}</h2>
      {loading ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-center text-sm font-medium text-gray-400">
          불러오는 중...
        </div>
      ) : errorMessage ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center text-sm font-medium text-red-500">
          {errorMessage}
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <PlaceholderCard
              detail={item.detail}
              href={item.href}
              key={item.title}
              title={item.title}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-center text-sm font-medium text-gray-400">
          {emptyMessage}
        </div>
      )}
    </section>
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
    if (!getStudent()) {
      router.push("/login");
      return;
    }

    const loadTextbooks = async () => {
      setLoading(true);
      setLoadError("");

      try {
        let textbooks: StudentTextbook[] = [];

        for (const subjectValue of subjectQueryValues) {
          const data = await apiFetch<StudentTextbookListResponse>(
            `/student/textbooks/by-subject/${encodeURIComponent(subjectValue)}`
          );
          textbooks = data.textbooks.filter(
            (textbook) => textbook.is_active && textbook.is_published
          );
          if (textbooks.length > 0) {
            break;
          }
        }

        setDeepLearningBooks(
          textbooks.map((textbook) => ({
            title: textbook.full_title,
            detail: `${textbook.item_count}문항`,
            href: textbook.textbook_key
              ? `/student/textbooks/${textbook.textbook_key}`
              : undefined,
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
        backHref="/student"
        logoutType="student"
        subtitle="교재를 선택하고 문제별 진도를 체크해요."
        title={title}
      />

      <TextbookSection
        emptyMessage={deepLearningEmptyMessage}
        errorMessage={loadError}
        items={deepLearningBooks}
        loading={loading}
        title="딥러닝 Deep Learning"
      />

      <TextbookSection emptyMessage={protocolEmptyMessage} items={[]} title="프로토콜 Protocol" />

      <StudentBottomNav />
    </ScreenShell>
  );
}
