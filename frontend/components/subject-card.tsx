import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";

type SubjectCardProps = {
  completed?: number;
  id: number;
  name: string;
  progressPercentage: number;
  total?: number;
  href?: string;
};

const subjectThemes = [
  {
    bg: "bg-[#EEF2FF]",
    iconBg: "bg-[#818CF8]",
    badge: "bg-[#C7D2FE] text-[#3730A3]",
    btn: "bg-white/70 text-[#3730A3] hover:bg-white",
    tone: "blue" as const,
  },
  {
    bg: "bg-[#FEF9C3]",
    iconBg: "bg-[#FACC15]",
    badge: "bg-[#FDE68A] text-[#92400E]",
    btn: "bg-white/70 text-[#92400E] hover:bg-white",
    tone: "yellow" as const,
  },
  {
    bg: "bg-[#FCE7F3]",
    iconBg: "bg-[#FB7185]",
    badge: "bg-[#FBCFE8] text-[#9D174D]",
    btn: "bg-white/70 text-[#9D174D] hover:bg-white",
    tone: "pink" as const,
  },
  {
    bg: "bg-[#DCFCE7]",
    iconBg: "bg-[#34D399]",
    badge: "bg-[#BBF7D0] text-[#065F46]",
    btn: "bg-white/70 text-[#065F46] hover:bg-white",
    tone: "green" as const,
  },
];

export function SubjectCard({
  completed,
  id,
  name,
  progressPercentage,
  total,
  href,
}: SubjectCardProps) {
  const theme = subjectThemes[id % subjectThemes.length];
  const detailText =
    typeof completed === "number" && typeof total === "number"
      ? `완료 ${completed} / ${total}문제`
      : "단원별 체크리스트";

  return (
    <Link href={href ?? `/student/subjects/${id}`} className={`block rounded-3xl p-5 ${theme.bg}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${theme.iconBg}`}
          >
            <span className="text-sm font-black text-white">{name.slice(0, 2)}</span>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{name}</p>
            <p className="text-xs text-gray-500">{detailText}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${theme.badge}`}>
          {Math.round(progressPercentage)}%
        </span>
      </div>

      <div className="mt-4">
        <ProgressBar tone={theme.tone} value={progressPercentage} />
      </div>

      <div className="mt-4 flex justify-end">
        <span className={`rounded-full px-4 py-2 text-sm font-semibold transition ${theme.btn}`}>
          이어서 하기 →
        </span>
      </div>
    </Link>
  );
}
