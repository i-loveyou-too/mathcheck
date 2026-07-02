import { TextbookSelectionPage } from "../textbook-selection-page";

export default function Su2SubjectPage() {
  return (
    <TextbookSelectionPage
      deepLearningEmptyMessage="아직 공개된 딥러닝 교재가 없습니다."
      subjectQueryValues={["수2"]}
      title="수2 교재 선택"
    />
  );
}
