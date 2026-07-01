import { TextbookSelectionPage } from "../textbook-selection-page";

export default function Su2SubjectPage() {
  return (
    <TextbookSelectionPage
      deepLearningBooks={[]}
      deepLearningEmptyMessage="아직 공개된 딥러닝 교재가 없습니다."
      protocolBooks={[
        { title: "프로토콜 Protocol 수2 - 극한과 연속", detail: "체크 기능 준비중" },
        { title: "프로토콜 Protocol 수2 - 미분", detail: "체크 기능 준비중" },
        { title: "프로토콜 Protocol 수2 - 적분", detail: "체크 기능 준비중" },
      ]}
      title="수2 교재 선택"
    />
  );
}
