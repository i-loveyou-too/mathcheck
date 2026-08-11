"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Student = { id: number; name: string; grade: string };
type ReviewItem = {
  id: number;
  session_id: number;
  challenge_id: number;
  challenge_name: string;
  student_id: number;
  student_name: string;
  study_date: string;
  learning_day: number | null;
  new_bank_day_label: string | null;
  cumulative_bank_day_label: string | null;
  word_bank_title: string | null;
  question_id: number;
  order_index: number;
  english: string;
  accepted_answers: string[];
  input_answer: string;
  final_is_correct: boolean;
  is_manual_override: boolean;
  manual_is_correct: boolean | null;
  admin_reviewed_at: string | null;
  session_score: number | null;
  session_correct_count: number | null;
  session_total_count: number | null;
  pending_count_for_session: number;
};
type ReviewResponse = { items: ReviewItem[]; count: number };
type GradingAction = "mark_correct" | "mark_incorrect";

export default function AdminVocabularyReviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filters, setFilters] = useState({
    student_id: "",
    study_date: "",
    day_or_name: "",
    review_status: "pending",
    query: "",
    include_reviewed: false,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (filters.student_id) search.set("student_id", filters.student_id);
    if (filters.study_date) search.set("study_date", filters.study_date);
    if (filters.day_or_name.trim()) search.set("day_or_name", filters.day_or_name.trim());
    if (filters.review_status) search.set("review_status", filters.review_status);
    if (filters.query.trim()) search.set("query", filters.query.trim());
    if (filters.include_reviewed) search.set("include_reviewed", "true");
    return search.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [reviewRows, studentRows] = await Promise.all([
        apiFetch<ReviewResponse>(`/admin/vocabulary-review-items?${params}`),
        apiFetch<Student[]>("/admin/students"),
      ]);
      setItems(reviewRows.items);
      setStudents(studentRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "검토 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load();
  }, [params, router]);

  const applyGrading = async (item: ReviewItem, action: GradingAction) => {
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ auto_reviewed: boolean; pending_count_for_session: number }>(
        `/admin/vocabulary-review-items/${item.session_id}/responses/${item.id}/grading`,
        { method: "PATCH", body: { action, reason: null } },
      );
      setItems((current) => current.filter((row) => row.id !== item.id));
      setNotice(result.auto_reviewed ? "판정 저장 후 해당 시험 확인 체크까지 완료했습니다." : "판정을 저장했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "판정을 저장하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const pendingSessions = new Set(items.map((item) => item.session_id)).size;

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1280px] px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#19A879]">ADMIN VOCAB REVIEW</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">영단어 오답 통합 검토</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">미확인 시험의 자동 오답을 한 화면에서 판정합니다.</p>
          </div>
          <Link href="/admin/vocabulary-challenges" className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#17213B] shadow-sm">
            영단어 관리
          </Link>
        </div>

        <section className="mt-5 rounded-[24px] bg-white p-4 shadow-card">
          <div className="grid gap-3 lg:grid-cols-[180px_170px_1fr_170px_1fr_auto]">
            <label className="text-xs font-bold text-[#667085]">
              학생
              <select value={filters.student_id} onChange={(event) => setFilters({ ...filters, student_id: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 font-bold text-[#17213B]">
                <option value="">전체</option>
                {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-[#667085]">
              시험 날짜
              <input type="date" value={filters.study_date} onChange={(event) => setFilters({ ...filters, study_date: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 font-bold text-[#17213B]" />
            </label>
            <label className="text-xs font-bold text-[#667085]">
              Day 또는 시험명
              <input value={filters.day_or_name} onChange={(event) => setFilters({ ...filters, day_or_name: event.target.value })} placeholder="DAY, 범위, 시험명" className="mt-1.5 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 font-bold text-[#17213B]" />
            </label>
            <label className="text-xs font-bold text-[#667085]">
              검토 상태
              <select value={filters.review_status} onChange={(event) => setFilters({ ...filters, review_status: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 font-bold text-[#17213B]">
                <option value="pending">미판정</option>
                <option value="completed">판정 완료</option>
                <option value="all">전체</option>
              </select>
            </label>
            <label className="text-xs font-bold text-[#667085]">
              단어/답안 검색
              <input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="단어, 학생 답안" className="mt-1.5 h-11 w-full rounded-xl border border-[#E5EAF1] px-3 font-bold text-[#17213B]" />
            </label>
            <label className="flex items-end gap-2 pb-2 text-xs font-black text-[#667085]">
              <input type="checkbox" checked={filters.include_reviewed} onChange={(event) => setFilters({ ...filters, include_reviewed: event.target.checked })} className="h-4 w-4 accent-[#19A879]" />
              확인 완료 포함
            </label>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-black text-[#17213B]">{items.length}개 오답 · {pendingSessions}개 시험</p>
          <button type="button" onClick={() => void load()} className="rounded-full bg-[#17213B] px-4 py-2 text-xs font-black text-white">새로고침</button>
        </div>

        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-4 overflow-x-auto rounded-[26px] bg-white shadow-card">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-[#F8FAFC] text-xs text-[#7A859F]">
              <tr>
                <th className="p-4">학생</th>
                <th>날짜/Day</th>
                <th>시험 범위</th>
                <th>출제 단어</th>
                <th>정답</th>
                <th>학생 답안</th>
                <th>현재 판정</th>
                <th>시험 점수</th>
                <th>판정</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="p-8 text-center font-bold text-[#98A2B3]">불러오는 중...</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={9} className="p-8 text-center font-bold text-[#98A2B3]">검토할 오답이 없습니다.</td></tr>}
              {items.map((item) => {
                const busy = busyId === item.id;
                return (
                  <tr key={item.id} className="border-t border-[#EEF1F5] align-top">
                    <td className="p-4 font-black text-[#17213B]">{item.student_name}</td>
                    <td className="whitespace-nowrap font-bold text-[#52627A]">
                      <p>{item.study_date}</p>
                      <p className="mt-1 text-xs text-[#98A2B3]">DAY {item.learning_day ?? "-"}</p>
                    </td>
                    <td className="max-w-[220px]">
                      <p className="font-black text-[#17213B]">{item.challenge_name}</p>
                      <p className="mt-1 text-xs font-semibold text-[#7A859F]">{item.cumulative_bank_day_label ?? item.new_bank_day_label ?? item.word_bank_title ?? "-"}</p>
                    </td>
                    <td className="font-black text-[#17213B]">{item.english}</td>
                    <td className="max-w-[240px] text-[#667085]">{item.accepted_answers.join(" · ")}</td>
                    <td className="max-w-[220px] font-bold text-red-500">{item.input_answer || "(빈 답안)"}</td>
                    <td>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${item.final_is_correct ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                        {item.final_is_correct ? "정답" : "오답"}
                      </span>
                      {item.is_manual_override && <p className="mt-1 text-xs font-bold text-[#2874E8]">수동 판정</p>}
                    </td>
                    <td className="whitespace-nowrap text-xs font-bold text-[#667085]">
                      <p>{item.session_score ?? "-"}점</p>
                      <p>{item.session_correct_count ?? "-"} / {item.session_total_count ?? "-"}</p>
                      <p className="mt-1 text-[#98A2B3]">남은 검토 {item.pending_count_for_session}</p>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex flex-wrap gap-1.5">
                        <button disabled={busy} onClick={() => void applyGrading(item, "mark_correct")} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                          정답 인정
                        </button>
                        <button disabled={busy} onClick={() => void applyGrading(item, "mark_incorrect")} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                          오답 유지
                        </button>
                        <Link href={`/admin/vocabulary-challenges/${item.challenge_id}/results/${item.session_id}`} className="rounded-lg bg-[#F0F2F8] px-3 py-2 text-xs font-black text-[#17213B]">
                          상세
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
      <AdminBottomNav />
    </main>
  );
}
