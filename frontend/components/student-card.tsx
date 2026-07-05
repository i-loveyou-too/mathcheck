import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";

type SubjectProgress = {
  id: number;
  name: string;
  progressPercentage: number;
};

type StudentCardProps = {
  id: number;
  name: string;
  grade: string;
  progressPercentage: number;
  subjects?: SubjectProgress[];
  variant?: "mobile" | "list";
};

function normalizeSubject(name: string) {
  if (name === "확률과 통계") return "확통";
  return name;
}

function getStatus(progressPercentage: number) {
  if (progressPercentage <= 10) {
    return { label: "진도 낮음", className: "bg-red-50 text-red-500" };
  }
  if (progressPercentage < 25) {
    return { label: "체크 필요", className: "bg-orange-50 text-orange-500" };
  }
  return { label: "진행 중", className: "bg-emerald-50 text-emerald-600" };
}

function getTone(progressPercentage: number): "green" | "orange" | "blue" {
  if (progressPercentage >= 40) return "green";
  if (progressPercentage >= 15) return "orange";
  return "blue";
}

export function StudentCard({
  id,
  name,
  grade,
  progressPercentage,
  subjects = [],
  variant = "mobile",
}: StudentCardProps) {
  const status = getStatus(progressPercentage);
  const visibleSubjects = subjects.slice(0, 3);

  if (variant === "list") {
    return (
      <Link
        className="block rounded-[24px] border border-[#EEF2F7] bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
        href={`/admin/students/${id}`}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-sm font-black text-[#5C5FFF]">
            {name.slice(0, 1)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-[#17213B]">{name}</p>
                <p className="mt-0.5 text-xs font-semibold text-[#98A2B3]">{grade}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-2xl font-black tracking-tight text-[#17213B]">
                  {Math.round(progressPercentage)}%
                </p>
                <p className="text-[11px] font-bold text-[#98A2B3]">전체 진도율</p>
              </div>
            </div>

            <div className="mt-3">
              <ProgressBar tone={getTone(progressPercentage)} value={progressPercentage} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {visibleSubjects.map((subject) => (
                <span
                  className="rounded-full bg-[#F4F6FA] px-3 py-1 text-xs font-bold text-[#667085]"
                  key={subject.id}
                >
                  {normalizeSubject(subject.name)} {Math.round(subject.progressPercentage)}%
                </span>
              ))}
              <span className={`rounded-full px-3 py-1 text-xs font-black ${status.className}`}>
                {status.label}
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      className="block rounded-[28px] border border-[#EEF2F7] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
      href={`/admin/students/${id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-sm font-black text-[#5C5FFF]">
            {name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-black text-[#17213B]">{name}</p>
            <p className="mt-0.5 text-xs font-semibold text-[#98A2B3]">{grade}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <p className="text-[1.8rem] font-black tracking-tight text-[#17213B]">
            {Math.round(progressPercentage)}%
          </p>
          <span className="text-lg font-bold text-[#CBD5E1]">›</span>
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar tone={getTone(progressPercentage)} value={progressPercentage} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {visibleSubjects.map((subject) => (
          <span
            className="rounded-full bg-[#F4F6FA] px-3 py-1 text-xs font-bold text-[#667085]"
            key={subject.id}
          >
            {normalizeSubject(subject.name)} {Math.round(subject.progressPercentage)}%
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end">
        <span className={`rounded-full px-3 py-1 text-xs font-black ${status.className}`}>
          {status.label}
        </span>
      </div>
    </Link>
  );
}
