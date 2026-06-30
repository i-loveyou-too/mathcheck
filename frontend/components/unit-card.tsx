import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";

type UnitCardProps = {
  id: number;
  name: string;
  completedTasks: number;
  totalTasks: number;
  progressPercentage: number;
};

export function UnitCard({
  id,
  name,
  completedTasks,
  totalTasks,
  progressPercentage,
}: UnitCardProps) {
  return (
    <Link
      className="block rounded-4xl border border-brand-border bg-white p-5 shadow-card transition hover:-translate-y-0.5"
      href={`/student/units/${id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-brand-deep">{name}</p>
          <p className="mt-1 text-sm text-brand-muted">
            {completedTasks} / {totalTasks} 완료
          </p>
        </div>
        <span className="rounded-full bg-brand-softYellow px-3 py-1 text-sm font-semibold text-brand-navy">
          {Math.round(progressPercentage)}%
        </span>
      </div>

      <div className="mt-5">
        <ProgressBar value={progressPercentage} />
      </div>
    </Link>
  );
}
