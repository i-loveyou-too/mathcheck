"use client";

import Link from "next/link";
import { ScreenShell } from "@/components/screen-shell";

type ProofCard = {
  href: string;
  title: string;
  description: string;
  cta: string;
  tone: "indigo" | "blue" | "green";
  icon: "seat" | "planner" | "time";
};

const proofCards: ProofCard[] = [
  {
    href: "/student/sprint/seat-check",
    title: "착석 인증",
    description: "오늘 착석 인증을 제출하면 출석이 인정됩니다.",
    cta: "착석 인증하기",
    tone: "indigo",
    icon: "seat",
  },
  {
    href: "/student/sprint/planner",
    title: "플래너 인증",
    description: "오늘 플래너 인증을 제출하고 계획 실천을 기록해 보세요.",
    cta: "플래너 인증하기",
    tone: "blue",
    icon: "planner",
  },
  {
    href: "/student/sprint/study-time",
    title: "공부시간 인증",
    description: "오늘 공부한 시간을 인증하고 학습 시간을 기록하세요.",
    cta: "공부시간 인증하기",
    tone: "green",
    icon: "time",
  },
];

const toneStyles = {
  indigo: {
    iconWrap: "bg-[#F1EDFF] text-[#6D73FF]",
    check: "bg-[#6D73FF]",
    cta: "bg-[#F1EDFF] text-[#6D73FF]",
  },
  blue: {
    iconWrap: "bg-[#EAF5FF] text-[#2874E8]",
    check: "bg-[#2874E8]",
    cta: "bg-[#EAF5FF] text-[#2874E8]",
  },
  green: {
    iconWrap: "bg-[#EAF8F1] text-[#18A566]",
    check: "bg-[#18A566]",
    cta: "bg-[#EAF8F1] text-[#17895E]",
  },
} satisfies Record<ProofCard["tone"], { iconWrap: string; check: string; cta: string }>;

function HeaderShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-10 w-10 sm:h-11 sm:w-11">
      <path
        d="M24 4 8 10v12c0 10.4 6.6 18.8 16 22 9.4-3.2 16-11.6 16-22V10L24 4Z"
        fill="#2874E8"
        opacity="0.88"
      />
      <path d="m17.5 24.2 4.2 4.1 9-10" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
    </svg>
  );
}

function ProofIcon({ icon }: { icon: ProofCard["icon"] }) {
  if (icon === "planner") {
    return (
      <svg aria-hidden="true" viewBox="0 0 56 56" className="h-10 w-10">
        <rect x="14" y="12" width="28" height="34" rx="6" fill="none" stroke="currentColor" strokeWidth="4" />
        <path d="M22 10h12v8H22z" fill="currentColor" opacity="0.25" />
        <path d="M22 27h12M22 36h8" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
        <circle cx="36" cy="27" r="2.5" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "time") {
    return (
      <svg aria-hidden="true" viewBox="0 0 56 56" className="h-10 w-10">
        <circle cx="28" cy="28" r="18" fill="none" stroke="currentColor" strokeWidth="4" />
        <path d="M28 17v12l8 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 56 56" className="h-10 w-10">
      <path d="M18 25h20M21 25v17M35 25v17" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
      <rect x="20" y="16" width="16" height="10" rx="4" fill="currentColor" opacity="0.38" />
      <path d="M16 36h24" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
    </svg>
  );
}

function CheckBadge({ className }: { className: string }) {
  return (
    <span className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-[0_8px_18px_rgba(49,89,130,0.18)] ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5">
        <path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
      </svg>
    </span>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5">
      <path d="m8 5 5 5-5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
    </svg>
  );
}

export default function SprintProofsPage() {
  return (
    <ScreenShell withBottomNav>
      <div className="relative -mx-5 -mt-7 min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_-5%,#D9F6FF_0,#EEF9FF_34%,#F8FBFF_68%)] px-5 pb-36 pt-9 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute right-[-120px] top-[-80px] h-56 w-56 rounded-full bg-white/55 blur-3xl" />
        <div className="pointer-events-none absolute left-[-140px] top-52 h-48 w-48 rounded-full bg-[#EAF5FF]/70 blur-3xl" />

        <div className="relative">
          <Link
            href="/student/sprint"
            className="inline-flex items-center gap-1.5 text-sm font-black text-[#2874E8] transition hover:text-[#145FDB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2874E8] focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">←</span>
            SPRINT 홈
          </Link>

          <header className="mt-6">
            <div className="flex items-center gap-3">
              <HeaderShieldIcon />
              <div>
                <h1 className="break-keep text-3xl font-black tracking-[-0.04em] text-[#10213D] sm:text-4xl">공부 인증</h1>
              </div>
            </div>
            <p className="mt-3 max-w-2xl break-keep text-sm font-bold leading-6 text-[#6E7F99] sm:text-base">
              공부한 내용을 인증하고 꾸준한 학습 습관을 만들어 보세요.
            </p>
          </header>

          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {proofCards.map((card) => {
              const tone = toneStyles[card.tone];
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex min-h-[220px] flex-col rounded-[24px] bg-white/95 p-5 shadow-[0_14px_30px_rgba(49,89,130,0.12)] ring-1 ring-[#DCEBFA] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(49,89,130,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2874E8] focus-visible:ring-offset-2 lg:min-h-[270px]"
                >
                  <div className="flex flex-col items-start gap-4 lg:flex-1 lg:items-center lg:text-center">
                    <div className={`relative flex h-16 w-16 items-center justify-center rounded-full ${tone.iconWrap} lg:h-20 lg:w-20`}>
                      <ProofIcon icon={card.icon} />
                      <CheckBadge className={tone.check} />
                    </div>
                    <div>
                      <h2 className="break-keep text-xl font-black tracking-[-0.03em] text-[#10213D]">{card.title}</h2>
                      <p className="mt-2 break-keep text-sm font-bold leading-6 text-[#6E7F99]">{card.description}</p>
                    </div>
                  </div>

                  <div className={`mt-5 flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-black transition group-hover:brightness-[0.98] ${tone.cta}`}>
                    <span>{card.cta}</span>
                    <ChevronRightIcon />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}
