import { formatPercent } from "@/lib/utils";

type ProgressBarProps = {
  value: number;
  tone?: "yellow" | "green" | "blue" | "pink" | "orange" | "mint";
};

const toneClasses: Record<string, string> = {
  yellow: "bg-yellow-400",
  green: "bg-emerald-400",
  blue: "bg-indigo-400",
  pink: "bg-pink-400",
  orange: "bg-orange-400",
  mint: "bg-teal-300",
};

export function ProgressBar({ value, tone = "blue" }: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(value, 100));

  return (
    <div className="space-y-1.5">
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${toneClasses[tone]}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      <p className="text-right text-xs font-semibold text-gray-400">{formatPercent(value)}</p>
    </div>
  );
}
