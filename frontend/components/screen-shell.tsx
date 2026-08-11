import { ReactNode } from "react";

type ScreenShellProps = {
  children: ReactNode;
  withBottomNav?: boolean;
  /**
   * "sprint" (default) keeps the original look untouched — every Sprint page renders this
   * without passing the prop, so Sprint's visuals never change here.
   * "student" is the unified AIM ON red-brand look, opted into explicitly by general
   * (non-Sprint) student pages only. Never set this to "student" from a Sprint file.
   */
  variant?: "sprint" | "student";
};

export function ScreenShell({ children, withBottomNav = false, variant = "sprint" }: ScreenShellProps) {
  if (variant === "student") {
    return (
      <main className="min-h-screen bg-[#F7F8FA]">
        <div className="relative mx-auto min-h-screen max-w-[430px] bg-[#F7F8FA] md:max-w-[760px] lg:max-w-[1180px]">
          <div className={`space-y-5 px-5 pt-7 ${withBottomNav ? "pb-32" : "pb-10"}`}>
            {children}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#EEF2F6]">
      <div className="relative mx-auto min-h-screen max-w-[430px] bg-[#F8FAFC] shadow-[0_0_60px_rgba(0,0,0,0.07)] md:max-w-[760px] lg:max-w-[1180px] lg:shadow-none">
        <div className={`space-y-5 px-5 pt-7 ${withBottomNav ? "pb-32" : "pb-10"}`}>
          {children}
        </div>
      </div>
    </main>
  );
}
