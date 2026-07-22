"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudyDate } from "@/lib/study-date";
import { getStudent } from "@/lib/storage";

type Day = {
  date: string;
  day_number: number;
  learning_day: number;
  new_bank_day_label: string | null;
  cumulative_bank_day_label: string | null;
  cumulative_pool_count: number;
  new_word_count: number;
  question_count: number;
  status: "scheduled" | "missed" | "in_progress" | "completed" | "not_started";
  session_id: number | null;
  score: number | null;
};
type Dashboard = {
  challenge: null | { id: number; name: string; start_date: string; end_date: string; word_bank_title: string | null; allow_student_answer_pdf: boolean };
  today: string;
  today_progress?: Day;
  unresolved_count?: number;
  days: Day[];
};
type Session = { id: number; status: string };
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

const labels: Record<Day["status"], string> = {
  scheduled: "예정",
  missed: "지난 시험",
  in_progress: "진행 중",
  completed: "완료",
  not_started: "시작 전",
};

export default function StudentSprintVocabularyPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void apiFetch<Dashboard>(`/student/vocabulary/current?student_id=${student.id}&study_date=${getStudyDate()}`)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "영단어 챌린지를 불러오지 못했습니다."));
  }, [router]);

  const sessionPath = (sessionId: number, status: string) => (
    status === "completed" ? `/student/sprint/vocabulary/result/${sessionId}` : `/student/sprint/vocabulary/test/${sessionId}`
  );

  const start = async (day: Day) => {
    if (!studentId) return;
    setStarting(true);
    setError("");
    try {
      if (day.session_id) {
        router.push(sessionPath(day.session_id, day.status));
        return;
      }
      const session = await apiFetch<Session>("/student/vocabulary/sessions", {
        method: "POST",
        body: { student_id: studentId, study_date: day.date },
      });
      router.push(`/student/sprint/vocabulary/test/${session.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "시험을 시작하지 못했습니다.");
      setStarting(false);
    }
  };

  const review = async () => {
    if (!studentId) return;
    setStarting(true);
    try {
      const session = await apiFetch<Session>("/student/vocabulary/review-sessions", {
        method: "POST",
        body: { student_id: studentId },
      });
      router.push(session.status === "submitted" ? `/student/sprint/vocabulary/result/${session.id}` : `/student/sprint/vocabulary/test/${session.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "오답 재시험을 시작하지 못했습니다.");
      setStarting(false);
    }
  };

  if (!data) {
    return (
      <ScreenShell withBottomNav>
        <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
          <p className="py-20 text-center font-bold text-[#6E7F99]">{error || "영단어 챌린지를 불러오는 중..."}</p>
        </div>
      </ScreenShell>
    );
  }

  if (!data.challenge || !data.today_progress) {
    return (
      <ScreenShell withBottomNav>
        <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
          <Link href="/student/sprint" className="text-sm font-black text-[#2874E8]">SPRINT 홈</Link>
          <section className="mt-8 rounded-[28px] bg-white/95 p-8 text-center shadow-[0_18px_36px_rgba(49,89,130,0.16)] ring-1 ring-[#DCEBFA]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#EAF5FF] text-2xl font-black text-[#2874E8]">Aa</div>
            <h1 className="mt-5 text-xl font-black text-[#10213D]">진행 중인 영단어 챌린지가 없습니다.</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#6E7F99]">관리자가 챌린지를 배정하면 SPRINT 안에서 바로 시작할 수 있습니다.</p>
          </section>
        </div>
      </ScreenShell>
    );
  }

  const today = data.today_progress;
  const completed = today.status === "completed";
  const actionLabel = completed ? `결과 보기 · ${today.score}점` : today.status === "in_progress" ? "이어가기" : today.status === "missed" ? "지난 시험 시작" : "오늘 시험 시작";
  const paperUrl = today.session_id && studentId ? `${API_BASE_URL}/student/vocabulary/sessions/${today.session_id}/paper?student_id=${studentId}` : "";
  const answerUrl = today.session_id && studentId ? `${API_BASE_URL}/student/vocabulary/sessions/${today.session_id}/answer-key?student_id=${studentId}` : "";

  return (
    <ScreenShell withBottomNav>
      <div className="-mx-5 -mt-7 min-h-screen bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-10">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-black tracking-[0.18em] text-[#2874E8]">SPRINT VOCAB</p>
            <h1 className="mt-1 text-[1.9rem] font-black tracking-[-0.05em] text-[#10213D]">영단어 챌린지</h1>
          </div>
          <Link href="/student/sprint/vocabulary/wrong-notes" className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#2874E8] shadow-sm">오답노트</Link>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <section className="relative mt-5 overflow-hidden rounded-[30px] bg-[#13352F] p-6 text-white shadow-[0_24px_55px_rgba(19,53,47,.25)]">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#65E6BA]/20 blur-2xl" />
          <p className="relative text-sm font-bold text-[#8EF0CF]">{data.challenge.name}</p>
          <h2 className="relative mt-2 text-2xl font-black">SPRINT DAY {today.learning_day ?? today.day_number} · {data.today}</h2>
          <p className="relative mt-2 text-sm text-white/60">{data.challenge.word_bank_title ?? "Word Bank"} · {data.challenge.start_date} ~ {data.challenge.end_date}</p>
          <div className="relative mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-[11px] text-white/55">오늘 학습</p><p className="mt-1 text-sm font-black">{today.new_bank_day_label ?? `${today.new_word_count}개`}</p></div>
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-[11px] text-white/55">누적 범위</p><p className="mt-1 text-sm font-black">{today.cumulative_bank_day_label ?? "-"}</p></div>
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-[11px] text-white/55">출제 문항</p><p className="mt-1 text-xl font-black">{today.question_count}</p></div>
          </div>
          <div className="relative mt-3 grid grid-cols-2 gap-2 text-center text-xs font-black">
            <div className="rounded-2xl bg-white/10 px-3 py-2">누적 pool {today.cumulative_pool_count ?? today.question_count}개</div>
            <div className="rounded-2xl bg-white/10 px-3 py-2">미해결 오답 {data.unresolved_count ?? 0}개</div>
          </div>
          <button disabled={starting || today.status === "scheduled" || today.question_count === 0} onClick={() => void start(today)} className="relative mt-5 h-14 w-full rounded-[20px] bg-[#65E6BA] text-base font-black text-[#0D3B2E] shadow-lg transition active:scale-[.98] disabled:bg-white/15 disabled:text-white/40">
            {today.question_count === 0 ? "오늘 배정된 단어가 없어요" : starting ? "시험 준비 중..." : actionLabel}
          </button>
          {today.session_id && (
            <div className="relative mt-3 grid grid-cols-2 gap-2">
              <a href={paperUrl} target="_blank" className="rounded-2xl bg-white/95 px-4 py-3 text-center text-sm font-black text-[#2874E8]">문제지 PDF</a>
              {data.challenge.allow_student_answer_pdf ? <a href={answerUrl} target="_blank" className="rounded-2xl bg-white/95 px-4 py-3 text-center text-sm font-black text-[#19A879]">정답지 PDF</a> : <span className="rounded-2xl bg-white/10 px-4 py-3 text-center text-sm font-black text-white/45">정답지 비공개</span>}
            </div>
          )}
        </section>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/student/sprint/vocabulary/wrong-notes" className="rounded-[22px] bg-white p-4 shadow-[0_12px_28px_rgba(71,104,143,0.12)] ring-1 ring-[#DFEAF6]">
            <p className="text-xs font-black text-[#2874E8]">WRONG NOTES</p>
            <p className="mt-2 font-black text-[#10213D]">오답 모아보기</p>
          </Link>
          <button disabled={!data.unresolved_count || starting} onClick={() => void review()} className="rounded-[22px] bg-[#FFF5D9] p-4 text-left shadow-[0_12px_28px_rgba(71,104,143,0.12)] disabled:opacity-45">
            <p className="text-xs font-black text-[#D68B00]">RETRY</p>
            <p className="mt-2 font-black text-[#10213D]">오답 재시험</p>
          </button>
        </div>

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black text-[#10213D]">챌린지 진도</h2>
            <span className="text-xs font-bold text-[#8CA0BD]">총 {data.days.length}일</span>
          </div>
          <div className="space-y-2">
            {data.days.map((day) => (
              <button key={day.date} disabled={day.status === "scheduled" || day.question_count === 0} onClick={() => void start(day)} className="flex w-full items-center gap-3 rounded-[20px] bg-white px-4 py-3 text-left shadow-sm ring-1 ring-[#E6F0FA] disabled:opacity-55">
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-black ${day.status === "completed" ? "bg-[#DDF8EE] text-[#12815F]" : day.status === "missed" ? "bg-[#FFF0E8] text-[#E56B2F]" : "bg-[#F0F3F8] text-[#667085]"}`}>D{day.day_number}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#10213D]">{day.date}</p>
                  <p className="mt-0.5 text-xs text-[#8CA0BD]">{day.new_bank_day_label ?? `신규 ${day.new_word_count}개`} · 출제 {day.question_count}</p>
                </div>
                <span className="shrink-0 text-xs font-black text-[#667085]">{day.score != null ? `${day.score}점` : labels[day.status]}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </ScreenShell>
  );
}
