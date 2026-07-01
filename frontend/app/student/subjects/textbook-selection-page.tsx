"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { getStudent } from "@/lib/storage";

type TextbookCard = {
  title: string;
  detail: string;
  href?: string;
};

type TextbookSelectionPageProps = {
  title: string;
  deepLearningBooks: TextbookCard[];
  protocolBooks: TextbookCard[];
  deepLearningEmptyMessage?: string;
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
  items,
  title,
}: {
  emptyMessage?: string;
  items: TextbookCard[];
  title: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-gray-900">{title}</h2>
      {items.length > 0 ? (
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
  deepLearningBooks,
  deepLearningEmptyMessage,
  protocolBooks,
  title,
}: TextbookSelectionPageProps) {
  const router = useRouter();

  useEffect(() => {
    if (!getStudent()) {
      router.push("/login");
    }
  }, [router]);

  return (
    <ScreenShell withBottomNav>
      <Header
        backHref="/student"
        logoutType="student"
        subtitle="교재 선택 기능은 준비 중입니다."
        title={title}
      />

      <TextbookSection
        emptyMessage={deepLearningEmptyMessage}
        items={deepLearningBooks}
        title="딥러닝 Deep Learning"
      />

      <TextbookSection items={protocolBooks} title="프로토콜 Protocol" />

      <StudentBottomNav />
    </ScreenShell>
  );
}
