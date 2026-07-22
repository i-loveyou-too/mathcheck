"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Question={id:number;order_index:number;english:string;input_answer:string;accepted_answers:string[];is_correct:boolean};
type Result={challenge_name:string;study_date:string;score:number;correct_count:number;total_count:number;submitted_at:string;questions:Question[]};
export default function AdminVocabularyResultPage(){
 const params=useParams<{id:string;sessionId:string}>();const router=useRouter();const [result,setResult]=useState<Result|null>(null);const [error,setError]=useState("");
 useEffect(()=>{if(!getAdmin()){router.push("/admin/login");return;}void apiFetch<Result>(`/admin/vocabulary-results/${params.sessionId}`).then(setResult).catch((reason)=>setError(reason instanceof Error?reason.message:"결과를 불러오지 못했습니다."));},[params.sessionId,router]);
 if(!result)return <main className="min-h-screen bg-[#EEF2F6] p-10 text-center font-bold text-[#7A859F]">{error||"결과를 불러오는 중..."}</main>;
 return <main className="min-h-screen bg-[#EEF2F6] pb-32"><div className="mx-auto max-w-[900px] px-5 py-8"><Link href={`/admin/vocabulary-challenges/${params.id}`} className="text-sm font-black text-[#64748B]">← 챌린지 상세</Link><div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-[28px] bg-[#17213B] p-6 text-white"><div><p className="text-sm font-bold text-[#9EA9FF]">{result.study_date} 제출 결과</p><h1 className="mt-2 text-2xl font-black">{result.challenge_name}</h1><p className="mt-2 text-xs text-white/50">{new Date(result.submitted_at).toLocaleString("ko-KR")}</p></div><div className="text-right"><p className="text-4xl font-black text-[#65E6BA]">{result.score}점</p><p className="mt-1 text-sm text-white/60">{result.correct_count} / {result.total_count} 정답</p></div></div><div className="mt-5 overflow-hidden rounded-[26px] bg-white shadow-card"><table className="w-full text-left text-sm"><thead className="bg-[#F8FAFC] text-xs text-[#7A859F]"><tr><th className="p-4">#</th><th>단어</th><th>학생 답안</th><th>허용 정답</th><th>결과</th></tr></thead><tbody>{result.questions.map((q)=><tr key={q.id} className="border-t border-[#EEF1F5]"><td className="p-4 text-[#98A2B3]">{q.order_index}</td><td className="font-black text-[#17213B]">{q.english}</td><td className={q.is_correct?"text-emerald-600":"text-red-500"}>{q.input_answer||"(빈 답안)"}</td><td className="text-[#667085]">{q.accepted_answers.join(" · ")}</td><td><span className={`rounded-full px-2 py-1 text-xs font-black ${q.is_correct?"bg-emerald-50 text-emerald-600":"bg-red-50 text-red-500"}`}>{q.is_correct?"정답":"오답"}</span></td></tr>)}</tbody></table></div></div><AdminBottomNav/></main>;
}
