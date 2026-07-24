"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type GradeCut = { grade: number; minimum_score: number };
type Media = { id: number; media_type: string; original_filename: string | null };
type Catalog = {
  id: number;
  title: string;
  subject: string;
  question_count: number;
  total_score: number;
  duration_minutes: number | null;
  is_published: boolean;
  sort_order: number;
  has_answer_key: boolean;
  answer_key_total: number;
  grade_cuts: GradeCut[];
  media: Media[];
  assignment_count: number;
};

const SUBJECT_OPTIONS = ["국어", "수학", "영어", "생활과 윤리", "윤리와 사상", "사회문화", "동아시아사"];

export default function AdminMockExamCatalogPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "SPRINT 1회", subject: "수학", question_count: "20", total_score: "100", duration_minutes: "100",
  });

  const load = async () => {
    setCatalog(await apiFetch<Catalog[]>("/admin/mock-exam-catalog"));
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다."));
  }, [router]);

  const createCatalog = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await apiFetch<Catalog>("/admin/mock-exam-catalog", {
        method: "POST",
        body: {
          title: form.title,
          subject: form.subject,
          question_count: Number(form.question_count),
          total_score: Number(form.total_score),
          duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        },
      });
      router.push(`/admin/mock-exams/${created.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "시험을 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#2874E8]">SPRINT MOCK EXAM</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">SPRINT 모의고사 관리</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">공통 시험을 한 번 등록하고 여러 학생에게 배정합니다. 시험지·정답·등급컷은 학생마다 복제하지 않습니다.</p>
          </div>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <div className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
          <form onSubmit={createCatalog} className="h-fit rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">새 공통 시험 등록</h2>
            <div className="mt-4 space-y-3 text-xs font-bold text-[#7A859F]">
              <label className="block">시험명 (자유 입력: SPRINT 1회 / 1.5회 / FINAL 1회)<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">과목<input required list="subject-options" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" />
                <datalist id="subject-options">{SUBJECT_OPTIONS.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">문항 수<input type="number" min="1" required value={form.question_count} onChange={(e) => setForm({ ...form, question_count: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
                <label className="block">총점<input type="number" min="1" required value={form.total_score} onChange={(e) => setForm({ ...form, total_score: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              </div>
              <label className="block">시험 시간(분, 선택)<input type="number" min="1" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            </div>
            <button disabled={saving} className="mt-5 h-12 w-full rounded-2xl bg-[#2874E8] text-sm font-black text-white disabled:opacity-50">{saving ? "생성 중..." : "시험 만들기"}</button>
          </form>

          <section className="space-y-3">
            {catalog.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">등록된 공통 시험이 없습니다.</div>}
            {catalog.map((exam) => (
              <Link href={`/admin/mock-exams/${exam.id}`} key={exam.id} className="block rounded-[24px] bg-white p-5 shadow-card transition hover:-translate-y-0.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-[#17213B]">{exam.title}</h2>
                      <span className="rounded-md bg-[#EAF5FF] px-2 py-0.5 text-[10px] font-black text-[#2874E8]">{exam.subject}</span>
                      {exam.is_published ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">공개</span> : <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">비공개</span>}
                    </div>
                    <p className="mt-1 text-sm font-bold text-[#7A859F]">{exam.question_count}문항 · {exam.total_score}점{exam.duration_minutes ? ` · ${exam.duration_minutes}분` : ""} · 배정 {exam.assignment_count}명</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {exam.has_answer_key ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">정답 등록됨</span> : <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-500">정답 미등록</span>}
                    {exam.grade_cuts.length > 0 && <span className="rounded-md bg-[#EAF5FF] px-2 py-0.5 text-[10px] font-black text-[#2874E8]">등급컷 {exam.grade_cuts.length}</span>}
                    {exam.media.some((m) => m.media_type === "worksheet_pdf") && <span className="rounded-md bg-[#F1F3FF] px-2 py-0.5 text-[10px] font-black text-[#5C63FF]">시험지</span>}
                    {exam.media.some((m) => m.media_type === "solution_pdf") && <span className="rounded-md bg-[#F1F3FF] px-2 py-0.5 text-[10px] font-black text-[#5C63FF]">해설</span>}
                    {exam.media.some((m) => m.media_type === "listening_audio") && <span className="rounded-md bg-[#F1F3FF] px-2 py-0.5 text-[10px] font-black text-[#5C63FF]">듣기</span>}
                  </div>
                </div>
              </Link>
            ))}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
