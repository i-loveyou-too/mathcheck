"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/screen-shell";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type Filter="all"|"unresolved"|"mastered";
type Note={id:number;english:string;accepted_answers:string[];latest_wrong_answer:string;latest_wrong_date:string;wrong_count:number;status:"unresolved"|"mastered"};
type Session={id:number;status:string};
export default function VocabularyWrongNotesPage(){
 const router=useRouter();const [studentId,setStudentId]=useState<number|null>(null);const [filter,setFilter]=useState<Filter>("all");const [notes,setNotes]=useState<Note[]>([]);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
 useEffect(()=>{const student=getStudent();if(!student){router.push("/login");return;}setStudentId(student.id);setLoading(true);void apiFetch<Note[]>(`/student/vocabulary/wrong-notes?student_id=${student.id}&status=${filter}`).then(setNotes).catch((reason)=>setError(reason instanceof Error?reason.message:"오답노트를 불러오지 못했습니다.")).finally(()=>setLoading(false));},[filter,router]);
 const review=async()=>{if(!studentId)return;try{const session=await apiFetch<Session>("/student/vocabulary/review-sessions",{method:"POST",body:{student_id:studentId}});router.push(session.status==="submitted"?`/student/vocabulary/result/${session.id}`:`/student/vocabulary/test/${session.id}`);}catch(reason){setError(reason instanceof ApiError?reason.message:"오답 재시험을 시작하지 못했습니다.");}};
 const unresolved=notes.filter((note)=>note.status==="unresolved").length;
 return <ScreenShell withBottomNav><div className="flex items-center justify-between"><div><p className="text-sm font-black text-[#F09A39]">REVIEW POCKET</p><h1 className="mt-1 text-3xl font-black text-[#17213B]">오답노트</h1></div><Link href="/student/vocabulary" className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#667085] shadow-sm">챌린지 홈</Link></div>
  {error&&<p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}<section className="rounded-[26px] bg-[#FFF1C9] p-5"><p className="text-sm font-bold text-[#9A6500]">틀렸던 단어는 여기서 다시 단단해져요.</p><div className="mt-3 flex items-end justify-between"><p className="text-2xl font-black text-[#17213B]">미해결 {filter==="mastered"?0:unresolved}개</p><button onClick={()=>void review()} disabled={!unresolved} className="rounded-2xl bg-[#17213B] px-4 py-3 text-sm font-black text-white disabled:opacity-35">재시험 시작</button></div></section>
  <div className="grid grid-cols-3 rounded-2xl bg-white p-1 shadow-sm">{([['all','전체'],['unresolved','미해결'],['mastered','암기 완료']] as [Filter,string][]).map(([value,label])=><button key={value} onClick={()=>setFilter(value)} className={`rounded-xl py-2.5 text-xs font-black ${filter===value?"bg-[#17213B] text-white":"text-[#8A94A8]"}`}>{label}</button>)}</div>
  <div className="space-y-3">{loading&&<p className="py-8 text-center text-sm font-bold text-[#98A2B3]">불러오는 중...</p>}{!loading&&notes.length===0&&<div className="rounded-[24px] bg-white p-8 text-center"><p className="text-lg font-black text-[#17213B]">해당하는 오답이 없어요</p><p className="mt-2 text-sm text-[#98A2B3]">깔끔합니다. 이 흐름 그대로 가요!</p></div>}{notes.map((note)=><article key={note.id} className="rounded-[22px] bg-white p-5 shadow-card"><div className="flex items-start justify-between"><div><h2 className="text-xl font-black text-[#17213B]">{note.english}</h2><p className="mt-1 text-sm font-bold text-[#19A879]">{note.accepted_answers.join(" · ")}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${note.status==="mastered"?"bg-emerald-50 text-emerald-600":"bg-orange-50 text-orange-600"}`}>{note.status==="mastered"?"암기 완료":"미해결"}</span></div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#F0F2F5] pt-3 text-xs text-[#8A94A8]"><span>최근 오답 <b className="text-[#D95D48]">{note.latest_wrong_answer||"빈 답안"}</b></span><span>틀린 횟수 <b>{note.wrong_count}회</b></span><span>{note.latest_wrong_date}</span></div></article>)}</div><StudentBottomNav/></ScreenShell>;
}
