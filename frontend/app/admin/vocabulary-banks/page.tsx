"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Bank = {
  id: number;
  title: string;
  description: string | null;
  total_words: number;
  total_days: number;
  words_per_day: number;
  default_daily_test_question_count: number;
  source_filename: string | null;
  source_format: string | null;
  word_count: number;
  is_active: boolean;
};

type Preview = {
  title: string;
  source_format: string;
  source_filename: string;
  total_rows: number;
  total_words: number;
  total_days: number;
  words_per_day: number;
  default_daily_test_question_count: number;
  used_sheet_count: number;
  ignored_sheet_count: number;
  duplicate_words: string[];
  errors: string[];
  warnings: string[];
  sample_words: { english: string; raw_meaning: string; accepted_meanings: string[] }[];
};

export default function VocabularyBanksPage() {
  const router = useRouter();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [storagePath, setStoragePath] = useState("storage/word_master_2000.xlsx");
  const [description, setDescription] = useState("공용 워드뱅크");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBanks(await apiFetch<Bank[]>("/admin/vocabulary-banks"));
  };

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "워드뱅크 목록을 불러오지 못했습니다."));
  }, [router]);

  const runPreview = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<Preview>("/admin/vocabulary-banks/import-preview", {
        method: "POST",
        body: { storage_path: storagePath, description },
      });
      setPreview(result);
      setNotice(`미리보기 완료: ${result.total_rows.toLocaleString()}개 단어`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "미리보기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const importBank = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ bank: Bank; warnings: string[] }>("/admin/vocabulary-banks/import", {
        method: "POST",
        body: { storage_path: storagePath, description },
      });
      setNotice(`저장 완료: ${result.bank.title} (${result.bank.word_count.toLocaleString()}개)`);
      setPreview(null);
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1120px] px-5 py-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#19A879]">VOCABULARY SOURCE</p>
            <h1 className="mt-1 text-3xl font-black text-[#17213B]">공용 워드뱅크</h1>
            <p className="mt-2 text-sm text-[#7A859F]">학생별로 복제하지 않는 단어 원본을 관리합니다.</p>
          </div>
          <Link href="/admin/vocabulary-challenges" className="rounded-full bg-[#17213B] px-4 py-2 text-sm font-black text-white">챌린지로 이동</Link>
        </div>

        {error && <p className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mb-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <section className="h-fit rounded-[28px] bg-white p-6 shadow-card">
            <p className="text-xs font-black text-[#6478FF]">XLSX IMPORT</p>
            <h2 className="mt-1 text-xl font-black text-[#17213B]">엑셀 워드뱅크 가져오기</h2>
            <label className="mt-5 block text-xs font-bold text-[#667085]">
              storage 경로
              <input value={storagePath} onChange={(event) => setStoragePath(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[#E5EAF1] px-4 text-sm font-bold outline-none focus:border-[#19A879]" />
            </label>
            <label className="mt-3 block text-xs font-bold text-[#667085]">
              설명
              <input value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 h-12 w-full rounded-2xl border border-[#E5EAF1] px-4 text-sm outline-none focus:border-[#19A879]" />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={runPreview} className="h-12 rounded-2xl bg-[#E8FBF4] text-sm font-black text-[#12815F] disabled:opacity-50">미리보기</button>
              <button disabled={busy || !preview || preview.errors.length > 0} onClick={importBank} className="h-12 rounded-2xl bg-[#17213B] text-sm font-black text-white disabled:opacity-40">DB 저장</button>
            </div>

            {preview && (
              <div className="mt-5 rounded-2xl bg-[#F7F9FC] p-4">
                <div className="mb-4 rounded-2xl bg-white p-3">
                  <p className="text-[11px] font-black text-[#6478FF]">감지한 파일 형식</p>
                  <p className="mt-1 text-sm font-black text-[#17213B]">{preview.source_format}</p>
                  <p className="mt-1 text-xs font-semibold text-[#7A859F]">{preview.title}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-lg font-black text-[#17213B]">{preview.total_words}</p><p className="text-[11px] font-bold text-[#98A2B3]">단어</p></div>
                  <div><p className="text-lg font-black text-[#17213B]">{preview.total_days}</p><p className="text-[11px] font-bold text-[#98A2B3]">DAY</p></div>
                  <div><p className="text-lg font-black text-[#17213B]">{preview.words_per_day}</p><p className="text-[11px] font-bold text-[#98A2B3]">DAY별</p></div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-white p-2"><p className="text-sm font-black text-[#17213B]">{preview.used_sheet_count}</p><p className="text-[11px] font-bold text-[#98A2B3]">사용 시트</p></div>
                  <div className="rounded-xl bg-white p-2"><p className="text-sm font-black text-[#17213B]">{preview.ignored_sheet_count}</p><p className="text-[11px] font-bold text-[#98A2B3]">무시 시트</p></div>
                  <div className="rounded-xl bg-white p-2"><p className="text-sm font-black text-[#17213B]">{preview.default_daily_test_question_count}</p><p className="text-[11px] font-bold text-[#98A2B3]">기본 시험 문항</p></div>
                  <div className="rounded-xl bg-white p-2"><p className="text-sm font-black text-[#17213B]">{preview.duplicate_words.length}</p><p className="text-[11px] font-bold text-[#98A2B3]">중복 단어</p></div>
                </div>
                {preview.errors.length > 0 && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600">오류 {preview.errors.length}개: {preview.errors.slice(0, 3).join(" / ")}</p>}
                {preview.warnings.length > 0 && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-700">경고 {preview.warnings.length}개. 저장은 가능하며 원문 뜻은 보존됩니다.</p>}
                {preview.duplicate_words.length > 0 && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600">중복 단어: {preview.duplicate_words.slice(0, 5).join(", ")}</p>}
                <div className="mt-3 space-y-2">
                  {preview.sample_words.map((word) => (
                    <div key={word.english} className="rounded-xl bg-white px-3 py-2 text-sm">
                      <p className="font-black text-[#17213B]">{word.english}</p>
                      <p className="truncate text-xs font-semibold text-[#7A859F]">{word.accepted_meanings.join(", ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            {banks.length === 0 && <div className="rounded-[28px] bg-white p-10 text-center text-sm font-bold text-[#98A2B3]">아직 저장된 워드뱅크가 없습니다.</div>}
            {banks.map((bank) => (
              <Link href={`/admin/vocabulary-banks/${bank.id}`} key={bank.id} className="flex items-center gap-4 rounded-[24px] border border-white bg-white p-5 shadow-card transition hover:-translate-y-0.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBF4] text-lg font-black text-[#19A879]">WB</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-black text-[#17213B]">{bank.title}</h2>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${bank.is_active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{bank.is_active ? "활성" : "비활성"}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#7A859F]">{bank.word_count.toLocaleString()}개 단어 · {bank.total_days} DAY · DAY별 {bank.words_per_day}개 · 기본 {bank.default_daily_test_question_count}문항</p>
                  <p className="mt-1 text-xs font-bold text-[#98A2B3]">{bank.source_format ?? "manual"} · {bank.source_filename ?? "직접 생성"}</p>
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
