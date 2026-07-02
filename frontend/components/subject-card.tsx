import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";

type SubjectCardProps = {
  completed?: number;
  href?: string;
  id: number;
  name: string;
  progressPercentage: number;
  total?: number;
};

const subjectThemes = [
  {
    bg: "bg-[#EEF2FF]",
    badge: "bg-[#C7D2FE] text-[#3730A3]",
    btn: "bg-white text-[#3730A3] hover:bg-[#F8FAFF]",
    iconBg: "bg-[#818CF8]",
    tone: "blue" as const,
  },
  {
    bg: "bg-[#FEF9C3]",
    badge: "bg-[#FDE68A] text-[#92400E]",
    btn: "bg-white text-[#92400E] hover:bg-[#FFFBE8]",
    iconBg: "bg-[#FACC15]",
    tone: "yellow" as const,
  },
  {
    bg: "bg-[#FCE7F3]",
    badge: "bg-[#FBCFE8] text-[#9D174D]",
    btn: "bg-white text-[#9D174D] hover:bg-[#FFF4FA]",
    iconBg: "bg-[#FB7185]",
    tone: "pink" as const,
  },
  {
    bg: "bg-[#DCFCE7]",
    badge: "bg-[#BBF7D0] text-[#065F46]",
    btn: "bg-white text-[#065F46] hover:bg-[#F1FFF6]",
    iconBg: "bg-[#34D399]",
    tone: "green" as const,
  },
];

export function SubjectCard({
  completed,
  href,
  id,
  name,
  progressPercentage,
  total,
}: SubjectCardProps) {
  const theme = subjectThemes[id % subjectThemes.length];
  const roundedProgress = Math.round(progressPercentage);
  const detailText =
    typeof completed === "number" && typeof total === "number"
      ? `완료 ${completed} / ${total}문제`
      : "단원별 체크리스트";

  return (
    <Link
      className={`block rounded-[28px] border border-white/80 p-5 shadow-card transition hover:-translate-y-0.5 ${theme.bg}`}
      href={href ?? `/student/subjects/${id}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-sm ${theme.iconBg}`}
          >
            {name.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-[1.05rem] font-black tracking-tight text-[#17213B]">{name}</p>
            <p className="mt-1 text-sm font-medium text-[#6B7280]">{detailText}</p>
          </div>
        </div>

        <span className={`shrink-0 rounded-full px-4 py-2 text-[15px] font-black ${theme.badge}`}>
          {roundedProgress}%
        </span>
      </div>

      <div className="mt-4">
        <ProgressBar tone={theme.tone} value={progressPercentage} />
        <div className="mt-2 flex items-center justify-between text-sm font-semibold text-[#8A94A8]">
          <span>학습 진도</span>
          <span>{roundedProgress}%</span>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <span
          className={`inline-flex h-11 items-center justify-center rounded-full px-5 text-[15px] font-black shadow-sm transition ${theme.btn}`}
        >
          이어서 하기 →
        </span>
      </div>
    </Link>
  );
}
