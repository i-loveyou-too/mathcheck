export type GradeDisplayScore = {
  grade: number | null;
  next_grade?: number | null;
  points_to_next_grade?: number | null;
  grade_boundaries?: Array<{ grade: number; score: number; type: string }>;
};

export function hasGradeCut(score: GradeDisplayScore) {
  return Boolean(score.grade_boundaries?.length);
}

export function displayGrade(score: GradeDisplayScore) {
  if (!hasGradeCut(score)) return "등급컷 미등록";
  return score.grade ? `${score.grade}등급` : "등급 미산정";
}

export function canShowNextGrade(score: GradeDisplayScore) {
  if (!hasGradeCut(score)) return false;
  if (score.grade === 1) return true;
  return Boolean(
    score.next_grade
      && score.points_to_next_grade !== null
      && score.points_to_next_grade !== undefined,
  );
}
