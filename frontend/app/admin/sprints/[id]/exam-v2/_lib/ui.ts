import { ApiError } from "@/lib/api";
import type { ExamV2Detail, ExamV2Paper, ExamV2ScoreGroup } from "./types";

export const examStatusLabels: Record<string, string> = {
  draft: "작성 중",
  ready: "배정 가능",
  active: "진행 중",
  closed: "종료",
};

export const assignmentStatusLabels: Record<string, string> = {
  assigned: "미응시",
  in_progress: "응시 중",
  submitted: "제출 완료",
  closed: "종료",
  available: "응시 가능",
  upcoming: "예정",
  completed: "완료",
  expired: "마감",
  started: "응시 중",
  scored: "채점 완료",
  voided: "무효",
};

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR");
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function friendlyApiError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "object" && detail) {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
    if (error.status === 401 || error.status === 403) return "관리자 로그인이 필요합니다.";
    if (error.status === 404) return "요청한 정보를 찾을 수 없습니다.";
    if (error.status === 409) return typeof error.message === "string" && error.message !== "Request failed." ? error.message : "현재 상태에서는 처리할 수 없습니다.";
    if (typeof error.message === "string" && error.message !== "Request failed.") return error.message;
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
  }
  if (error instanceof Error && /NEXT_PUBLIC_API_URL/.test(error.message)) {
    return "API 연결 설정을 확인해주세요.";
  }
  return fallback;
}

export function statusTone(status: string) {
  if (["ready", "available", "assigned"].includes(status)) return "bg-[#E8F2FF] text-[#276ED8]";
  if (["active", "in_progress", "started"].includes(status)) return "bg-[#FFF4D8] text-[#B87300]";
  if (["submitted"].includes(status)) return "bg-[#F0ECFF] text-[#6549BE]";
  if (["scored", "completed", "published"].includes(status)) return "bg-[#E8F7EF] text-[#18845D]";
  if (["closed", "voided", "expired"].includes(status)) return "bg-[#F1F3F6] text-[#667085]";
  return "bg-[#EEF2F6] text-[#5F6C80]";
}

function gradeCutLine(group: ExamV2ScoreGroup) {
  if (!group.grade_cuts.length) return [];
  const byType = new Map<string, typeof group.grade_cuts>();
  group.grade_cuts.forEach((cut) => byType.set(cut.cut_type, [...(byType.get(cut.cut_type) ?? []), cut]));
  return Array.from(byType.entries()).map(([type, cuts]) => {
    const prefix = type === "raw_score_min" ? "등급컷" : `등급컷 ${type}`;
    return `${prefix} ${cuts.sort((a, b) => a.grade - b.grade).map((cut) => `${cut.grade}=${cut.min_score}`).join(", ")}`;
  });
}

export function buildPaperHeader(paper: ExamV2Paper, subjectArea: string) {
  if (subjectArea === "korean" && paper.paper_role === "common") return "국어 공통";
  if (subjectArea === "korean" && paper.paper_role === "elective") return `국어 선택: ${paper.subject_name}`;
  if (subjectArea === "math" && paper.paper_role === "common") return "수학 공통";
  if (subjectArea === "math" && paper.paper_role === "elective") return `수학 선택: ${paper.subject_name}`;
  if (paper.paper_role === "inquiry_slot" && paper.slot === "inquiry_1") return `탐구1: ${paper.subject_name}`;
  if (paper.paper_role === "inquiry_slot" && paper.slot === "inquiry_2") return `탐구2: ${paper.subject_name}`;
  return paper.subject_name;
}

export function examDetailToStructuredText(detail: ExamV2Detail) {
  const lines: string[] = [
    `시험: ${detail.exam.title}`,
    ...(detail.exam.exam_date ? [`시험일: ${detail.exam.exam_date}`] : []),
    ...(detail.exam.source_label ? [`출처: ${detail.exam.source_label}`] : []),
    ...(detail.exam.description ? [`설명: ${detail.exam.description}`] : []),
  ];

  detail.score_groups.forEach((group) => {
    lines.push("", `[점수그룹: ${group.score_group_name}]`);
    lines.push(`score_group_code: ${group.score_group_code}`);
    lines.push(`score_group_name: ${group.score_group_name}`);
    lines.push(`subject_area: ${group.subject_area}`);
    lines.push(`aggregation_type: ${group.aggregation_type}`);
    lines.push(...gradeCutLine(group));
    group.papers.forEach((paper) => {
      lines.push("", `[${buildPaperHeader(paper, group.subject_area)}]`);
      lines.push(`subject_code: ${paper.subject_code}`);
      lines.push(`type: ${paper.paper_role}`);
      if (paper.subject_code === "english" && paper.listening_youtube_url) {
        lines.push(`listening_youtube_url: ${paper.listening_youtube_url}`);
      }
      paper.questions
        .slice()
        .sort((a, b) => a.question_no - b.question_no)
        .forEach((question) => {
          lines.push(`${question.question_no} ${question.question_type} ${question.correct_answers.join("|")} ${question.score}점`);
        });
    });
  });
  return `${lines.join("\n")}\n`;
}

export const starterStructureText = `[국어 공통]
subject_code: korean_common
type: common
1 choice 1 2점

[국어 선택: 화법과 작문]
subject_code: korean_speech_writing
type: elective
35 choice 1 2점

[국어 선택: 언어와 매체]
subject_code: korean_language_media
type: elective
35 choice 1 2점

[수학 공통]
subject_code: math_common
type: common
1 choice 1 2점

[수학 선택: 확률과 통계]
subject_code: math_probability_statistics
type: elective
23 short_answer 1 2점

[수학 선택: 미적분]
subject_code: math_calculus
type: elective
23 short_answer 1 2점

[수학 선택: 기하]
subject_code: math_geometry
type: elective
23 short_answer 1 2점

[영어]
subject_code: english
type: standalone
1 choice 1 2점

[탐구1: 생활과 윤리]
subject_code: life_ethics
type: inquiry
1 choice 1 2점

[탐구1: 윤리와 사상]
subject_code: ethics_thought
type: inquiry
1 choice 1 2점

[탐구2: 사회문화]
subject_code: social_culture
type: inquiry
1 choice 1 2점

[탐구2: 동아시아사]
subject_code: east_asian_history
type: inquiry
1 choice 1 2점
`;
