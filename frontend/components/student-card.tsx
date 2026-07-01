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
      href={`/admin/students/${id}`}
      className="block rounded-3xl bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-sm font-black text-[#5C5FFF]">
            {name.slice(0, 1)}
          </div>
          <div>
            <p className="font-bold text-gray-900">{name}</p>
            <p className="mt-0.5 text-xs text-gray-500">{grade}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black tracking-tight text-gray-900">
            {Math.round(progressPercentage)}%
          </p>
          <p className="text-xs text-gray-400">전체 진도</p>
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar tone="blue" value={progressPercentage} />
      </div>

      {subjects.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {subjects.map((subject) => (
            <span
              key={subject.id}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
            >
              {subject.name} {Math.round(subject.progressPercentage)}%
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
