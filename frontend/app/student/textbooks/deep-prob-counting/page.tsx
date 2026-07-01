import { TextbookChecklistPage } from "../textbook-checklist-page";

export default function DeepProbCountingPage() {
  return (
    <TextbookChecklistPage
      backHref="/student/subjects/probability"
      endNumber={18}
      startNumber={1}
      title="딥러닝 Deep Learning 확률과 통계 - 경우의 수"
    />
  );
}
