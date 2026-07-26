"use client";

import { useParams } from "next/navigation";
import { ExamEditor } from "../../_components/exam-editor";

export default function AdminSprintExamV2EditPage() {
  const params = useParams<{ id: string; examId: string }>();
  return <ExamEditor sprintId={Number(params.id)} examId={Number(params.examId)} />;
}
