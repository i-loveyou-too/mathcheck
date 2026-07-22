"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { getStudent } from "@/lib/storage";

type Question = { id: number; order_index: number; english: string; input_answer: string };
type Session = { id: number; challenge_name: string; session_type: string; status: string; total_count: number; questions: Question[] };

export default function SprintVocabularyTestPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = Number(params.sessionId);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("저장됨");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const student = getStudent();
    if (!student) {
      router.push("/login");
      return;
    }
    setStudentId(student.id);
    void apiFetch<Session>(`/student/vocabulary/sessions/${sessionId}?student_id=${student.id}`)
      .then((data) => {
        if (data.status === "submitted") {
          router.replace(`/student/sprint/vocabulary/result/${sessionId}`);
          return;
        }
        setSession(data);
        setValues(Object.fromEntries(data.questions.map((q) => [q.id, q.input_answer])));
        setLoaded(true);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "시험을 불러오지 못했습니다."));
  }, [router, sessionId]);

  useEffect(() => {
    if (!loaded || !studentId || !session) return;
    setSaveState("저장 중...");
    const timer = window.setTimeout(() => {
      void apiFetch(`/student/vocabulary/sessions/${session.id}/answers`, {
        method: "PUT",
        body: { student_id: studentId, answers: session.questions.map((q) => ({ question_id: q.id, input_answer: values[q.id] ?? "" })) },
      }).then(() => setSaveState("저장됨")).catch(() => setSaveState("저장 실패"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [values, loaded, studentId, session]);

  const submit = async () => {
    if (!session || !studentId) return;
    const empty = session.questions.filter((q) => !(values[q.id] ?? "").trim()).length;
    if (empty && !window.confirm(`빈 답안이 ${empty}개 있습니다. 그대로 제출할까요?`)) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/student/vocabulary/sessions/${session.id}/answers`, {
        method: "PUT",
        body: { student_id: studentId, answers: session.questions.map((q) => ({ question_id: q.id, input_answer: values[q.id] ?? "" })) },
      });
      await apiFetch(`/student/vocabulary/sessions/${session.id}/submit`, { method: "POST", body: { student_id: studentId } });
      router.replace(`/student/sprint/vocabulary/result/${session.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "제출하지 못했습니다.");
      setSubmitting(false);
    }
  };

  if (!session) return <main className="min-h-screen bg-[#F4F7F6] p-10 text-center font-bold text-[#7A859F]">{error || "시험지를 준비하는 중..."}</main>;

  const answered = session.questions.filter((q) => (values[q.id] ?? "").trim()).length;
  const empty = session.total_count - answered;

  return (
    <main className="min-h-screen bg-[#F4F7F6] pb-32">
      <header className="sticky top-0 z-10 border-b border-[#DFE9E5] bg-[#F4F7F6]/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto max-w-[680px]">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push("/student/sprint/vocabulary")} className="text-sm font-black text-[#64748B]">챌린지 홈</button>
            <span className={`text-xs font-bold ${saveState === "저장 실패" ? "text-red-500" : "text-[#19A879]"}`}>{saveState}</span>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div><p className="text-xs font-black text-[#19A879]">{session.session_type === "review" ? "WRONG NOTE RETRY" : "SPRINT VOCAB TEST"}</p><h1 className="mt-1 text-2xl font-black text-[#17213B]">{session.challenge_name}</h1></div>
            <p className="text-sm font-black text-[#17213B]">{answered}/{session.total_count}</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#DCE7E3]"><div className="h-full rounded-full bg-[#45D3A2] transition-all" style={{ width: `${session.total_count ? answered / session.total_count * 100 : 0}%` }} /></div>
        </div>
      </header>
      <div className="mx-auto max-w-[680px] px-5 pt-6">
        {error && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
        <div className="mb-5 flex items-center justify-between rounded-2xl bg-[#E7F9F2] px-4 py-3"><p className="text-sm font-bold text-[#276B58]">영어 단어를 보고 한국어 뜻을 입력하세요.</p><span className="shrink-0 text-xs font-black text-[#C46731]">빈칸 {empty}</span></div>
        <div className="space-y-3">
          {session.questions.map((question, index) => (
            <section key={question.id} className="rounded-[22px] border border-[#E2EAE7] bg-white p-5 shadow-[0_8px_25px_rgba(23,33,59,.05)]">
              <div className="flex items-baseline gap-3"><span className="text-xs font-black text-[#A0AAAF]">{String(index + 1).padStart(2, "0")}</span><h2 className="text-2xl font-black tracking-tight text-[#17213B]">{question.english}</h2></div>
              <input ref={(element) => { inputs.current[index] = element; }} value={values[question.id] ?? ""} onChange={(event) => setValues({ ...values, [question.id]: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); inputs.current[index + 1]?.focus(); } }} autoComplete="off" placeholder="한국어 뜻 입력" className="mt-4 h-14 w-full rounded-2xl border-2 border-[#E4E9EC] bg-[#FAFCFB] px-4 text-lg font-bold text-[#17213B] outline-none transition focus:border-[#45D3A2] focus:bg-white" />
            </section>
          ))}
        </div>
        <button disabled={submitting} onClick={() => void submit()} className="mt-7 h-14 w-full rounded-[20px] bg-[#17213B] text-base font-black text-white shadow-xl transition active:scale-[.99] disabled:opacity-50">{submitting ? "채점 중..." : "답안 제출하고 채점하기"}</button>
      </div>
    </main>
  );
}
