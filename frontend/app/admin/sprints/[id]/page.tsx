"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch, ApiError } from "@/lib/api";
import { getAdmin } from "@/lib/storage";

type Goal = {
  id: number; title: string; description: string | null; target_value: number | null;
  current_value: number; unit: string | null; order_index: number; is_completed: boolean; progress: number | null;
};
type Sprint = {
  id: number; student_id: number; student_name: string; title: string; description: string | null;
  start_date: string; end_date: string; is_active: boolean; daily_study_goal_minutes: number | null;
  planner_deadline_time: string | null; seat_check_deadline_time: string | null;
  planner_strike_on_late: boolean; planner_strike_on_missing: boolean;
  seat_check_strike_on_late: boolean; seat_check_strike_on_missing: boolean;
  strike_threshold: number; penalty_word_count: number; penalty_repetition_count: number; penalty_due_hours: number;
  status: string; day_info: { day_number: number; total_days: number; days_remaining: number };
  features: Record<string, boolean>; goals: Goal[]; overall_goal_progress: number | null;
  strike_summary: { effective: number; threshold: number };
};
type Strike = {
  id: number; strike_type: string; reason: string | null; learning_date: string;
  is_cancelled: boolean; cancelled_reason: string | null; created_at: string;
};
type StrikeList = { summary: { effective: number; threshold: number; total_active: number; consumed_by_penalties: number }; strikes: Strike[] };

const featureLabels: Record<string, string> = {
  enable_seat_check: "착석 인증", enable_planner_submission: "플래너 제출", enable_study_timer: "공부시간 기록",
  enable_vocabulary: "영단어 챌린지", enable_mock_exam: "모의고사", enable_goals: "기간 목표",
  enable_three_strikes: "삼진아웃", enable_penalty_assignment: "깜지",
};
featureLabels.enable_seat_check = "착석 인증";
featureLabels.enable_planner_submission = "플래너 제출";
featureLabels.enable_study_time_submission = "공부시간 인증";

const strikeTypes = [
  ["manual", "수동"], ["seat_check_late", "착석 지각"], ["seat_check_missing", "착석 미제출"],
  ["planner_late", "플래너 지각"], ["planner_missing", "플래너 미제출"], ["vocabulary_missing", "영단어 미응시"],
  ["study_time_missing", "공부시간 미제출"], ["study_time_shortage", "공부시간 부족"],
  ["mock_exam_late", "모의고사 지각"], ["mock_exam_missing", "모의고사 미응시"],
] as const;
const today = new Date().toISOString().slice(0, 10);

type ComplianceRun = {
  id: number; target_date_from: string; target_date_to: string; run_type: string; dry_run: boolean;
  status: string; started_at: string; finished_at: string | null; evaluated_students: number;
  created_strikes: number; cancelled_strikes: number; pending_count: number; skipped_count: number;
  error_message: string | null;
};
type ComplianceEvaluateResult = {
  status: string; evaluated_students: number; created_strikes: number; cancelled_strikes: number;
  pending_count: number; skipped_count: number; dry_run: boolean; errors: string[];
  details: { created_strikes: string[]; cancelled_strikes: string[]; pending_review: string[]; skipped_due_to_daily_limit: string[] }[];
};

