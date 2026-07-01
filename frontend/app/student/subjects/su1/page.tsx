import { TextbookSelectionPage } from "../textbook-selection-page";

export default function Su1SubjectPage() {
  return (
    <TextbookSelectionPage
      deepLearningBooks={[
        {
          title: "딥러닝 Deep Learning 수1 - 지수로그",
          detail: "20문항",
          href: "/student/textbooks/deep-su1-exp-log",
        },
        {
          title: "딥러닝 Deep Learning 수1 - 삼각함수 그래프",
          detail: "15문항",
          href: "/student/textbooks/deep-su1-trig-graph",
        },
        {
          title: "딥러닝 Deep Learning 수1 - 수열 등차수열·등비수열",
          detail: "20문항",
          href: "/student/textbooks/deep-su1-sequence-basic",
        },
        {
          title: "딥러닝 Deep Learning 수1 - 수열의 합과 시그마",
          detail: "18문항",
          href: "/student/textbooks/deep-su1-sequence-sum",
        },
      ]}
      protocolBooks={[
        { title: "프로토콜 Protocol 수1 - 지수로그", detail: "체크 기능 준비중" },
        { title: "프로토콜 Protocol 수1 - 삼각함수 그래프", detail: "체크 기능 준비중" },
        { title: "프로토콜 Protocol 수1 - 삼각함수 도형", detail: "체크 기능 준비중" },
        { title: "프로토콜 Protocol 수1 - 수열", detail: "체크 기능 준비중" },
      ]}
      title="수1 교재 선택"
    />
  );
}
