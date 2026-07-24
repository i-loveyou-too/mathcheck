"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

type Media = { id: number; media_type: string; original_filename: string | null; duration_seconds: number | null };
type Assignment = {
  id: number;
  catalog_id: number;
  exam_date: string;
  available_from: string;
  submission_deadline_at: string;
  status: "not_started" | "draft" | "submitted" | "graded" | "confirmed";
  is_started: boolean;
  is_result_open: boolean;
  is_solution_open: boolean;
  catalog: { id: number; title: string; subject: string; question_count: number; total_score: number; duration_minutes: number | null; media: Media[] };
};

export default function StudentMockExamAssignmentDetailPage() {
  const router = useRouter();
  const params = useParams<{ assignmentId: string }>();
  const assignmentId = Number(params.assignmentId);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [data, setData] = useState<Assignment | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const student = getStudent();
    if (!student) { router.push("/login"); return; }
    setStudentId(student.id);
    void apiFetch<Assignment>(`/student/sprint/mock-exam-assignments/${assignmentId}?student_id=${student.id}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : "시험 정보를 불러오지 못했습니다."));
  }, [router, assignmentId]);

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="min-h-[70vh] rounded-[28px] bg-white/70 p-8 text-center font-bold text-[#6E7F99]">{error || "불러오는 중..."}</div>
      </ScreenShell>
    );
  }

  const catalog = data.catalog;
  const isEnglish = catalog.subject.includes("영어");
  const worksheet = catalog.media.find((m) => m.media_type === "worksheet_pdf");
  const audio = catalog.media.find((m) => m.media_type === "listening_audio");
  const locked = ["submitted", "graded", "confirmed"].includes(data.status);
  const worksheetUrl = studentId ? `${API_BASE_URL}/student/sprint/mock-exam-catalog/${catalog.id}/worksheet-file?student_id=${studentId}` : "#";
  const audioUrl = studentId ? `${API_BASE_URL}/student/sprint/mock-exam-catalog/${catalog.id}/listening-audio?student_id=${studentId}` : "#";

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <Link href="/student/sprint/mock-exam-assignments" className="break-keep text-sm font-black text-[#2874E8]">← 모의고사 목록</Link>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="break-keep text-2xl font-black tracking-[-0.05em] text-[#10213D]">{catalog.title}</h1>
          <span className="shrink-0 break-keep rounded-full bg-[#EAF5FF] px-3 py-1.5 text-xs font-black text-[#2874E8]">{catalog.subject}</span>
        </div>

        {error && <p className="mt-4 break-keep rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <section className="mt-6 rounded-[28px] bg-white/95 p-5 shadow-[0_18px_36px_rgba(49,89,130,0.18)] ring-1 ring-[#DCEBFA]">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="break-keep text-xs font-bold text-[#8CA0BD]">시험 예정일</p><p className="mt-1 break-keep font-black text-[#10213D]">{data.exam_date}</p></div>
            <div><p className="break-keep text-xs font-bold text-[#8CA0BD]">시험 시간</p><p className="mt-1 break-keep font-black text-[#10213D]">{catalog.duration_minutes ? `${catalog.duration_minutes}분` : "-"}</p></div>
            <div><p className="break-keep text-xs font-bold text-[#8CA0BD]">응시 시작</p><p className="mt-1 break-keep font-black text-[#10213D]">{new Date(data.available_from).toLocaleString("ko-KR")}</p></div>
            <div><p className="break-keep text-xs font-bold text-[#8CA0BD]">제출 마감</p><p className="mt-1 break-keep font-black text-[#10213D]">{new Date(data.submission_deadline_at).toLocaleString("ko-KR")}</p></div>
          </div>
        </section>

        {!data.is_started ? (
          <section className="mt-4 rounded-[28px] bg-white/95 p-6 text-center shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF5FF] text-2xl">⏳</div>
            <p className="mt-3 break-keep font-black text-[#10213D]">아직 응시 가능 시간이 아니에요.</p>
            <p className="mt-1 break-keep text-sm font-semibold text-[#6E7F99]">응시 시작 시간이 되면 시험지와 답안 입력이 열립니다.</p>
          </section>
        ) : (
          <>
            <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
              <h2 className="break-keep text-lg font-black text-[#10213D]">시험지</h2>
              {worksheet ? (
                <a href={worksheetUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block h-12 break-keep rounded-2xl bg-[#10213D] text-center text-sm font-black leading-[3rem] text-white">시험지 PDF 열기</a>
              ) : (
                <p className="mt-3 break-keep text-sm font-bold text-[#8CA0BD]">등록된 시험지가 없습니다.</p>
              )}
              {isEnglish && audio && (
                <div className="mt-4">
                  <p className="break-keep text-xs font-black text-[#6E7F99]">영어 듣기</p>
                  <audio controls preload="metadata" src={audioUrl} className="mt-2 w-full" />
                </div>
              )}
            </section>

            <section className="mt-4 rounded-[28px] bg-white/95 p-5 shadow-[0_12px_28px_rgba(71,104,143,0.14)] ring-1 ring-[#DFEAF6]">
              <h2 className="break-keep text-lg font-black text-[#10213D]">답안 (OMR)</h2>
              {locked ? (
                <>
                  <p className="mt-2 break-keep text-sm font-bold text-[#17895E]">제출 완료된 시험이에요.</p>
                  <Link href={`/student/sprint/mock-exam-assignments/${assignmentId}/result`} className="mt-3 block h-12 break-keep rounded-2xl bg-[#2874E8] text-center text-sm font-black leading-[3rem] text-white">결과 및 성적 분석 보기</Link>
                </>
              ) : (
                <Link href={`/student/sprint/mock-exam-assignments/${assignmentId}/omr`} className="mt-3 block h-12 break-keep rounded-2xl bg-[#2874E8] text-center text-sm font-black leading-[3rem] text-white">답안 입력하기</Link>
              )}
            </section>
          </>
        )}
      </div>
    </ScreenShell>
  );
}
