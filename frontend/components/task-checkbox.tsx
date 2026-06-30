import { cn } from "@/lib/utils";

type TaskCheckboxProps = {
  title: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export function TaskCheckbox({ title, checked, onToggle, disabled }: TaskCheckboxProps) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-4 rounded-3xl border p-4 text-left shadow-card transition",
        checked
          ? "border-brand-yellow bg-brand-softYellow/60"
          : "border-brand-border bg-white",
        disabled ? "opacity-60" : ""
      )}
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
          checked
            ? "border-brand-yellow bg-brand-yellow text-brand-navy"
            : "border-brand-border text-transparent"
        )}
      >
        ✓
      </span>
      <span className={cn("text-sm font-medium", checked ? "text-brand-navy" : "text-brand-text")}>
        {title}
      </span>
    </button>
  );
}
