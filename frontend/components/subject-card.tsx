import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";

type SubjectCardProps = {
  id: number;
  name: string;
  progressPercentage: number;
};

export function SubjectCard({ id, name, progressPercentage }: SubjectCardProps) {
  return (
    <article className="rounded-4xl border border-brand-border bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-brand-deep">{name}</p>
          <p className="mt-1 text-sm text-brand-muted">실전 감각을 차근차근 쌓아가요.</p>
        </div>
        <div className="rounded-full bg-brand-softYellow px-3 py-1 text-sm font-semibold text-brand-navy">
          {Math.round(progressPercentage)}%
        </div>
      </div>

      <div className="mt-5">
        <ProgressBar value={progressPercentage} />
      </div>

      <div className="mt-5 flex justify-end">
        <Link
          className="rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-white"
          href={`/student/subjects/${id}`}
        >
          이어서 하기
        </Link>
      </div>
    </article>
  );
}
