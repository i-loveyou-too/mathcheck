import { formatPercent } from "@/lib/utils";

type ProgressBarProps = {
  value: number;
  tone?: "yellow" | "green" | "blue" | "pink" | "orange" | "mint" | "red";
};

const fillClasses: Record<string, string> = {
  yellow: "bg-[#FACC15]",
  green: "bg-emerald-500",
  blue: "bg-indigo-500",
  pink: "bg-pink-500",
  orange: "bg-orange-400",
  mint: "bg-teal-400",
  // Student-app brand tone (general pages only). Additive — existing tones above are
  // unchanged so admin screens that already pass them keep their current look.
  red: "bg-[#E86F6B]",
};

const trackClasses: Record<string, string> = {
  yellow: "bg-amber-100",
  green: "bg-emerald-100",
  blue: "bg-indigo-100",
  pink: "bg-pink-100",
  orange: "bg-orange-100",
  mint: "bg-teal-100",
  red: "bg-[#FFF1F0]",
};

export function ProgressBar({ value, tone = "blue" }: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(value, 100));

  return (
    <div className="space-y-1">
      <div className={`h-2 overflow-hidden rounded-full ${trackClasses[tone] ?? "bg-gray-100"}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${fillClasses[tone] ?? "bg-gray-400"}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      <p className="text-right text-[11px] font-semibold tabular-nums text-gray-400">
        {formatPercent(value)}
      </p>
    </div>
  );
}
