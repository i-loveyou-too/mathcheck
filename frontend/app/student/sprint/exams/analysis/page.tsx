"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SprintExamAnalysisView } from "@/components/sprint-exam-analysis-view";
import { getStudent } from "@/lib/storage";

export default function StudentSprintExamAnalysisPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getStudent()) {
      router.push("/login");
    }
  }, [router]);

  return (
    <SprintExamAnalysisView
      endpoint="/student/sprint-exam-v2/analysis"
      backHref="/student/sprint/exams"
      emptyMessage="분석할 수 있는 공개된 모의고사 결과가 아직 없습니다."
    />
  );
}
