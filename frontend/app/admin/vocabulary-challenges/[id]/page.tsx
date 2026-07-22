"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

type Word = { id: number; english: string; accepted_answers: string[]; memo: string | null; order_index: number };
type Challenge = {
  id: number;
  name: string;
  student_id: number;
  student_name: string;
  start_date: string;
  end_date: string;
  accumulation_type: string;
  recent_days: number | null;
  source_type: "direct" | "word_bank";
  word_bank_id: number | null;
  word_bank_title: string | null;
  daily_new_word_count: number;
  daily_test_question_count: number;
  bank_day_direction: "ascending" | "descending";
  start_bank_day: number | null;
  bank_days_per_learning_day: number;
  max_question_count: number;
  allow_student_answer_pdf: boolean;
  is_active: boolean;
  words: Word[];
};
type Assignment = { date: string; word_ids: number[]; count: number };
type DayStatus = { date: string; day_number: number; learning_day: number; new_bank_day_label: string | null; cumulative_bank_day_label: string | null; cumulative_pool_count: number; new_word_count: number; question_count: number; status: string; score: number | null; correct_count: number | null; total_count: number | null; submitted_at: string | null; session_id: number | null };

export default function VocabularyChallengeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const challengeId = Number(params.id);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [days, setDays] = useState<DayStatus[]>([]);
  const [english, setEnglish] = useState("");
  const [answers, setAnswers] = useState("");
  const [memo, setMemo] = useState("");
  const [bulk, setBulk] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedWords, setSelectedWords] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    const [detail, assignmentRows, status] = await Promise.all([
      apiFetch<Challenge>(`/admin/vocabulary-challenges/${challengeId}`),
      apiFetch<Assignment[]>(`/admin/vocabulary-challenges/${challengeId}/assignments`),
      apiFetch<{ days: DayStatus[] }>(`/admin/vocabulary-challenges/${challengeId}/status`),
    ]);
    setChallenge(detail);
    setAssignments(assignmentRows);
    setDays(status.days);
    setSelectedDate((current) => current || detail.start_date);
  };

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "챌린지를 불러오지 못했습니다."));
  }, [challengeId, router]);

  useEffect(() => {
    const row = assignments.find((item) => item.date === selectedDate);
    setSelectedWords(row?.word_ids ?? []);
  }, [assignments, selectedDate]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "요청을 처리하지 못했습니다.");
    }
  };

  const addDirect = async () => {
    await run(() => apiFetch(`/admin/vocabulary-challenges/${challengeId}/words`, {
      method: "POST",
      body: { words: [{ english, accepted_answers: answers.split(",").map((value) => value.trim()).filter(Boolean), memo: memo || null, order_index: (challenge?.words.length ?? 0) + 1 }] },
    }), "단어를 추가했습니다.");
    setEnglish("");
    setAnswers("");
    setMemo("");
  };

  const bulkLines = bulk.split(/\r?\n/).filter((line) => line.trim());
  const invalidLines = bulkLines.filter((line) => !line.includes("\t"));
  const addBulk = async () => {
    if (invalidLines.length) {
      setError(`탭이 없는 줄이 ${invalidLines.length}개 있습니다.`);
      return;
    }
    await run(() => apiFetch(`/admin/vocabulary-challenges/${challengeId}/words`, {
      method: "POST",
      body: {
        words: bulkLines.map((line, index) => {
          const [word, meaning] = line.split("\t");
          return { english: word, accepted_answers: (meaning ?? "").split(",").map((value) => value.trim()).filter(Boolean), memo: null, order_index: (challenge?.words.length ?? 0) + index + 1 };
        }),
      },
    }), `${bulkLines.length}개 단어를 추가했습니다.`);
    setBulk("");
  };

  const saveAssignment = () => run(() => apiFetch(`/admin/vocabulary-challenges/${challengeId}/assignments/${selectedDate}`, {
    method: "PUT",
    body: { word_ids: selectedWords },
  }), `${selectedDate} 배정을 저장했습니다.`);

  if (!challenge) {
    return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error || "불러오는 중..."}</main>;
  }

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href="/admin/vocabulary-challenges" className="text-sm font-bold text-[#64748B]">← 챌린지 목록</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#17213B]">{challenge.name}</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">{challenge.student_name} · {challenge.start_date} ~ {challenge.end_date}</p>
            <p className="mt-1 text-xs font-bold text-[#98A2B3]">{challenge.source_type === "word_bank" ? `공용 워드뱅크 · ${challenge.word_bank_title ?? "-"}` : `직접 등록 · ${challenge.accumulation_type}`}</p>
          </div>
          <button onClick={() => void run(() => apiFetch(`/admin/vocabulary-challenges/${challengeId}`, { method: "PATCH", body: { is_active: !challenge.is_active } }), challenge.is_active ? "비활성화했습니다." : "활성화했습니다.")} className={`rounded-full px-4 py-2 text-sm font-black ${challenge.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>{challenge.is_active ? "활성 운영 중" : "비활성"}</button>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        {challenge.source_type === "direct" ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]">
            <section className="rounded-[28px] bg-white p-6 shadow-card">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-black text-[#19A879]">DIRECT WORDS</p><h2 className="mt-1 text-xl font-black text-[#17213B]">단어 등록</h2></div>
                <span className="rounded-full bg-[#E8FBF4] px-3 py-1 text-sm font-black text-[#12815F]">{challenge.words.length}개</span>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
                <input value={english} onChange={(event) => setEnglish(event.target.value)} placeholder="english" className="h-11 rounded-xl border border-[#E5EAF1] px-3 outline-none focus:border-[#19A879]" />
                <input value={answers} onChange={(event) => setAnswers(event.target.value)} placeholder="뜻, 뜻" className="h-11 rounded-xl border border-[#E5EAF1] px-3 outline-none focus:border-[#19A879]" />
                <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="메모" className="h-11 rounded-xl border border-[#E5EAF1] px-3" />
                <button disabled={!english.trim() || !answers.trim()} onClick={() => void addDirect()} className="rounded-xl bg-[#17213B] px-4 font-black text-white disabled:opacity-30">추가</button>
              </div>
              <div className="mt-4 rounded-2xl bg-[#F7F9FC] p-4">
                <p className="text-xs font-bold text-[#667085]">일괄 등록: english[TAB]뜻, 뜻</p>
                <textarea value={bulk} onChange={(event) => setBulk(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-xl border border-[#E5EAF1] bg-white p-3 text-sm outline-none" placeholder={"apple\t사과\nrun\t달리다, 운영하다"} />
                {invalidLines.length > 0 && <p className="mt-2 text-xs font-bold text-red-500">탭 누락: {invalidLines.join(" / ")}</p>}
                <button disabled={!bulkLines.length || invalidLines.length > 0} onClick={() => void addBulk()} className="mt-2 rounded-xl bg-[#65E6BA] px-4 py-2 text-sm font-black text-[#0D3B2E] disabled:opacity-40">{bulkLines.length}줄 등록</button>
              </div>
              <div className="mt-5 max-h-[360px] space-y-2 overflow-auto">
                {challenge.words.map((word) => <div key={word.id} className="flex items-center gap-3 rounded-2xl border border-[#EEF1F5] px-4 py-3"><span className="w-7 text-xs font-black text-[#A0A8B8]">{word.order_index}</span><div className="min-w-0 flex-1"><p className="font-black text-[#17213B]">{word.english}</p><p className="truncate text-sm text-[#7A859F]">{word.accepted_answers.join(" · ")}</p></div></div>)}
              </div>
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-card">
              <p className="text-xs font-black text-[#6478FF]">DAILY PLAN</p>
              <h2 className="mt-1 text-xl font-black text-[#17213B]">날짜별 신규 단어 배정</h2>
              <input type="date" min={challenge.start_date} max={challenge.end_date} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="mt-5 h-12 w-full rounded-2xl border border-[#E5EAF1] px-4 font-bold" />
              <div className="mt-3 flex items-center justify-between"><span className="text-sm font-bold text-[#667085]">선택 {selectedWords.length}개</span><button onClick={() => setSelectedWords([])} className="text-xs font-bold text-[#98A2B3]">해제</button></div>
              <div className="mt-3 max-h-[400px] space-y-2 overflow-auto">
                {challenge.words.map((word) => <label key={word.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${selectedWords.includes(word.id) ? "border-[#65E6BA] bg-[#EEFCF7]" : "border-[#EEF1F5]"}`}><input type="checkbox" checked={selectedWords.includes(word.id)} onChange={() => setSelectedWords((values) => values.includes(word.id) ? values.filter((id) => id !== word.id) : [...values, word.id])} className="h-5 w-5 accent-[#19A879]" /><span className="font-black text-[#17213B]">{word.english}</span><span className="ml-auto truncate text-xs text-[#8A94A8]">{word.accepted_answers[0]}</span></label>)}
              </div>
              <button onClick={saveAssignment} className="mt-4 h-12 w-full rounded-2xl bg-[#6478FF] font-black text-white">이 날짜 배정 저장</button>
            </section>
          </div>
        ) : (
          <section className="mt-6 rounded-[28px] bg-white p-6 shadow-card">
            <p className="text-xs font-black text-[#6478FF]">WORD BANK PLAN</p>
            <h2 className="mt-1 text-xl font-black text-[#17213B]">자동 DAY 진행</h2>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">학생별 설정에 따라 bank DAY를 이동하고, 누적 pool 전체에서 최대 문항 수만큼 랜덤 출제합니다.</p>
            <div className="mt-4 grid gap-3 text-sm font-bold text-[#17213B] sm:grid-cols-5">
              <div className="rounded-2xl bg-[#F7F9FC] p-3"><p className="text-xs text-[#8A94A8]">시작 bank DAY</p><p className="mt-1 text-lg font-black">{challenge.start_bank_day ?? 1}</p></div>
              <div className="rounded-2xl bg-[#F7F9FC] p-3"><p className="text-xs text-[#8A94A8]">방향</p><p className="mt-1 text-lg font-black">{challenge.bank_day_direction === "descending" ? "역순" : "정순"}</p></div>
              <div className="rounded-2xl bg-[#F7F9FC] p-3"><p className="text-xs text-[#8A94A8]">하루 DAY</p><p className="mt-1 text-lg font-black">{challenge.bank_days_per_learning_day}</p></div>
              <div className="rounded-2xl bg-[#F7F9FC] p-3"><p className="text-xs text-[#8A94A8]">최대 문항</p><p className="mt-1 text-lg font-black">{challenge.max_question_count}</p></div>
              <div className="rounded-2xl bg-[#F7F9FC] p-3"><p className="text-xs text-[#8A94A8]">학생 정답지</p><p className="mt-1 text-lg font-black">{challenge.allow_student_answer_pdf ? "허용" : "차단"}</p></div>
            </div>
          </section>
        )}

        <section className="mt-5 overflow-hidden rounded-[28px] bg-white shadow-card">
          <div className="border-b border-[#EEF1F5] p-6"><p className="text-xs font-black text-[#F59E0B]">PROGRESS</p><h2 className="mt-1 text-xl font-black text-[#17213B]">날짜별 응시 현황</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#F8FAFC] text-xs text-[#7A859F]"><tr><th className="p-4">날짜</th><th>SPRINT DAY</th><th>신규 범위</th><th>누적 범위</th><th>Pool</th><th>출제</th><th>상태</th><th>점수</th><th>PDF</th></tr></thead>
              <tbody>{days.map((day) => <tr key={day.date} className="border-t border-[#F0F2F6]"><td className="p-4 font-black text-[#17213B]">{day.date}</td><td>{day.learning_day ?? day.day_number}</td><td>{day.new_bank_day_label ?? "-"}</td><td>{day.cumulative_bank_day_label ?? "-"}</td><td>{day.cumulative_pool_count ?? "-"}</td><td>{day.question_count}</td><td><span className={`rounded-full px-2 py-1 text-xs font-bold ${day.status === "submitted" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{day.status}</span></td><td>{day.score ?? "-"}</td><td>{day.session_id ? <div className="flex gap-2"><a target="_blank" href={`${API_BASE_URL}/admin/vocabulary-sessions/${day.session_id}/paper`} className="text-xs font-black text-[#2874E8]">문제지</a><a target="_blank" href={`${API_BASE_URL}/admin/vocabulary-sessions/${day.session_id}/answer-key`} className="text-xs font-black text-[#19A879]">정답지</a></div> : "-"}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
      <AdminBottomNav />
    </main>
  );
}
