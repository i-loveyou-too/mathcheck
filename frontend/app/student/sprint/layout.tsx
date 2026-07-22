import { ReactNode } from "react";
import { SprintBottomNav } from "@/components/sprint-bottom-nav";

export default function StudentSprintLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SprintBottomNav />
    </>
  );
}