export default function AdminSprintDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [strikes, setStrikes] = useState<StrikeList | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [goalForm, setGoalForm] = useState({ title: "", target_value: "", unit: "" });
  const [strikeForm, setStrikeForm] = useState({ strike_type: "manual", reason: "", learning_date: today });
  const [complianceRuns, setComplianceRuns] = useState<ComplianceRun[]>([]);
  const [complianceDate, setComplianceDate] = useState(today);
  const [complianceBusy, setComplianceBusy] = useState(false);
  const [complianceResult, setComplianceResult] = useState<ComplianceEvaluateResult | null>(null);

  const load = async () => {
    const [s, st, runs] = await Promise.all([
      apiFetch<Sprint>(`/admin/sprints/${id}`),
      apiFetch<StrikeList>(`/admin/sprints/${id}/strikes`),
      apiFetch<ComplianceRun[]>(`/admin/sprints/${id}/compliance/runs?limit=5`),
    ]);
    setSprint(s); setStrikes(st); setComplianceRuns(runs);
  };

  useEffect(() => {
    if (!getAdmin()) { router.push("/admin/login"); return; }
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "불러오지 못했습니다."));
  }, [router, id]);

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(""), 2000); };
  const wrap = async (fn: () => Promise<void>, ok: string) => {
    setError("");
    try { await fn(); await load(); flash(ok); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "처리하지 못했습니다."); }
  };

  const patchSprint = (body: Record<string, unknown>) =>
    wrap(async () => { await apiFetch(`/admin/sprints/${id}`, { method: "PATCH", body }); }, "저장되었습니다.");

  const addGoal = (e: React.FormEvent) => { e.preventDefault(); void wrap(async () => {
    await apiFetch(`/admin/sprints/${id}/goals`, { method: "POST", body: {
      title: goalForm.title, target_value: goalForm.target_value ? Number(goalForm.target_value) : null,
      unit: goalForm.unit || null,
    }});
    setGoalForm({ title: "", target_value: "", unit: "" });
  }, "목표를 추가했습니다."); };

  const updateGoalValue = (goal: Goal, current: number) =>
    void wrap(async () => { await apiFetch(`/admin/sprint-goals/${goal.id}`, { method: "PATCH", body: { current_value: current } }); }, "목표를 수정했습니다.");
  const toggleGoalDone = (goal: Goal) =>
    void wrap(async () => { await apiFetch(`/admin/sprint-goals/${goal.id}`, { method: "PATCH", body: { is_completed: !goal.is_completed } }); }, "저장되었습니다.");
  const deleteGoal = (goal: Goal) => { if (!confirm("목표를 삭제할까요?")) return; void wrap(async () => { await apiFetch(`/admin/sprint-goals/${goal.id}`, { method: "DELETE" }); }, "삭제했습니다."); };

  const addStrike = (e: React.FormEvent) => { e.preventDefault(); void wrap(async () => {
    await apiFetch(`/admin/sprints/${id}/strikes`, { method: "POST", body: {
      strike_type: strikeForm.strike_type, reason: strikeForm.reason || null, learning_date: strikeForm.learning_date,
    }});
    setStrikeForm({ strike_type: "manual", reason: "", learning_date: today });
  }, "스트라이크를 추가했습니다."); };
  const cancelStrike = (strike: Strike) => { const reason = prompt("취소 사유를 입력하세요 (선택)") ?? undefined; void wrap(async () => { await apiFetch(`/admin/sprint-strikes/${strike.id}/cancel`, { method: "POST", body: { cancelled_reason: reason } }); }, "취소했습니다."); };

  const runCompliance = async (dryRun: boolean) => {
    if (complianceBusy) return; // 중복 클릭 방지
    setComplianceBusy(true);
    setError("");
    setComplianceResult(null);
    try {
      const result = await apiFetch<ComplianceEvaluateResult>(`/admin/sprints/${id}/compliance/evaluate`, {
        method: "POST",
        body: { learning_date: complianceDate, dry_run: dryRun },
      });
      setComplianceResult(result);
      await load();
      flash(dryRun ? "dry-run 결과를 확인하세요." : "자동 판정을 실행했습니다.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "자동 판정 실행에 실패했습니다.");
    } finally {
      setComplianceBusy(false);
    }
  };

  if (!sprint) return <main className="min-h-screen bg-[#EEF2F6] p-10"><p className="text-center font-bold text-[#7A859F]">{error || "불러오는 중..."}</p></main>;

  return <main className="min-h-screen bg-[#EEF2F6] pb-32">
    <div className="mx-auto max-w-[1100px] px-5 py-8">
      <Link href="/admin/sprints" className="text-sm font-bold text-[#7A859F]">← SPRINT 목록</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-black text-[#17213B]">{sprint.title}</h1><p className="mt-1 text-sm font-semibold text-[#7A859F]">{sprint.student_name} · {sprint.start_date} ~ {sprint.end_date} · {sprint.status === "active" ? `DAY ${sprint.day_info.day_number}/${sprint.day_info.total_days}` : sprint.status === "scheduled" ? "예정" : "종료"}</p></div>
        <button onClick={() => void patchSprint({ is_active: !sprint.is_active })} className={`rounded-full px-4 py-2 text-sm font-black ${sprint.is_active ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-600"}`}>{sprint.is_active ? "활성" : "비활성"}</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/admin/sprints/${id}/proofs`} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#5C63FF] shadow-sm">플래너·착석 인증 관리</Link>
        <Link href={`/admin/sprints/${id}/study-time`} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#5C63FF] shadow-sm">공부시간 인증 검수</Link>
        <Link href={`/admin/sprints/${id}/mock-exams`} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#5C63FF] shadow-sm">모의고사 관리</Link>
        <Link href={`/admin/sprints/${id}/worksheets`} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#5C63FF] shadow-sm">문제지 관리</Link>
        <Link href={`/admin/sprints/${id}/goals`} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#5C63FF] shadow-sm">과목별 목표 관리</Link>
      </div>
      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>}
      {msg && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600">{msg}</p>}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* 기능 토글 */}
        <section className="rounded-[24px] bg-white p-6 shadow-card">
          <h2 className="text-lg font-black text-[#17213B]">사용 기능</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {Object.keys(featureLabels).map((key) => (
              <button key={key} onClick={() => void patchSprint({ [key]: !sprint.features[key] })} className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${sprint.features[key] ? "bg-[#5C63FF] text-white" : "bg-[#F0F2F8] text-[#98A2B3]"}`}>{featureLabels[key]}</button>
            ))}
          </div>
        </section>

        {/* 삼진아웃 설정 */}
        <section className="rounded-[24px] bg-white p-6 shadow-card">
          <h2 className="text-lg font-black text-[#17213B]">삼진아웃·깜지 설정</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold text-[#7A859F]">
            <label>삼진 기준<input type="number" min="1" defaultValue={sprint.strike_threshold} onBlur={(e) => Number(e.target.value) !== sprint.strike_threshold && void patchSprint({ strike_threshold: Number(e.target.value) })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            <label>깜지 단어수<input type="number" min="1" defaultValue={sprint.penalty_word_count} onBlur={(e) => Number(e.target.value) !== sprint.penalty_word_count && void patchSprint({ penalty_word_count: Number(e.target.value) })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            <label>단어별 반복<input type="number" min="1" defaultValue={sprint.penalty_repetition_count} onBlur={(e) => Number(e.target.value) !== sprint.penalty_repetition_count && void patchSprint({ penalty_repetition_count: Number(e.target.value) })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
            <label>깜지 제한(시간)<input type="number" min="1" defaultValue={sprint.penalty_due_hours} onBlur={(e) => Number(e.target.value) !== sprint.penalty_due_hours && void patchSprint({ penalty_due_hours: Number(e.target.value) })} className="mt-1 h-11 w-full rounded-xl bg-[#F5F6FA] px-3 text-[#17213B]" /></label>
          </div>
        </section>

        {/* 목표 관리 */}
        <section className="rounded-[24px] bg-white p-6 shadow-card">
          <div className="flex items-center justify-between"><h2 className="text-lg font-black text-[#17213B]">기간 목표</h2><span className="text-xs font-black text-[#5C63FF]">전체 {sprint.overall_goal_progress === null ? "미등록" : `${sprint.overall_goal_progress}%`}</span></div>
          <div className="mt-4 space-y-2">
            {sprint.goals.length === 0 && <p className="rounded-xl bg-[#F7F8FB] px-4 py-3 text-sm font-bold text-[#98A2B3]">등록된 목표가 없습니다.</p>}
            {sprint.goals.map((goal) => (
              <div key={goal.id} className="rounded-xl border border-[#EEF1F7] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-[#17213B]">{goal.title}</p>
                  <button onClick={() => deleteGoal(goal)} className="text-xs font-bold text-red-400">삭제</button>
                </div>
                {goal.target_value ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input type="number" defaultValue={goal.current_value} onBlur={(e) => Number(e.target.value) !== goal.current_value && updateGoalValue(goal, Number(e.target.value))} className="h-9 w-24 rounded-lg bg-[#F5F6FA] px-2 text-sm text-[#17213B]" />
                    <span className="text-xs font-bold text-[#7A859F]">/ {goal.target_value} {goal.unit ?? ""} · {goal.progress}%</span>
                  </div>
                ) : (
                  <button onClick={() => toggleGoalDone(goal)} className={`mt-2 rounded-full px-3 py-1 text-xs font-black ${goal.is_completed ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{goal.is_completed ? "완료됨" : "미완료 (정성 목표)"}</button>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={addGoal} className="mt-4 space-y-2 rounded-xl bg-[#F7F8FB] p-3">
            <input required placeholder="목표명" value={goalForm.title} onChange={(e) => setGoalForm({...goalForm, title:e.target.value})} className="h-10 w-full rounded-lg bg-white px-3 text-sm text-[#17213B]" />
            <div className="flex gap-2">
              <input type="number" placeholder="목표수치(선택)" value={goalForm.target_value} onChange={(e) => setGoalForm({...goalForm, target_value:e.target.value})} className="h-10 w-full rounded-lg bg-white px-3 text-sm text-[#17213B]" />
              <input placeholder="단위(선택)" value={goalForm.unit} onChange={(e) => setGoalForm({...goalForm, unit:e.target.value})} className="h-10 w-24 rounded-lg bg-white px-3 text-sm text-[#17213B]" />
            </div>
            <button className="h-10 w-full rounded-lg bg-[#5C63FF] text-sm font-black text-white">목표 추가</button>
          </form>
        </section>

        {/* 스트라이크 관리 */}
        <section className="rounded-[24px] bg-white p-6 shadow-card">
          <div className="flex items-center justify-between"><h2 className="text-lg font-black text-[#17213B]">스트라이크</h2><span className="text-sm font-black text-[#E5533C]">유효 {strikes?.summary.effective}/{strikes?.summary.threshold}</span></div>
          {strikes && <p className="mt-1 text-xs font-bold text-[#98A2B3]">누적 {strikes.summary.total_active} · 깜지 소진 {strikes.summary.consumed_by_penalties}</p>}
          <form onSubmit={addStrike} className="mt-4 space-y-2 rounded-xl bg-[#FFF6F3] p-3">
            <select value={strikeForm.strike_type} onChange={(e) => setStrikeForm({...strikeForm, strike_type:e.target.value})} className="h-10 w-full rounded-lg bg-white px-3 text-sm text-[#17213B]">{strikeTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <div className="flex gap-2">
              <input type="date" value={strikeForm.learning_date} onChange={(e) => setStrikeForm({...strikeForm, learning_date:e.target.value})} className="h-10 w-40 rounded-lg bg-white px-3 text-sm text-[#17213B]" />
              <input placeholder="사유(선택)" value={strikeForm.reason} onChange={(e) => setStrikeForm({...strikeForm, reason:e.target.value})} className="h-10 flex-1 rounded-lg bg-white px-3 text-sm text-[#17213B]" />
            </div>
            <button className="h-10 w-full rounded-lg bg-[#E5533C] text-sm font-black text-white">스트라이크 추가</button>
          </form>
          <div className="mt-4 space-y-2">
            {strikes?.strikes.length === 0 && <p className="rounded-xl bg-[#F7F8FB] px-4 py-3 text-sm font-bold text-[#98A2B3]">스트라이크 이력이 없습니다.</p>}
            {strikes?.strikes.map((strike) => (
              <div key={strike.id} className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${strike.is_cancelled ? "border-gray-100 bg-gray-50 opacity-60" : "border-[#FFE0D6] bg-white"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#17213B]">{strikeTypes.find((t) => t[0] === strike.strike_type)?.[1] ?? strike.strike_type} · {strike.learning_date}{strike.is_cancelled && " (취소됨)"}</p>
                  <p className="truncate text-xs font-semibold text-[#7A859F]">{strike.reason || "사유 없음"}{strike.cancelled_reason && ` · 취소: ${strike.cancelled_reason}`}</p>
                </div>
                {!strike.is_cancelled && <button onClick={() => cancelStrike(strike)} className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600">취소</button>}
              </div>
            ))}
          </div>
        </section>

        {/* 자동 판정 */}
        <section className="rounded-[24px] bg-white p-6 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-[#17213B]">자동 판정</h2>
            {complianceRuns[0] && (
              <span className="text-xs font-bold text-[#98A2B3]">
                마지막 실행: {new Date(complianceRuns[0].started_at).toLocaleString("ko-KR")} ({complianceRuns[0].target_date_from})
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-semibold text-[#7A859F]">
            마감 이후 플래너·착석·공부시간·영단어 위반 사항을 규칙에 따라 자동으로 판정하고 스트라이크를 부여합니다.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-[#7A859F]">대상 학습일
              <input type="date" value={complianceDate} onChange={(e) => setComplianceDate(e.target.value)} className="mt-1 h-11 w-44 rounded-xl bg-[#F5F6FA] px-3 text-sm text-[#17213B]" />
            </label>
            <button disabled={complianceBusy} onClick={() => void runCompliance(true)} className="h-11 rounded-xl bg-[#F0F2F8] px-4 text-sm font-black text-[#17213B] disabled:opacity-50">
              {complianceBusy ? "처리 중..." : "dry-run"}
            </button>
            <button disabled={complianceBusy} onClick={() => void runCompliance(false)} className="h-11 rounded-xl bg-[#5C63FF] px-4 text-sm font-black text-white disabled:opacity-50">
              {complianceBusy ? "처리 중..." : "실제 실행"}
            </button>
          </div>

          {complianceResult && (
            <div className={`mt-4 rounded-xl p-3 text-xs font-bold ${complianceResult.dry_run ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
              <p>{complianceResult.dry_run ? "DRY-RUN 결과 (DB 미반영)" : "실행 결과"} · 생성 {complianceResult.created_strikes} · 취소 {complianceResult.cancelled_strikes} · 보류 {complianceResult.pending_count} · 상한 초과로 생략 {complianceResult.skipped_count}</p>
              {complianceResult.errors.length > 0 && <p className="mt-1 text-red-600">오류: {complianceResult.errors.join(", ")}</p>}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <p className="text-xs font-black text-[#98A2B3]">최근 실행 결과</p>
            {complianceRuns.length === 0 && <p className="rounded-xl bg-[#F7F8FB] px-4 py-3 text-sm font-bold text-[#98A2B3]">실행 이력이 없습니다.</p>}
            {complianceRuns.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EEF1F7] p-3 text-xs font-bold text-[#7A859F]">
                <span>{run.target_date_from}{run.target_date_from !== run.target_date_to ? ` ~ ${run.target_date_to}` : ""} · {run.dry_run ? "dry-run" : "실제 실행"} · {run.status === "completed" ? "완료" : run.status === "failed" ? "오류" : "실행 중"}</span>
                <span>생성 {run.created_strikes} · 취소 {run.cancelled_strikes} · 보류 {run.pending_count} · 생략 {run.skipped_count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div><AdminBottomNav />
  </main>;
}
