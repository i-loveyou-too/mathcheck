import { ReactNode } from "react";

type ScreenShellProps = {
  children: ReactNode;
  withBottomNav?: boolean;
};

export function ScreenShell({ children, withBottomNav = false }: ScreenShellProps) {
  return (
    <main className="min-h-screen bg-[#EEF2F6]">
      <div className="relative mx-auto min-h-screen max-w-[430px] bg-[#F8FAFC] shadow-[0_0_60px_rgba(0,0,0,0.07)]">
        <div className={`space-y-5 px-5 pt-7 ${withBottomNav ? "pb-32" : "pb-10"}`}>
          {children}
        </div>
      </div>
    </main>
  );
}
