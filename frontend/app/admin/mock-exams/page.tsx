"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type ExamSet = {
  id: number;
  round_no: number | null;
  title: string;
  scheduled_at: string | null;
  is_active: boolean;
  archived_at: string | null;
  exam_count: number;
  assigned_student_count: number;
  completed_student_count: number;
};

export default function AdminMockExamSetsPage() {
  const router = useRouter();
  const [sets, setSets] = useState<ExamSet[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "SPRINT 1회", round_no: "", scheduled_at: "" });

  const load = async () => {
    setSets(await apiFetch<ExamSet[]>("/admin/mock-exam-sets"));
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다."));
  }, [router]);

  const createSet = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch<ExamSet>("/admin/mock-exam-sets", {
        method: "POST",
        body: {
          title: form.title,
          round_no: form.round_no ? Number(form.round_no) : null,
          scheduled_at: form.scheduled_at || null,
        },
      });
      router.push(`/admin/mock-exams/${created.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "세트를 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSet = async (set: ExamSet) => {
    setError(""); setNotice("");
    if (!window.confirm(`정말 "${set.title}" 세트를 삭제하시겠습니까?\n안에 등록된 과목 시험 ${set.exam_count}개와 정답·등급컷이 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    try {
      await apiFetch(`/admin/mock-exam-sets/${set.id}`, { method: "DELETE" });
      await load();
      setNotice("세트를 삭제했습니다.");
    } catch (reason) {
      const message = reason instanceof ApiError ? reason.message : "삭제하지 못했습니다.";
      if (reason instanceof ApiError && reason.status === 400) {
        if (window.confirm(`${message}\n\n대신 보관 처리할까요? 기존 응시 기록은 그대로 보존됩니다.`)) {
          try {
            await apiFetch(`/admin/mock-exam-sets/${set.id}/archive`, { method: "POST" });
            await load();
            setNotice("세트를 보관 처리했습니다.");
            return;
          } catch (archiveError) {
            setError(archiveError instanceof ApiError ? archiveError.message : "보관 처리하지 못했습니다.");
            return;
          }
        }
        return;
      }
      setError(message);
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#2874E8]">SPRINT MOCK EXAM</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">SPRINT 모의고사 관리</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">회차(세트) 단위로 등록하고, 세트 안에 국어·수학·영어·탐구 시험을 넣은 뒤 여러 학생에게 한 번에 배정합니다.</p>
          </div>
          <Link href="/admin/mock-exams/score-templates" className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#17213B] shadow-sm">배점 템플릿 관리 ›</Link>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <div className="mt-6 grid gap-5 lg:grid-cols-[340px_1fr]">
          <form onSubmit={createSet} className="h-fit rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">새 회차 등록</h2>
            <div className="mt-4 space-y-3 text-xs font-bold text-[#7A859F]">
              <label className="block">회차명 (자유 입력: SPRINT 1회 / 1.5회 / FINAL 1회)<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">정렬용 회차 번호 (선택)<input type="number" min="1" value={form.round_no} onChange={(e) => setForm({ ...form, round_no: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <label className="block">시행 예정일 (선택)<input type="date" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            </div>
            <button disabled={saving} className="mt-5 h-12 w-full rounded-2xl bg-[#2874E8] text-sm font-black text-white disabled:opacity-50">{saving ? "생성 중..." : "회차 만들기"}</button>
          </form>

          <section className="space-y-3">
            {sets.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">등록된 회차가 없습니다.</div>}
            {sets.map((set) => (
              <div key={set.id} className="rounded-[24px] bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link href={`/admin/mock-exams/${set.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-[#17213B]">{set.title}</h2>
                      {!set.is_active && <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">보관됨</span>}
                    </div>
                    <p className="mt-1 text-sm font-bold text-[#7A859F]">
                      과목 {set.exam_count}개 · 배정 {set.assigned_student_count}명 · 응시 완료 {set.completed_student_count}명
                      {set.scheduled_at ? ` · 시행 ${set.scheduled_at}` : ""}
                    </p>
                  </Link>
                  <div className="flex shrink-0 gap-2">
                    <Link href={`/admin/mock-exams/${set.id}`} className="rounded-xl bg-[#EAF5FF] px-3 py-2 text-xs font-black text-[#2874E8]">관리</Link>
                    <button data-testid={`delete-set-${set.id}`} onClick={() => void deleteSet(set)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600">삭제</button>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
