"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SprintExamAnalysisView } from "@/components/sprint-exam-analysis-view";
import { getAdmin } from "@/lib/storage";

export default function AdminStudentSprintExamAnalysisPage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
    }
  }, [router]);

  return (
    <SprintExamAnalysisView
      endpoint={`/admin/students/${params.studentId}/sprint-exam-v2/analysis`}
      backHref={`/admin/students/${params.studentId}`}
      emptyMessage="분석할 수 있는 모의고사 결과가 아직 없습니다."
    />
  );
}
