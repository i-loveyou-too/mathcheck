import { TextbookSelectionPage } from "../textbook-selection-page";

export default function ProbabilitySubjectPage() {
  return (
    <TextbookSelectionPage
      deepLearningBooks={[
        {
          title: "딥러닝 Deep Learning 확률과 통계 - 경우의 수",
          detail: "18문항",
          href: "/student/textbooks/deep-prob-counting",
        },
      ]}
      protocolBooks={[
        { title: "프로토콜 Protocol 확률과 통계 - 경우의 수", detail: "체크 기능 준비중" },
        { title: "프로토콜 Protocol 확률과 통계 - 확률", detail: "체크 기능 준비중" },
        { title: "프로토콜 Protocol 확률과 통계 - 통계", detail: "체크 기능 준비중" },
      ]}
      title="확률과 통계 교재 선택"
    />
  );
}
