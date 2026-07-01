import { TextbookChecklistPage } from "../textbook-checklist-page";

export default function DeepSu1ExpLogPage() {
  return (
    <TextbookChecklistPage
      backHref="/student/subjects/su1"
      endNumber={20}
      progressKey="deep-su1-exp-log"
      startNumber={1}
      title="딥러닝 Deep Learning 수1 - 지수로그"
    />
  );
}
