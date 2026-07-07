"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getStudent } from "@/lib/storage";
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
  if (subject === "확률과 통계") return "/student/subjects/probability";
  return "/student/subjects";
}

export default function StudentTextbookDynamicPage({ params }: TextbookRoutePageProps) {
  const router = useRouter();
  const [textbook, setTextbook] = useState<StudentTextbook | null>(null);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }

    const loadTextbook = async () => {
      try {
        const data = await apiFetch<StudentTextbook>(
          `/student/textbooks/${params.key}?student_id=${student.id}`
        );
        setTextbook(data);
      } catch {
        setTextbook(null);
      }
    };

    void loadTextbook();
  }, [params.key, router]);

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
