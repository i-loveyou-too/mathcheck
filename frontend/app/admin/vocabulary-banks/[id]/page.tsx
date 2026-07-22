"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

type BankWord = {
  id: number;
  day_no: number;
  order_index: number;
  day_order: number;
  english: string;
  accepted_meanings: string[];
  raw_meaning: string;
  memo: string | null;
};

export default function VocabularyBankDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bankId = Number(params.id);
  const [bank, setBank] = useState<Bank | null>(null);
  const [words, setWords] = useState<BankWord[]>([]);
  const [dayNo, setDayNo] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async (targetDay = dayNo) => {
    const result = await apiFetch<{ bank: Bank; words: BankWord[] }>(`/admin/vocabulary-banks/${bankId}?day_no=${targetDay}`);
    setBank(result.bank);
    setWords(result.words);
  };

  useEffect(() => {
    if (!getAdmin()) {
      router.push("/admin/login");
      return;
    }
    void load(1).catch((reason) => setError(reason instanceof Error ? reason.message : "워드뱅크를 불러오지 못했습니다."));
  }, [bankId, router]);

  const changeDay = (nextDay: number) => {
    setDayNo(nextDay);
    void load(nextDay).catch((reason) => setError(reason instanceof Error ? reason.message : "DAY 단어를 불러오지 못했습니다."));
  };

  const editWord = async (word: BankWord) => {
    const english = window.prompt("영어 단어", word.english);
    if (english === null) return;
    const meanings = window.prompt("허용 뜻, 쉼표로 구분", word.accepted_meanings.join(", "));
    if (meanings === null) return;
    const memo = window.prompt("메모", word.memo ?? "");
    if (memo === null) return;
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/vocabulary-bank-words/${word.id}`, {
        method: "PATCH",
        body: {
          english,
          accepted_meanings: meanings.split(",").map((value) => value.trim()).filter(Boolean),
          memo: memo || null,
        },
      });
      setNotice("단어를 수정했습니다.");
      await load(dayNo);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "단어 수정에 실패했습니다.");
    }
  };

  const toggleBank = async () => {
    if (!bank) return;
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/vocabulary-banks/${bank.id}`, {
        method: "PATCH",
        body: {
          title: bank.title,
          description: bank.description,
          total_words: bank.total_words,
          total_days: bank.total_days,
          words_per_day: bank.words_per_day,
          default_daily_test_question_count: bank.default_daily_test_question_count,
          source_filename: bank.source_filename,
          source_format: bank.source_format,
          is_active: !bank.is_active,
        },
      });
      setNotice(bank.is_active ? "워드뱅크를 비활성화했습니다." : "워드뱅크를 활성화했습니다.");
      await load(dayNo);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "상태 변경에 실패했습니다.");
    }
  };

  if (!bank) {
    return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error || "불러오는 중..."}</main>;
  }

  return (
    <main className="min-h-screen bg-[#EEF2F6] pb-32">
      <div className="mx-auto max-w-[1120px] px-5 py-8">
        <Link href="/admin/vocabulary-banks" className="text-sm font-bold text-[#64748B]">← 워드뱅크 목록</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#17213B]">{bank.title}</h1>
            <p className="mt-2 text-sm font-semibold text-[#7A859F]">{bank.word_count.toLocaleString()}개 단어 · {bank.total_days} DAY · DAY별 {bank.words_per_day}개 · 기본 {bank.default_daily_test_question_count}문항</p>
            <p className="mt-1 text-xs font-bold text-[#98A2B3]">{bank.source_format ?? "manual"} · {bank.source_filename ?? "직접 생성"}</p>
          </div>
          <button onClick={toggleBank} className={`rounded-full px-4 py-2 text-sm font-black ${bank.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>{bank.is_active ? "활성 운영 중" : "비활성"}</button>
        </div>

        {error && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        {notice && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

        <section className="mt-6 rounded-[28px] bg-white p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#6478FF]">DAY WORDS</p>
              <h2 className="mt-1 text-xl font-black text-[#17213B]">Day {String(dayNo).padStart(2, "0")}</h2>
            </div>
            <select value={dayNo} onChange={(event) => changeDay(Number(event.target.value))} className="h-12 rounded-2xl border border-[#E5EAF1] px-4 text-sm font-black text-[#17213B]">
              {Array.from({ length: bank.total_days }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Day {String(day).padStart(2, "0")}</option>)}
            </select>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {words.map((word) => (
              <div key={word.id} className="rounded-2xl border border-[#EEF1F5] p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1 w-8 text-xs font-black text-[#A0A8B8]">{word.day_order}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-[#17213B]">{word.english}</p>
                    <p className="mt-1 text-sm font-semibold text-[#7A859F]">{word.accepted_meanings.join(", ")}</p>
                    <p className="mt-2 text-xs text-[#98A2B3]">원문: {word.raw_meaning}</p>
                  </div>
                  <button onClick={() => void editWord(word)} className="rounded-xl bg-[#F1F5F9] px-3 py-2 text-xs font-black text-[#475569]">수정</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <AdminBottomNav />
    </main>
  );
}
