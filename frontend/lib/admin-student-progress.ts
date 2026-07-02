import { apiFetch } from "@/lib/api";
import { StudentCardSubjectProgress, StudentDashboardProgressSummary } from "@/lib/types";

export type AdminStudentCardProgress = {
  progressPercentage: number;
  subjects: StudentCardSubjectProgress[];
};

const subjectOrder: Record<string, number> = {
  "수1": 1,
  "수2": 2,
  "확률과 통계": 3,
};

export async function loadAdminStudentCardProgress(
  studentIds: number[]
): Promise<Record<number, AdminStudentCardProgress>> {
  const entries = await Promise.all(
    studentIds.map(async (studentId) => {
      try {
        const summary = await apiFetch<StudentDashboardProgressSummary>(
          `/student/progress-summary?student_id=${studentId}`
        );

        return [
          studentId,
          {
            progressPercentage: summary.overall.progress_rate ?? 0,
            subjects: summary.subjects.map((subject, index) => ({
              id: subjectOrder[subject.subject] ?? index + 1,
              name: subject.subject,
              progressPercentage: subject.progress_rate ?? 0,
            })),
          },
        ] as const;
      } catch {
        return [
          studentId,
          {
            progressPercentage: 0,
            subjects: [],
          },
        ] as const;
      }
    })
  );

  return Object.fromEntries(entries);
}
