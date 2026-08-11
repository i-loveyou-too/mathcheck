/**
 * Shared visual tokens for general student pages (everything under app/student EXCEPT
 * app/student/sprint). Sprint keeps its own existing look — do not import this file from
 * any file under app/student/sprint or from a component that Sprint also renders.
 *
 * These are plain className strings (not a component) so every call site keeps its own
 * element type, href/onClick, and props exactly as before — only the className value changes.
 */

export const studentButton = {
  primary:
    "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#E86F6B] px-5 text-[15px] font-bold text-white transition hover:bg-[#DC625E] active:bg-[#C8433F] disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-[#98A2B3]",
  secondary:
    "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-5 text-[15px] font-bold text-[#1F2933] transition hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:text-[#98A2B3]",
  tertiary:
    "inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold text-[#E86F6B] transition hover:bg-[#FFF1F0] disabled:cursor-not-allowed disabled:text-[#98A2B3]",
  danger:
    "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#DC2626] px-5 text-[15px] font-bold text-white transition hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-[#98A2B3]",
} as const;

export const studentPanel = {
  // Standard card/section container.
  base: "rounded-[20px] border border-[#E5E7EB] bg-white shadow-card",
  // Small nested tile (stat tiles, chips) — one step down from the panel radius.
  tile: "rounded-2xl border border-[#E5E7EB] bg-white",
  modal: "rounded-[24px] border border-[#E5E7EB] bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.12)]",
} as const;

export const studentInput =
  "h-[52px] w-full rounded-2xl border border-[#DDE1E7] bg-white px-4 text-base font-semibold text-[#1F2933] outline-none transition placeholder:text-[#98A2B3] focus:border-[#E86F6B] focus:ring-4 focus:ring-[#FFF1F0]";

export const studentHeading = {
  page: "text-2xl font-black tracking-tight text-[#1F2933]",
  section: "text-lg font-black tracking-tight text-[#1F2933]",
  card: "text-base font-bold text-[#1F2933]",
  body: "text-sm font-medium text-[#1F2933]",
  secondary: "text-sm font-semibold text-[#667085]",
  caption: "text-xs font-semibold text-[#98A2B3]",
} as const;
