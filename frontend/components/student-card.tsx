import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";

type StudentCardProps = {
  id: number;
  name: string;
  grade: string;
  progressPercentage: number;
  subjects?: {
    id: number;
    name: string;
    progressPercentage: number;
  }[];
};

export function StudentCard({ id, name, grade, progressPercentage, subjects = [] }: StudentCardProps) {
  return (
    <Link
      className="block rounded-4xl border border-brand-border bg-white p-5 shadow-card transition hover:-translate-y-0.5"
      href={`/admin/students/${id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-brand-deep">{name}</p>
          <p className="mt-1 text-sm text-brand-muted">{grade}</p>
        </div>
        <span className="rounded-full bg-brand-softYellow px-3 py-1 text-sm font-semibold text-brand-navy">
          {Math.round(progressPercentage)}%
        </span>
      </div>

      <div className="mt-5">
        <ProgressBar value={progressPercentage} />
      </div>

      {subjects.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {subjects.map((subject) => (
            <span
              className="rounded-full bg-brand-bg px-3 py-1 text-xs font-semibold text-brand-muted"
              key={subject.id}
            >
              {subject.name} {Math.round(subject.progressPercentage)}%
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
