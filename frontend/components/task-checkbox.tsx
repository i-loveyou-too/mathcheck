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
        "flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all",
        checked
          ? "border-emerald-100 bg-emerald-50"
          : "border-gray-100 bg-white hover:border-gray-200",
        disabled ? "opacity-60" : ""
      )}
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all",
          checked
            ? "bg-emerald-500 text-white"
            : "border-2 border-gray-200 bg-white text-transparent"
        )}
      >
        ✓
      </span>
      <span
        className={cn(
          "flex-1 text-sm font-medium leading-relaxed",
          checked ? "text-gray-400 line-through" : "text-gray-800"
        )}
      >
        {title}
      </span>
      {disabled ? (
        <span className="shrink-0 text-xs text-gray-300">저장 중</span>
      ) : null}
    </button>
  );
}
