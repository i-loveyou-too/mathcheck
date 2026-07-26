"use client";

import { useParams } from "next/navigation";
import { ExamEditor } from "../_components/exam-editor";

export default function AdminSprintExamV2NewPage() {
  const params = useParams<{ id: string }>();
  return <ExamEditor sprintId={Number(params.id)} />;
}
