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
  const isComplete = totalTasks > 0 && completedTasks === totalTasks;

  return (
    <Link
      href={`/student/units/${id}`}
      className="block rounded-3xl bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-gray-900">{name}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {completedTasks} / {totalTasks} 완료
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
            isComplete
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {Math.round(progressPercentage)}%
        </span>
      </div>

      <div className="mt-4">
        <ProgressBar tone={isComplete ? "green" : "blue"} value={progressPercentage} />
      </div>

      <div className="mt-4">
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-4 py-1.5 text-xs font-semibold text-gray-600">
          단원 체크하기 →
        </span>
      </div>
    </Link>
  );
}
