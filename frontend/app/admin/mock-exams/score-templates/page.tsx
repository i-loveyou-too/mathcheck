"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type TemplateItem = { question_no: number; score: number };
type Template = {
  id: number; name: string; subject_category: string | null; question_count: number;
  total_score: number; is_active: boolean; items: TemplateItem[]; usage_count: number | null;
};

const PRESETS = [
  { name: "수학 수능형 30문항", subject: "수학", count: 30 },
  { name: "국어 수능형 45문항", subject: "국어", count: 45 },
  { name: "영어 수능형 45문항", subject: "영어", count: 45 },
  { name: "탐구 수능형 20문항", subject: "탐구", count: 20 },
];

export default function AdminScoreTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("수학 수능형 30문항");
  const [subject, setSubject] = useState("수학");
  const [count, setCount] = useState("30");
  const [scores, setScores] = useState<Record<number, string>>({});
  const [bulkScore, setBulkScore] = useState("3");
  const [editing, setEditing] = useState<number | null>(null);

  const questionCount = Math.max(0, Math.min(100, Number(count) || 0));
  const total = useMemo(
    () => Array.from({ length: questionCount }, (_, i) => Number(scores[i + 1] ?? 0)).reduce((a, b) => a + b, 0),
    [questionCount, scores],
  );

  const load = async () => {
    setTemplates(await apiFetch<Template[]>(`/admin/mock-score-templates?include_inactive=${showInactive}`));
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다."));
  }, [router, showInactive]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(""); setNotice("");
    try { await action(); await load(); setNotice(message); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "요청을 처리하지 못했습니다."); }
  };

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setName(preset.name); setSubject(preset.subject); setCount(String(preset.count));
    setScores({});
  };

  const applyBulk = () => {
    const value = String(Number(bulkScore) || 0);
    setScores(Object.fromEntries(Array.from({ length: questionCount }, (_, i) => [i + 1, value])));
  };

  const save = () => {
    const items = Array.from({ length: questionCount }, (_, i) => ({ question_no: i + 1, score: Number(scores[i + 1] ?? 0) }));
    if (items.length === 0) { setError("문항 수를 입력하세요."); return; }
    const body = { name, subject_category: subject || null, total_score: total, items };
    if (editing !== null) {
      void run(() => apiFetch(`/admin/mock-score-templates/${editing}`, { method: "PATCH", body: { ...body, total_score: total } }), "템플릿을 수정했습니다.");
      setEditing(null);
    } else {
      void run(() => apiFetch("/admin/mock-score-templates", { method: "POST", body }), "템플릿을 만들었습니다.");
    }
    setScores({});
  };

  const startEdit = (template: Template) => {
    setEditing(template.id);
    setName(template.name);
    setSubject(template.subject_category ?? "");
    setCount(String(template.question_count));
    setScores(Object.fromEntries(template.items.map((i) => [i.question_no, String(i.score)])));
  };

  const remove = (template: Template) => {
    if (!window.confirm(`"${template.name}" 템플릿을 삭제하시겠습니까?`)) return;
    void run(async () => {
      try {
        await apiFetch(`/admin/mock-score-templates/${template.id}`, { method: "DELETE" });
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 400) {
          if (window.confirm(`${reason.message}\n\n대신 비활성화할까요?`)) {
            await apiFetch(`/admin/mock-score-templates/${template.id}`, { method: "PATCH", body: { is_active: false } });
            return;
          }
        }
        throw reason;
      }
    }, "처리했습니다.");
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <Link href="/admin/mock-exams" className="text-sm font-bold text-[#64748B]">← 모의고사 관리</Link>
        <div className="mt-4">
          <p className="text-sm font-bold text-[#2874E8]">SCORE TEMPLATE</p>
          <h1 className="mt-1 text-3xl font-black text-[#17213B]">배점 템플릿 관리</h1>
          <p className="mt-2 text-sm font-semibold text-[#7A859F]">시험지 생성 시 템플릿을 고르면 문항별 배점이 시험지에 복사됩니다. 이후 템플릿을 고쳐도 기존 시험지 배점은 바뀌지 않습니다.</p>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <div className="mt-6 grid gap-5 lg:grid-cols-[420px_1fr]">
          <section className="h-fit rounded-[24px] bg-white p-6 shadow-card">
            <h2 className="text-lg font-black text-[#17213B]">{editing !== null ? "템플릿 수정" : "새 템플릿"}</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => <button key={p.name} onClick={() => applyPreset(p)} className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-[11px] font-bold text-[#17213B]">{p.name}</button>)}
            </div>
            <div className="mt-3 space-y-2 text-xs font-bold text-[#7A859F]">
              <label className="block">이름<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10 w-full rounded-lg bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">과목 구분<input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-10 w-full rounded-lg bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
                <label className="block">문항 수<input type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} className="mt-1 h-10 w-full rounded-lg bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex-1">전체 일괄 배점<input type="number" min="0" value={bulkScore} onChange={(e) => setBulkScore(e.target.value)} className="mt-1 h-10 w-full rounded-lg bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
                <button onClick={applyBulk} className="h-10 rounded-lg bg-[#17213B] px-3 text-xs font-black text-white">일괄 적용</button>
              </div>
            </div>

            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-[#EEF1F7] p-2">
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: questionCount }, (_, i) => i + 1).map((no) => (
                  <label key={no} className="text-[10px] font-bold text-[#98A2B3]">{no}
                    <input type="number" min="0" value={scores[no] ?? ""} onChange={(e) => setScores({ ...scores, [no]: e.target.value })} className="mt-0.5 block h-8 w-full rounded bg-[#F5F6FA] px-1 text-center text-xs text-[#17213B]" />
                  </label>
                ))}
              </div>
            </div>
            <p className="mt-2 text-sm font-black text-[#17213B]">현재 합계: <span className="text-[#2874E8]">{total}점</span></p>

            <div className="mt-3 flex gap-2">
              <button onClick={save} className="h-10 flex-1 rounded-lg bg-[#2874E8] text-xs font-black text-white">{editing !== null ? "수정 저장" : "템플릿 만들기"}</button>
              {editing !== null && <button onClick={() => { setEditing(null); setScores({}); }} className="h-10 rounded-lg bg-[#F0F2F8] px-4 text-xs font-black text-[#17213B]">취소</button>}
            </div>
          </section>

          <section className="space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold text-[#7A859F]">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 accent-[#2874E8]" />
              비활성 템플릿도 보기
            </label>
            {templates.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-sm font-bold text-[#98A2B3] shadow-card">등록된 템플릿이 없습니다.</div>}
            {templates.map((template) => (
              <article key={template.id} className="rounded-[24px] bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-[#17213B]">{template.name}</h3>
                      {!template.is_active && <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">비활성</span>}
                    </div>
                    <p className="mt-1 text-xs font-bold text-[#7A859F]">
                      {template.subject_category ?? "-"} · {template.question_count}문항 · 총 {template.total_score}점
                      {template.usage_count !== null ? ` · 사용 중 ${template.usage_count}개 시험지` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => startEdit(template)} className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">수정</button>
                    <button onClick={() => void run(() => apiFetch(`/admin/mock-score-templates/${template.id}/duplicate`, { method: "POST" }), "복제했습니다.")} className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">복제</button>
                    <button onClick={() => void run(() => apiFetch(`/admin/mock-score-templates/${template.id}`, { method: "PATCH", body: { is_active: !template.is_active } }), "변경했습니다.")} className="rounded-lg bg-[#F0F2F8] px-2.5 py-1.5 text-xs font-bold text-[#17213B]">{template.is_active ? "비활성화" : "활성화"}</button>
                    <button onClick={() => remove(template)} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600">삭제</button>
                  </div>
                </div>
                <div className="mt-2 max-h-16 overflow-y-auto text-[11px] text-[#98A2B3]">
                  {template.items.map((i) => <span key={i.question_no} className="mr-2 inline-block">{i.question_no}:{i.score}</span>)}
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
      <AdminBottomNav />
    </main>
  );
}
