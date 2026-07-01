import { TextbookChecklistPage } from "../textbook-checklist-page";

export default function DeepSu1SequenceBasicPage() {
  return (
    <TextbookChecklistPage
      backHref="/student/subjects/su1"
      endNumber={20}
      startNumber={1}
      title="딥러닝 Deep Learning 수1 - 수열 등차수열·등비수열"
    />
  );
}
