"use client";

type StudentLogoutButtonProps = {
  onClick: () => void;
};

export function StudentLogoutButton({ onClick }: StudentLogoutButtonProps) {
  return (
    <button
      aria-label="로그아웃"
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-[#17213B] shadow-card transition hover:bg-gray-50"
      onClick={onClick}
      type="button"
    >
      <span className="text-base">↗</span>
      <span>로그아웃</span>
    </button>
  );
}
