"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { StudentTextbook } from "@/lib/types";
import { TextbookChecklistPage } from "../textbook-checklist-page";

type TextbookRoutePageProps = {
  params: {
    key: string;
  };
};

function getBackHref(subject: string | null) {
  if (subject === "수1") return "/student/subjects/su1";
  if (subject === "수2") return "/student/subjects/su2";
  if (subject === "확통" || subject === "확률과 통계") return "/student/subjects/probability";
  return "/student/subjects";
}

export default function StudentTextbookDynamicPage({ params }: TextbookRoutePageProps) {
  const [textbook, setTextbook] = useState<StudentTextbook | null>(null);

  useEffect(() => {
    const loadTextbook = async () => {
      try {
        const data = await apiFetch<StudentTextbook>(`/student/textbooks/${params.key}`);
        setTextbook(data);
      } catch {
        setTextbook(null);
      }
    };

    void loadTextbook();
  }, [params.key]);

  return (
    <TextbookChecklistPage
      backHref={getBackHref(textbook?.subject ?? null)}
      endNumber={1}
      progressKey={params.key}
      startNumber={1}
      title={textbook?.full_title ?? "교재 체크리스트"}
    />
  );
}
