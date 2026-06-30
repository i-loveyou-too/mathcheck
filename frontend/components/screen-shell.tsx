import { ReactNode } from "react";

type ScreenShellProps = {
  children: ReactNode;
  withBottomNav?: boolean;
};

export function ScreenShell({ children, withBottomNav = false }: ScreenShellProps) {
  return (
    <main className="min-h-screen bg-brand-bg px-4 pb-8 pt-6">
      <div className={`mx-auto max-w-md space-y-6 ${withBottomNav ? "pb-24" : ""}`}>{children}</div>
    </main>
  );
}
