import { formatPercent } from "@/lib/utils";

type ProgressBarProps = {
  value: number;
};

export function ProgressBar({ value }: ProgressBarProps) {
  return (
    <div className="space-y-2">
      <div className="h-3 overflow-hidden rounded-full bg-brand-border">
        <div
          className="h-full rounded-full bg-brand-yellow transition-all"
          style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
        />
      </div>
      <p className="text-right text-sm font-semibold text-brand-muted">{formatPercent(value)}</p>
    </div>
  );
}
