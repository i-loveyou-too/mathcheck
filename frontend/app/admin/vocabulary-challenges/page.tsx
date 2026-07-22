"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Student = { id: number; name: string; grade: string };
type Bank = {
  id: number;
  title: string;
  word_count: number;
  total_days: number;
  words_per_day: number;
  default_daily_test_question_count: number;
  is_active: boolean;
};
type Challenge = {
  id: number;
  name: string;
  student_id: number;
  student_name: string;
  start_date: string;
  end_date: string;
  accumulation_type: string;
  source_type: "direct" | "word_bank";
  word_bank_title: string | null;
  is_active: boolean;
};

const today = new Date().toISOString().slice(0, 10);

export default function VocabularyChallengesPage() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "영단어 챌린지",
    student_id: "",
    start_date: today,
    end_date: today,
    source_type: "word_bank",
    word_bank_id: "",
    accumulation_type: "all_previous",
    recent_days: "7",
    daily_test_question_count: "100",
    bank_day_direction: "ascending",
    start_bank_day: "1",
    bank_days_per_learning_day: "3",
    max_question_count: "100",
    allow_student_answer_pdf: false,
  });
  const selectedBank = banks.find((bank) => String(bank.id) === form.word_bank_id) ?? null;

  const load = async () => {
    const [challengeRows, studentRows, bankRows] = await Promise.all([
      apiFetch<Challenge[]>("/admin/vocabulary-challenges"),
      apiFetch<Student[]>("/admin/students"),
      apiFetch<Bank[]>("/admin/vocabulary-banks"),
    ]);
    setChallenges(challengeRows);
    setStudents(studentRows);
    setBanks(bankRows);
    setForm((value) => ({
      ...value,
      student_id: value.student_id || (studentRows[0] ? String(studentRows[0].id) : ""),
      word_bank_id: value.word_bank_id || (bankRows[0] ? String(bankRows[0].id) : ""),
      daily_test_question_count: value.daily_test_question_count || String(bankRows[0]?.default_daily_test_question_count ?? 100),
      max_question_count: value.max_question_count || String(bankRows[0]?.default_daily_test_question_count ?? 100),
    }));
  };

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다."));
  }, [router]);

  const createChallenge = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isWordBank = form.source_type === "word_bank";
      const created = await apiFetch<Challenge>("/admin/vocabulary-challenges", {
        method: "POST",
        body: {
          name: form.name,
          student_id: Number(form.student_id),
          start_date: form.start_date,
          end_date: form.end_date,
          source_type: form.source_type,
          word_bank_id: isWordBank ? Number(form.word_bank_id) : null,
          accumulation_type: isWordBank ? "fixed_cumulative" : form.accumulation_type,
          recent_days: !isWordBank && form.accumulation_type === "recent_days" ? Number(form.recent_days) : null,
          daily_new_word_count: isWordBank && selectedBank ? selectedBank.words_per_day : 40,
          daily_test_question_count: Number(form.daily_test_question_count || selectedBank?.default_daily_test_question_count || 100),
          bank_day_direction: form.bank_day_direction,
          start_bank_day: isWordBank ? Number(form.start_bank_day || 1) : null,
          bank_days_per_learning_day: Number(form.bank_days_per_learning_day || 3),
          max_question_count: Number(form.max_question_count || form.daily_test_question_count || 100),
          allow_student_answer_pdf: form.allow_student_answer_pdf,
          is_active: true,
        },
      });
      router.push(`/admin/vocabulary-challenges/${created.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "챌린지를 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#19A879]">ADMIN VOCAB LAB</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">영단어 챌린지</h1>
            <p className="mt-2 text-sm text-[#7A859F]">직접 등록 또는 공용 워드뱅크로 학생별 챌린지를 운영합니다.</p>
          </div>
          <Link href="/admin/vocabulary-banks" className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#17213B] shadow-sm">워드뱅크 관리</Link>
        </div>

        {error && <p className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}

        <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
          <form onSubmit={createChallenge} className="h-fit rounded-[28px] bg-[#122238] p-6 text-white shadow-xl">
            <h2 className="text-xl font-black">새 챌린지 만들기</h2>
            <div className="mt-5 space-y-3">
              <label className="block text-xs font-bold text-white/60">챌린지 이름<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-white/10 px-4 text-white outline-none ring-1 ring-white/10 focus:ring-[#65E6BA]" /></label>
              <label className="block text-xs font-bold text-white/60">학생<select required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-[#203249] px-4 text-white"><option value="">학생 선택</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-white/60">시작일<input type="date" required value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-3 text-[#17213B]" /></label>
                <label className="text-xs font-bold text-white/60">종료일<input type="date" required value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-3 text-[#17213B]" /></label>
              </div>
              <label className="block text-xs font-bold text-white/60">단어 원본<select value={form.source_type} onChange={(event) => setForm({ ...form, source_type: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-[#203249] px-4 text-white"><option value="word_bank">공용 워드뱅크 사용</option><option value="direct">직접 단어 등록</option></select></label>
              {form.source_type === "word_bank" ? (
                <>
                  <label className="block text-xs font-bold text-white/60">워드뱅크<select required value={form.word_bank_id} onChange={(event) => {
                    const nextBank = banks.find((bank) => String(bank.id) === event.target.value);
                    setForm({
                      ...form,
                      word_bank_id: event.target.value,
                      daily_test_question_count: String(nextBank?.default_daily_test_question_count ?? 100),
                      max_question_count: String(nextBank?.default_daily_test_question_count ?? 100),
                      start_bank_day: form.bank_day_direction === "descending" ? String(nextBank?.total_days ?? 1) : "1",
                    });
                  }} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-[#203249] px-4 text-white"><option value="">워드뱅크 선택</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.title} · {bank.word_count}개</option>)}</select></label>
                  {selectedBank && (
                    <div className="rounded-2xl bg-white/10 p-3 text-xs font-bold text-white/70">
                      <p>{selectedBank.total_days} DAY · DAY별 신규 {selectedBank.words_per_day}개 자동 적용</p>
                      <p className="mt-1">누적 문항은 기본 {selectedBank.default_daily_test_question_count}개이며 아래에서 조정할 수 있습니다.</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-bold text-white/60">시작 bank DAY<input type="number" min="1" max={selectedBank?.total_days ?? 365} value={form.start_bank_day} onChange={(event) => setForm({ ...form, start_bank_day: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-4 text-[#17213B]" /></label>
                    <label className="text-xs font-bold text-white/60">진행 방향<select value={form.bank_day_direction} onChange={(event) => setForm({ ...form, bank_day_direction: event.target.value, start_bank_day: event.target.value === "descending" ? String(selectedBank?.total_days ?? 1) : "1" })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-[#203249] px-4 text-white"><option value="ascending">정방향</option><option value="descending">역방향</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-bold text-white/60">하루 bank DAY 수<input type="number" min="1" max="30" value={form.bank_days_per_learning_day} onChange={(event) => setForm({ ...form, bank_days_per_learning_day: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-4 text-[#17213B]" /></label>
                    <label className="text-xs font-bold text-white/60">최대 시험 문항<input type="number" min="1" max="2000" value={form.max_question_count} onChange={(event) => setForm({ ...form, max_question_count: event.target.value, daily_test_question_count: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-4 text-[#17213B]" /></label>
                  </div>
                  <label className="flex items-center gap-2 rounded-2xl bg-white/10 p-3 text-xs font-bold text-white/70"><input type="checkbox" checked={form.allow_student_answer_pdf} onChange={(event) => setForm({ ...form, allow_student_answer_pdf: event.target.checked })} className="h-4 w-4 accent-[#65E6BA]" /> 학생 정답지 PDF 허용</label>
                </>
              ) : (
                <>
                  <label className="block text-xs font-bold text-white/60">누적 방식<select value={form.accumulation_type} onChange={(event) => setForm({ ...form, accumulation_type: event.target.value })} className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-[#203249] px-4 text-white"><option value="all_previous">시작일부터 모두</option><option value="new_only">당일 신규만</option><option value="recent_days">최근 N일</option></select></label>
                  {form.accumulation_type === "recent_days" && <input type="number" min="1" value={form.recent_days} onChange={(event) => setForm({ ...form, recent_days: event.target.value })} className="h-12 w-full rounded-2xl bg-white px-4 text-[#17213B]" placeholder="최근 일수" />}
                </>
              )}
            </div>
            <button disabled={saving || !form.student_id || (form.source_type === "word_bank" && !form.word_bank_id)} className="mt-5 h-12 w-full rounded-2xl bg-[#65E6BA] font-black text-[#0D3B2E] disabled:opacity-50">{saving ? "만드는 중..." : "챌린지 만들기"}</button>
          </form>

          <section className="space-y-3">
            {challenges.length === 0 && <div className="rounded-[28px] bg-white p-10 text-center text-sm font-bold text-[#98A2B3]">아직 챌린지가 없습니다.</div>}
            {challenges.map((challenge) => (
              <Link href={`/admin/vocabulary-challenges/${challenge.id}`} key={challenge.id} className="flex items-center gap-4 rounded-[24px] border border-white bg-white p-5 shadow-card transition hover:-translate-y-0.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBF4] text-lg font-black text-[#19A879]">Aa</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-black text-[#17213B]">{challenge.name}</h2>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${challenge.is_active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{challenge.is_active ? "활성" : "비활성"}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#7A859F]">{challenge.student_name} · {challenge.start_date} ~ {challenge.end_date}</p>
                  <p className="mt-1 text-xs font-bold text-[#98A2B3]">{challenge.source_type === "word_bank" ? `워드뱅크: ${challenge.word_bank_title ?? "-"}` : `직접 등록 · ${challenge.accumulation_type}`}</p>
                </div>
                <span className="text-2xl text-[#B4BECD]">›</span>
              </Link>
            ))}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
