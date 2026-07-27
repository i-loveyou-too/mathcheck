# Student UI Redesign Plan

`docs/StudentUIDesignSystem.md`에서 정의한 토큰·원칙을 실제 파일에 적용하기 위한 구현 계획서. 이 문서 자체는 계획서이며, 이번 단계에서 `.tsx`/`.ts`/`.css`를 수정하지 않는다. 모든 항목은 실제 파일 경로·현재 클래스·라인 번호를 근거로 한다.

기능 보호 규칙(전 항목 공통): API 엔드포인트, request/response, `apiFetch`, `useEffect`와 dependency array, 상태 변수·전환, 이벤트 핸들러(`onClick`/`onChange`/`onBlur`), `disabled` 판단 로직, 제출/자동저장/채점/결과공개/재응시/삭제, 인증·권한, 데이터 모델, 백엔드, 조건부 렌더링의 기능적 의미는 이 계획에 포함하지 않는다. 발견되더라도 문서 끝 "발견 사항" 섹션에만 기록한다.

---

## 1. 현재 UI 구조 요약

학생 화면은 Next.js 14 App Router `frontend/app/student/**` 아래 페이지 컴포넌트로 구성되고, 대부분 `"use client"` + `useEffect`로 `apiFetch` 호출 → 로컬 상태 세팅 → JSX 렌더링 구조를 따른다. 레이아웃은 공통 `ScreenShell`(430px 고정 프레임)을 감싸고, 하단에 두 종류 중 하나의 고정 네비(`StudentBottomNav` 또는 `SprintBottomNav`)가 얹힌다. 색·폰트·radius는 페이지마다 인라인 Tailwind 임의값(`bg-[#...]`, `rounded-[...px]`, `shadow-[...]`)으로 직접 박혀 있고, 공용 컴포넌트(`frontend/components/*.tsx`)는 카드류 몇 개(`student-card`, `subject-card`, `unit-card`, `stat-card`, `progress-bar`, `task-checkbox`, `curriculum-graph`) 정도만 추출돼 있다. 영단어 test/result 4개 페이지와 시험 결과 페이지 1개는 `ScreenShell`을 쓰지 않고 자체 `<main>`을 구성한다.

## 2. 공통 셸과 네비 구조

| 컴포넌트 | 파일 | 현재 최대폭 | 비고 |
|---|---|---|---|
| `ScreenShell` | `frontend/components/screen-shell.tsx:11` | `max-w-[430px]` | 오늘도 해냄+SPRINT 공통, `withBottomNav` prop으로 하단 패딩만 분기 |
| `StudentBottomNav` | `frontend/components/student-bottom-nav.tsx:28` | `max-w-[430px]` | `/student/sprint` 경로면 `return null`(`:17`) |
| `SprintBottomNav` | `frontend/components/sprint-bottom-nav.tsx:32` | `max-w-[430px]` | SPRINT 전용 |
| `BottomNav` | `frontend/components/bottom-nav.tsx:19` | `max-w-md`(448px) | 학생 화면에서 미사용으로 추정(관리자/범용) — 학생 리디자인 범위 아님, 확인만 하고 손대지 않음 |
| `StudentResultShell`(검증된 반응형 참조) | `frontend/app/student/sprint/exams/attempts/[attemptId]/result/page.tsx:181-191` | `max-w-[430px] md:max-w-[760px] lg:max-w-[1180px] lg:shadow-none` | 이 프로젝트에서 유일하게 이미 반응형인 셸 — Phase 0의 목표 템플릿 |

## 3. 모바일 고정 폭 원인

근본 원인은 `screen-shell.tsx:11`의 `max-w-[430px]` 단일값이며, 같은 값이 네비 2개(`student-bottom-nav.tsx:28`, `sprint-bottom-nav.tsx:32`)와 개별 페이지의 고정 요소들에도 하드코딩돼 반복된다:
- `frontend/app/student/sprint/exams/[assignmentId]/page.tsx:175` — 하단 고정 CTA `max-w-[430px]`
- `frontend/app/student/sprint/exams/attempts/[attemptId]/page.tsx:310,326` — 제출 확인 시트, 하단 고정 버튼 `max-w-[430px]`
- `frontend/app/student/curriculum/page.tsx:179` — (이전 조사에서 확인된 페이지 내 고정폭)

이 값들이 전부 `ScreenShell`과 별개로 각 파일에 직접 박혀 있기 때문에, `ScreenShell`만 넓혀서는 하단 고정 버튼·시트·네비가 여전히 430px에 갇힌 채 셸 안에서 붕 뜨는 문제가 생긴다. Phase 0에서 이 값들을 전부 같은 3단 breakpoint 세트로 동시에 바꿔야 한다.

## 4. 영향을 받는 전체 페이지

ScreenShell 사용 페이지(28개, 이전 조사에서 확정):
```
student/page.tsx, today/page.tsx, curriculum/page.tsx, tracker/page.tsx, lessons/page.tsx,
lectures/[assignmentId]/page.tsx, my-progress/page.tsx, subjects/page.tsx, subjects/[subjectId]/page.tsx,
subjects/textbook-selection-page.tsx, textbooks/textbook-checklist-page.tsx, units/[unitId]/page.tsx,
vocabulary/wrong-notes/page.tsx, sprint/page.tsx, sprint/my/page.tsx, sprint/proofs/page.tsx,
sprint/records/page.tsx, sprint/progress/page.tsx, sprint/study-time/page.tsx, sprint/vocabulary/page.tsx,
sprint/vocabulary/wrong-notes/page.tsx, sprint/worksheets/page.tsx, sprint/worksheets/[id]/page.tsx,
sprint/exams/page.tsx, sprint/exams/[assignmentId]/page.tsx, sprint/exams/attempts/[attemptId]/page.tsx,
sprint/coming-soon.tsx(공용), sprint/proof-form.tsx(공용)
```
(모두 `frontend/app/student/` 기준 상대경로)

ScreenShell 미사용(자체 셸) 페이지 5개:
```
sprint/exams/attempts/[attemptId]/result/page.tsx  (이미 반응형, 5절 참고)
vocabulary/test/[sessionId]/page.tsx
vocabulary/result/[sessionId]/page.tsx
sprint/vocabulary/test/[sessionId]/page.tsx
sprint/vocabulary/result/[sessionId]/page.tsx
```

이번 조사에서 새로 읽어 구조를 확인한 "얇은 래퍼" 페이지(별도 UI 없음, 실질적으로 영향 없음 — 5절 참고):
```
vocabulary/page.tsx (redirect만)
sprint/planner/page.tsx, sprint/seat-check/page.tsx (ProofForm 재사용)
subjects/probability/page.tsx, subjects/su1/page.tsx, subjects/su2/page.tsx (TextbookSelectionPage 재사용)
textbooks/[key]/page.tsx (TextbookChecklistPage 재사용)
textbooks/deep-*/page.tsx 5개 (TextbookChecklistPage 재사용)
```

## 5. 미조사 페이지 목록과 조사 결과

작업 지시에서 "확인 필요"로 남아있던 페이지를 전부 Read로 확인했다.

| 파일 | 실제 구조 |
|---|---|
| `vocabulary/page.tsx` | `redirect("/student/sprint/vocabulary")` 한 줄. 자체 UI 없음. 리디자인 대상 아님 |
| `sprint/planner/page.tsx`, `sprint/seat-check/page.tsx` | 각각 `<ProofForm proofType="planner"/>`, `<ProofForm proofType="seat_check"/>` 한 줄. 실제 UI는 `sprint/proof-form.tsx`(이미 Phase 대상 목록에 포함) |
| `subjects/probability/page.tsx`, `su1/page.tsx`, `su2/page.tsx` | 각각 `<TextbookSelectionPage subjectQueryValues={[...]} title="..."/>` 한 줄. 실제 UI는 `subjects/textbook-selection-page.tsx`(이미 목록에 포함) |
| `textbooks/[key]/page.tsx` | `useEffect`로 교재 정보를 불러와 `<TextbookChecklistPage backHref=... title=.../>`에 전달하는 동적 래퍼. 실제 UI는 `textbooks/textbook-checklist-page.tsx`(이미 목록에 포함) |
| `textbooks/deep-*/page.tsx` 5개 | 전부 13줄, `<TextbookChecklistPage backHref=... endNumber=... progressKey=... startNumber=... title=.../>` 정적 호출. 실제 UI 동일 컴포넌트 재사용 |
| `vocabulary/test/[sessionId]/page.tsx` | 사용자 언급대로 **한 줄로 압축된 코드**(20줄, 본문 로직+JSX가 한 줄에 압축). `ScreenShell` 미사용, 자체 `<main className="min-h-screen bg-[#F4F7F6] ...">`, `max-w-[680px] mx-auto` 센터 컬럼. 다크 네이비(`#17213B`)+민트그린(`#45D3A2`/`#19A879`) 서브 팔레트 |
| `vocabulary/result/[sessionId]/page.tsx` | 마찬가지로 23줄 압축 코드. `max-w-[700px]`, 상단 다크 스코어 카드(`bg-[#17213B]`), 오답노트/재시험 2열 버튼, 문항별 결과 리스트 |
| `sprint/vocabulary/test/[sessionId]/page.tsx` | 110줄, 정상 포맷팅(압축 안 됨). 위 `vocabulary/test`와 로직·마크업 거의 동일, `router.push` 대상 경로만 `/student/sprint/...`로 다름 |
| `sprint/vocabulary/result/[sessionId]/page.tsx` | 116줄, 정상 포맷팅. `vocabulary/result`와 유사하나 오답만 보기 토글이 세그먼트 필 탭(`rounded-full bg-[#E7EBF0] p-1`, `:76-89`)으로 더 정교하게 구현됨 |

결론: "확인 필요" 15개 파일 중 9개는 실질적으로 얇은 래퍼(자체 UI 없음, 아래 6절 그룹의 대상 컴포넌트만 수정하면 됨)이고, 실제로 독자적 UI를 가진 것은 영단어 test/result 4개뿐이다. 이 4개는 `ScreenShell`을 쓰지 않는 독립 레이아웃이므로 Phase 4에서 별도 처리한다.

## 6. 페이지를 기능 유형별로 그룹화

- **A. 오늘도 해냄 대시보드/진도류**: `student/page.tsx`, `today/page.tsx`, `curriculum/page.tsx`, `tracker/page.tsx`, `my-progress/page.tsx`
- **B. 오늘도 해냄 과목/교재류**: `subjects/page.tsx`, `subjects/[subjectId]/page.tsx`, `subjects/textbook-selection-page.tsx`(+ probability/su1/su2 래퍼), `textbooks/textbook-checklist-page.tsx`(+ `[key]`, `deep-*` 래퍼 6개), `units/[unitId]/page.tsx`
- **C. 오늘도 해냄 인강**: `lessons/page.tsx`, `lectures/[assignmentId]/page.tsx`
- **D. SPRINT 일반 화면**: `sprint/page.tsx`, `sprint/my/page.tsx`, `sprint/proofs/page.tsx`, `sprint/records/page.tsx`, `sprint/progress/page.tsx`, `sprint/study-time/page.tsx`, `sprint/planner/page.tsx`(+`proof-form.tsx`), `sprint/seat-check/page.tsx`(+`proof-form.tsx`), `sprint/coming-soon.tsx`
- **E. SPRINT 문제지**: `sprint/worksheets/page.tsx`, `sprint/worksheets/[id]/page.tsx`
- **F. SPRINT 모의고사(OMR)**: `sprint/exams/page.tsx`, `sprint/exams/[assignmentId]/page.tsx`, `sprint/exams/attempts/[attemptId]/page.tsx`, `sprint/exams/attempts/[attemptId]/result/page.tsx`
- **G. 영단어**: `vocabulary/wrong-notes/page.tsx`, `sprint/vocabulary/page.tsx`, `sprint/vocabulary/wrong-notes/page.tsx`, `vocabulary/test/[sessionId]/page.tsx`, `vocabulary/result/[sessionId]/page.tsx`, `sprint/vocabulary/test/[sessionId]/page.tsx`, `sprint/vocabulary/result/[sessionId]/page.tsx`
- **H. 공통 셸/네비/기반 컴포넌트**: `screen-shell.tsx`, `student-bottom-nav.tsx`, `sprint-bottom-nav.tsx`, `header.tsx`, `progress-bar.tsx`, `stat-card.tsx`, `student-card.tsx`, `subject-card.tsx`, `unit-card.tsx`, `task-checkbox.tsx`, `curriculum-graph.tsx`

## 7. 페이지별 현재 문제

- **전 그룹 공통**: 셸이 430px에 고정돼 태블릿/데스크톱에서 좌우 여백만 넓어지고 콘텐츠는 그대로 좁게 남는다(`screen-shell.tsx:11`).
- **A·B·D·F 그룹**: 하단 고정 CTA/네비가 셸과 별개의 `max-w-[430px]`를 각자 갖고 있어(3절), 셸을 넓혀도 버튼/네비는 화면 중앙에 좁게 떠 있게 된다.
- **F 그룹(OMR)**: 문항 목록이 세로 1열 고정(`grid-cols-[2.25rem_1fr]`, `attemptId]/page.tsx:272`)이라 데스크톱 와이드 화면에서 좌우 여백이 극단적으로 커진다. 제출 확인 시트가 `items-end`(바텀시트)로만 구현돼 있어 데스크톱에서도 화면 하단에 시트가 붙는 어색한 모양이 된다(`:309`).
- **G 그룹 중 `vocabulary/test`/`vocabulary/result`**: `ScreenShell`/바텀네비 없이 완전히 독립된 레이아웃이라, 다른 페이지와 내비게이션 일관성이 없다(뒤로가기 텍스트 링크만 존재). 코드가 한 줄로 압축돼 있어 diff 리뷰가 어렵다(포맷팅 문제, 로직 문제 아님).
- **H 그룹**: 카드 radius가 20/22/24/26/28px로 파일마다 제각각(12절 근거), 오류 배너 className이 수십 곳에 리터럴로 중복(21절 근거).

## 8. 페이지별 목표 UI

- **A·B·C·D·E 그룹**: 모바일 1열 유지 → 태블릿에서 카드 2열(콘텐츠 여유 있는 리스트, 예: 과목 카드·문제지 리스트) 또는 1열 유지(세로 흐름이 중요한 대시보드) → 데스크톱에서 콘텐츠 성격에 따라 2~3열. 하단 고정 CTA/네비는 셸과 동일한 3단 `max-w`로 확장.
- **F 그룹(OMR 응시 화면)**: 데스크톱에서 좌측(과목 탭+진행 요약) / 우측(문항 목록) 2단 분리. 목록 페이지·상세 페이지는 카드 2열까지 허용, 응시 화면 자체는 세로 흐름 보존을 위해 1~2단 이상으로 쪼개지 않음.
- **G 그룹 영단어 test/result**: `StudentResultShell`과 동일한 3단 반응형 컨테이너를 적용해 다른 페이지들과 레이아웃 언어를 통일하되, 기존의 "몰입형(네비 없는) 시험지" 톤은 유지(하단 네비를 억지로 추가하지 않음 — 24절 "발견 사항"에서 별도 논의).

## 9. 페이지별 사용할 breakpoint

전 그룹 공통으로 `StudentUIDesignSystem.md` 14절의 Tailwind 기본 breakpoint(`sm 640 / md 768 / lg 1024`)를 사용하고, 컨테이너는 `max-w-[430px] md:max-w-[760px] lg:max-w-[1180px] lg:shadow-none` 패턴을 그대로 채택한다. 그리드 전환은 `md:grid-cols-2`, `lg:grid-cols-2` 또는 `lg:grid-cols-3` 중 그룹별 콘텐츠 밀도에 맞춰 선택(10절 참고). OMR 응시 화면(F 그룹)만 `lg:grid-cols-[320px_1fr]` 같은 비율 분리 그리드를 별도로 쓴다.

## 10. 페이지별 카드·그리드 구조

| 그룹 | 모바일 | 태블릿 | 데스크톱 |
|---|---|---|---|
| A(대시보드) | 1열 | 1열(정보 밀도가 세로 흐름 중심) | 1열 본문 + 사이드 통계 카드 고려(2열), 무리하게 3열 금지 |
| B(과목/교재 카드) | 1열 | `md:grid-cols-2` | `lg:grid-cols-2~3`(교재 개수에 따라) |
| C(인강 목록) | 1열 | 1열 유지(리스트형) 또는 2열 | `lg:grid-cols-2` |
| D(SPRINT 일반) | 1열 | 1열 또는 요약 카드만 2열 | 콘텐츠 성격별 판단, 무조건 3열 금지 |
| E(문제지 리스트) | 1열 | `md:grid-cols-2` | `lg:grid-cols-2` |
| F-목록/상세(모의고사) | 1열 | `md:grid-cols-2`(목록만) | `lg:grid-cols-2`(목록), 상세는 1열 유지 |
| F-응시(OMR) | 1열 | 1열 | `lg:grid-cols-[minmax(280px,320px)_1fr]` 좌: 탭+요약, 우: 문항 |
| G(영단어) | 1열 센터 컬럼 | 1열 센터 컬럼, 폭만 확장 | 1열 센터 컬럼 유지(시험지 성격상 다열 금지) |

## 11. 공통 컴포넌트로 추출할 후보

- **`InlineErrorBanner`**: `rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600` 패턴이 `sprint/exams/page.tsx:97`, `sprint/exams/[assignmentId]/page.tsx:148`, `sprint/exams/attempts/[attemptId]/page.tsx:213`, `sprint/worksheets/page.tsx:80`, `vocabulary/test/[sessionId]/page.tsx:19` 등 최소 10곳 이상 리터럴 중복. `{error && <p>...}` 조건부 렌더링 자체는 각 페이지의 `error` 상태를 그대로 쓰므로 기능 변경 없이 표시부만 컴포넌트화 가능.
- **`EmptyStateCard`**: `sprint/exams/page.tsx:101-106`, `sprint/worksheets/page.tsx:84-87` 패턴(중앙 정렬 카드+아이콘+제목+보조문구) 공통화.
- **`StatusBadge`**: `statusTone`/`StateCard`류 함수(`sprint/exams/page.tsx:59-65`, `sprint/exams/[assignmentId]/page.tsx:59-65`)가 이미 로컬 함수로 존재 — semantic 색 매핑 로직은 그대로 두고, 렌더링되는 `<span>` 마크업만 공통 컴포넌트로 승격.
- **`ResponsiveShell`(`ScreenShell` 확장)**: 3단 `max-w` + `lg:shadow-none`을 캡슐화.
- **`SegmentTab`/`ChipScrollTab`**: 19절에서 정의한 두 탭 패턴을 컴포넌트화(`sprint/vocabulary/result/[sessionId]/page.tsx:76-89`, `sprint/exams/attempts/[attemptId]/page.tsx:218-226`이 각각의 원형).

## 12. 기존 컴포넌트를 유지할 영역

`progress-bar.tsx`, `task-checkbox.tsx`, `stat-card.tsx`, `student-card.tsx`, `subject-card.tsx`, `unit-card.tsx`, `curriculum-graph.tsx`, `header.tsx`, `student-logout-button.tsx`는 API 자체(props, 콜백 시그니처)를 바꾸지 않는다. 이 컴포넌트들은 className 조정만으로 반응형 대응이 가능하며, 새 wrapper(그리드 컬럼 수 조정)만 상위 페이지에서 씌운다.

## 13. className만 수정할 영역

- `screen-shell.tsx`, `student-bottom-nav.tsx`, `sprint-bottom-nav.tsx`의 `max-w-[430px]` → 3단 반응형 값
- 각 그룹 페이지의 카드 리스트 wrapper `div`(`space-y-3` → `md:grid md:grid-cols-2 md:gap-3` 등)
- 하단 고정 CTA/시트의 `max-w-[430px]`(`sprint/exams/[assignmentId]/page.tsx:175`, `sprint/exams/attempts/[attemptId]/page.tsx:310,326`)
- 페이지 좌우 padding(`px-5` → `sm:px-5 lg:px-6` 등, `StudentResultShell` 패턴 참고)

## 14. 새 시각 컴포넌트가 필요한 영역

- OMR 응시 화면의 데스크톱 2단 분리 wrapper(11절 `ResponsiveShell`과 별개로, F 그룹 전용 grid wrapper)
- 제출 확인 모달의 데스크톱 중앙 정렬 변형(현재 `items-end` 바텀시트 하나뿐)
- 영단어 test/result 4개 페이지에 적용할 반응형 센터 컬럼 래퍼(현재 각 페이지에 개별 `<main>`+`max-w-[680~700px]`가 중복 구현돼 있음)

## 15. 기능 코드와 UI 코드의 경계

대부분의 페이지에서 데이터 로딩(`useEffect` + `apiFetch`)과 상태 관리(`useState`)는 컴포넌트 상단에, JSX 렌더링은 `return` 이후에 명확히 분리돼 있어 경계가 뚜렷하다. 예외적으로 결합도가 높은 지점:
- `sprint/exams/attempts/[attemptId]/page.tsx:267-304` 문항 렌더링 루프 — `onClick={() => void saveAnswer(...)}`가 각 선택지 버튼에 직접 물려 있다. `saveAnswer` 함수 자체(`:121-141`)는 JSX보다 위에서 독립적으로 정의돼 있어 안전하게 분리 가능하지만, **버튼 마크업을 별도 컴포넌트로 뽑을 때도 `onClick`·`disabled` prop은 그대로 상위에서 내려줘야 한다.**
- `vocabulary/test/[sessionId]/page.tsx`, `sprint/vocabulary/test/[sessionId]/page.tsx`의 자동저장 `useEffect`(디바운스 500ms)는 JSX와 완전히 분리돼 있어 레이아웃 변경이 로직에 영향을 주지 않는다.

## 16. 절대 수정하면 안 되는 함수와 핸들러

- `saveAnswer`, `submit`, `load`(`sprint/exams/attempts/[attemptId]/page.tsx:90-100,121-161`)
- `start`(`sprint/exams/[assignmentId]/page.tsx:97-107`)
- `review`, 자동저장 `useEffect`(영단어 test/result 4개 파일)
- `getStudent`, `router.push("/login")` 인증 가드(전 페이지 공통 패턴)
- `handleLogout`(`header.tsx:19-31`), `student-logout-button.tsx`의 `onClick` prop 시그니처
- `computeGroupLayout`, `recomputePaths`(`curriculum-graph.tsx:81-115,191-224`) — 그래프 좌표 계산 로직

## 17. 단계별 구현 순서

### Phase 0 — 기반
SUIT 전역 적용(설계만 완료, 실제 적용은 Phase 0 실행 시), 디자인 토큰 정리, 공통 responsive shell, 학생 하단 네비, SPRINT 하단 네비.

```md
- [ ] `frontend/components/screen-shell.tsx`
  - 현재: `max-w-[430px]`(`:11`), 바깥 `shadow-[0_0_60px_rgba(0,0,0,0.07)]`
  - 목표: `max-w-[430px] md:max-w-[760px] lg:max-w-[1180px] lg:shadow-none`
  - 수정 범위: outer wrapper의 className만
  - 유지: `children` 렌더링, `withBottomNav` prop 동작, 내부 padding 로직(`pb-32`/`pb-10` 분기)
  - 검증: 375px / 768px / 1280px에서 셸 폭과 그림자 유무 확인

- [ ] `frontend/components/student-bottom-nav.tsx`
  - 현재: `max-w-[430px]`(`:28`)
  - 목표: `screen-shell.tsx`와 동일한 3단 `max-w`
  - 수정 범위: `nav`의 className만
  - 유지: `pathname.startsWith("/student/sprint")` 분기(`:17`), `items` 배열, `Link href`, `active` 판정 로직
  - 검증: 셸 폭과 네비 폭이 3개 뷰포트 모두에서 일치하는지 나란히 스크린샷 비교

- [ ] `frontend/components/sprint-bottom-nav.tsx`
  - 현재: `max-w-[430px]`(`:32`)
  - 목표: 동일 3단 `max-w`
  - 수정 범위: `nav`의 className만
  - 유지: `isActive` 함수, `items` 배열, `Link href`
  - 검증: 동일

- [ ] `frontend/app/layout.tsx`, `frontend/app/globals.css`
  - 현재: Pretendard CDN `<link>` + `--font-body` 변수(`globals.css:21`)
  - 목표: SUIT 적용(옵션 A CDN 또는 옵션 B `next/font/local`, 디자인 시스템 문서 9절 참고 — 이번 계획 문서는 옵션만 제시, 방식 확정은 Phase 0 착수 시 결정)
  - 수정 범위: `<link>` 태그 및 `--font-body` 값
  - 유지: `--font-display`/`--font-button`(Jalnan/Cafe24 유지 여부는 별도 결정 항목)
  - 검증: 한글/영문/숫자 렌더링 확인, 폰트 로딩 실패 시 폴백 확인
```

### Phase 1 — 오늘도 해냄 공통 화면
학생 홈, 오늘의 미션, 진도표, 트래커, 과목, 교재, 인강, 학습 진도 (그룹 A·B·C).

```md
- [ ] `frontend/app/student/subjects/page.tsx`
  - 현재: `space-y-3`(`:122`) 1열 카드 리스트, 카드는 `rounded-3xl bg-white p-5 shadow-card`(`:131`)
  - 목표: `space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0`(과목 3개뿐이라 데스크톱에서도 `lg:grid-cols-2` 유지, 3열 금지 — 콘텐츠 부족으로 늘어져 보임)
  - 수정 범위: `<div className="space-y-3">` wrapper만
  - 유지: `subjectConfigs`, `summary` 로드 로직, `CircularProgress` 계산
  - 검증: 768px에서 카드 2열, 카드 개수 3개라 마지막 줄이 비어 보이지 않는지 확인
```
(같은 패턴을 `today/page.tsx`, `curriculum/page.tsx`, `tracker/page.tsx`, `my-progress/page.tsx`, `lessons/page.tsx`, `lectures/[assignmentId]/page.tsx`, `units/[unitId]/page.tsx`, `subjects/[subjectId]/page.tsx`, `subjects/textbook-selection-page.tsx`, `textbooks/textbook-checklist-page.tsx`에 각 파일의 실제 리스트 wrapper를 찾아 동일하게 적용 — 각 파일은 착수 시 Read로 현재 wrapper className을 재확인한 뒤 위와 같은 형식으로 세부 체크리스트를 작성한다.)

### Phase 2 — SPRINT 일반 화면
SPRINT 홈, 내 정보, 인증, 기록, 진도, 공부시간, 플래너, 착석, 문제지 제출, 영단어 목록과 오답 (그룹 D·E, G 중 목록/오답).

```md
- [ ] `frontend/app/student/sprint/my/page.tsx`
  - 현재: `-mx-5 -mt-7` 그라디언트 풀블리드 배경(`:53`), 통계 3칸 `grid grid-cols-3 gap-3`(`:84`)
  - 목표: 풀블리드 배경은 유지(브랜드 캔버스), 내부 콘텐츠 컬럼만 `md:max-w-[760px] lg:max-w-[1180px]` 대응, 통계 3칸은 모바일 그대로/데스크톱에서 카드 자체 크기만 확대(칸 수 변경 없음 — 이미 3칸이 적정 밀도)
  - 수정 범위: 콘텐츠 wrapper의 `max-w`, padding
  - 유지: `apiFetch` 대시보드 로드, `program`/`data` 상태
  - 검증: 1280px에서 배경 그라디언트가 화면 전체를 덮고 카드 컬럼만 중앙 1180px로 정렬되는지 확인

- [ ] `frontend/app/student/sprint/worksheets/page.tsx`
  - 현재: `space-y-3` 1열(`:82`), 카드 `rounded-[22px] p-5 shadow-[...] ring-1 ring-[#DFEAF6]`(`:93`)
  - 목표: `space-y-3 md:grid md:grid-cols-2 md:gap-3`
  - 수정 범위: 리스트 wrapper만
  - 유지: `assignments`/`sprintContext` 로드, `statusTone`/`statusLabels` 매핑
  - 검증: 태블릿에서 2열, 상태 배지 색이 그대로인지 확인
```
(`sprint/page.tsx`, `sprint/proofs/page.tsx`, `sprint/records/page.tsx`, `sprint/progress/page.tsx`, `sprint/study-time/page.tsx`, `sprint/planner/page.tsx`+`proof-form.tsx`, `sprint/seat-check/page.tsx`, `sprint/vocabulary/page.tsx`, `sprint/vocabulary/wrong-notes/page.tsx`, `vocabulary/wrong-notes/page.tsx`, `sprint/coming-soon.tsx`도 착수 시 각 파일의 실제 리스트/그리드 wrapper를 Read로 재확인 후 동일 형식으로 세부화한다.)

### Phase 3 — SPRINT 모의고사
시험 목록, 시험 상세 및 시작, OMR 응시, 제출 확인, 제출 완료, 결과 및 해설 (그룹 F).

```md
- [ ] `frontend/app/student/sprint/exams/page.tsx`
  - 현재: `space-y-3`(`:99`) 1열, 카드 `rounded-[24px] p-5 shadow-[...] ring-1 ring-[#DFEAF6]`(`:115`)
  - 목표: `space-y-3 md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-2`
  - 수정 범위: 리스트 wrapper만
  - 유지: `assignments` 로드, `statusTone`, `attemptLabels`
  - 검증: 768px/1280px에서 카드 2열, 배지 색 불변

- [ ] `frontend/app/student/sprint/exams/[assignmentId]/page.tsx`
  - 현재: 1열 세로 섹션(상세 정보 `:131`, 배정 과목 `:150`, 상태 카드 `:160`), 하단 고정 CTA `max-w-[430px]`(`:175`)
  - 목표: 콘텐츠는 1열 유지(상세 페이지는 콘텐츠 밀도상 다열 불필요), 하단 고정 CTA만 셸과 동일한 3단 `max-w`로 확장하고 `lg:`에서는 CTA를 콘텐츠 컬럼 폭에 정렬
  - 수정 범위: `.fixed` CTA wrapper의 `max-w`(`:175`)만, 본문 섹션 구조는 불변
  - 유지: `load`, `start` 함수, `busy`/`error` 상태, `canStartAfterVoided` 조건 분기
  - 검증: 1280px에서 CTA 버튼이 콘텐츠 컬럼과 좌우 정렬이 맞는지 확인, 클릭 동작(시험 시작) 정상 확인

- [ ] `frontend/app/student/sprint/exams/attempts/[attemptId]/page.tsx`
  - 현재: 전체 1열(`:194` 이하), 과목 칩 탭(`:216-228`), 문항 목록 `grid-cols-[2.25rem_1fr]`(`:272`), 바텀시트(`:308-324`), 하단 고정 버튼(`:326-334`) 전부 `max-w-[430px]` 또는 셸 폭 그대로
  - 목표: `lg` 이상에서 바깥을 `lg:grid lg:grid-cols-[320px_1fr] lg:gap-6`으로 분리 — 좌측 칼럼에 과목 칩 탭(`:216-228`)과 진행 요약(현재 헤더 영역의 진행률 배지)을 `lg:sticky lg:top-6`로 배치, 우측 칼럼에 문항 목록(`:230-306`) 배치. 바텀시트는 `md` 이상에서 `items-end`→`items-center`, 하단 고정 제출 버튼은 3단 `max-w`로 확장
  - 수정 범위: 최상위 콘텐츠 wrapper의 grid 구조, 바텀시트 오버레이의 정렬 클래스, 하단 고정 버튼의 `max-w`
  - 유지: `saveAnswer`, `submit`, `load`, `choiceValues`, `youtubeEmbedUrl`, `savingQuestionIds`, `showConfirm` 상태와 그 판정 로직, 문항 순서(`activePaper.questions.map`), 선택지 `onClick` 핸들러
  - 위험 요소: 좌우 분리 시 `sticky` 컬럼이 실수로 문항 목록의 `key`/순서 렌더링에 영향을 주지 않도록 grid wrapper만 건드리고 `.map()` 내부는 그대로 유지해야 함
  - 검증: 1280px에서 좌측 탭 클릭 시 우측 문항이 정상 전환되는지, 답안 선택→자동저장→제출 흐름이 리디자인 전후 동일한지 수동 회귀

- [ ] `frontend/app/student/sprint/exams/attempts/[attemptId]/result/page.tsx`
  - 현재: 이미 `StudentResultShell`(`:181-191`)로 3단 반응형 구현됨
  - 목표: 이 파일의 패턴을 다른 페이지들의 참조 템플릿으로 재사용(이 파일 자체는 추가 변경 최소화, 다른 그룹과의 토큰 일치 여부만 점검)
  - 수정 범위: 색상/radius 토큰이 `StudentUIDesignSystem.md`와 어긋나는 부분이 있으면 값만 정합화(예: `#10213D` 사용 일관성 확인)
  - 유지: 전체 데이터 로딩/점수 계산 로직
  - 검증: 기존 스냅샷과 시각적으로 큰 차이 없는지 확인(이미 목표 상태에 가장 가까운 페이지)
```

### Phase 4 — 영단어 시험 화면
일반 영단어 test/result, SPRINT 영단어 test/result.

```md
- [ ] `frontend/app/student/vocabulary/test/[sessionId]/page.tsx`
  - 현재: `ScreenShell` 미사용, 자체 `<main className="min-h-screen bg-[#F4F7F6] pb-28">`, `max-w-[680px] mx-auto`(`:18-19`), 코드가 한 줄로 압축
  - 목표: `max-w-[680px] md:max-w-[760px] lg:max-w-[820px]` 정도로만 확장(시험지 성격상 지나치게 넓히지 않음), 코드 포맷팅은 이번 UI 단계 범위 밖(포맷팅 변경은 로직에 손대지 않는 범위에서 별도 청소 커밋으로 분리 권장)
  - 수정 범위: `<main>`과 내부 `max-w-[680px]` 컨테이너의 className만
  - 유지: `submit`, 자동저장 `useEffect`(500ms 디바운스), `values`/`session`/`saveState` 상태, `inputs` ref 기반 엔터키 포커스 이동
  - 검증: 375px/768px/1280px에서 입력 카드 폭이 과도하게 늘어지지 않는지 확인, 엔터키 다음 문항 이동 동작 불변 확인

- [ ] `frontend/app/student/vocabulary/result/[sessionId]/page.tsx`
  - 현재: `max-w-[700px] mx-auto`(`:19`), 상단 다크 스코어 카드
  - 목표: 동일하게 `md:`/`lg:` 단계적 확장
  - 수정 범위: 컨테이너 className만
  - 유지: `review` 함수, `onlyWrong` 상태, 결과 계산(`rate`, `questions` 필터링)
  - 검증: 오답만 보기 토글 동작 불변, 재시험 버튼 동작 불변
```
(`sprint/vocabulary/test/[sessionId]/page.tsx`, `sprint/vocabulary/result/[sessionId]/page.tsx`도 동일 패턴 — 이쪽은 이미 정상 포맷팅이라 diff가 더 명확할 것)

### Phase 5 — 정리 및 검수
중복 className 정리, 사용하지 않는 스타일 확인, viewport별 시각 검수, 기능 회귀 테스트.

```md
- [ ] 전 그룹 공통
  - 현재: 오류 배너/빈 상태 className이 파일마다 리터럴 중복(11절)
  - 목표: `InlineErrorBanner`, `EmptyStateCard` 공통 컴포넌트로 치환
  - 수정 범위: 각 페이지의 해당 JSX 블록을 컴포넌트 호출로 교체(조건문 `{error && ...}` 자체의 조건은 불변)
  - 유지: `error`/`assignments` 등 상태 판정 로직
  - 검증: 치환 전후 렌더링 결과(텍스트, 색상)가 동일한지 스냅샷 비교
```

## 18. 단계별 변경 파일

- Phase 0: `screen-shell.tsx`, `student-bottom-nav.tsx`, `sprint-bottom-nav.tsx`, `layout.tsx`, `globals.css`, `tailwind.config.ts`(토큰 주석/색상 정리가 필요하면)
- Phase 1: 그룹 A·B·C의 페이지 파일 전부(4절 목록 참고)
- Phase 2: 그룹 D·E 페이지 전부 + `sprint/vocabulary/page.tsx`, `sprint/vocabulary/wrong-notes/page.tsx`, `vocabulary/wrong-notes/page.tsx`
- Phase 3: `sprint/exams/page.tsx`, `sprint/exams/[assignmentId]/page.tsx`, `sprint/exams/attempts/[attemptId]/page.tsx`, `sprint/exams/attempts/[attemptId]/result/page.tsx`
- Phase 4: `vocabulary/test/[sessionId]/page.tsx`, `vocabulary/result/[sessionId]/page.tsx`, `sprint/vocabulary/test/[sessionId]/page.tsx`, `sprint/vocabulary/result/[sessionId]/page.tsx`
- Phase 5: 위 전체 중 오류 배너/빈 상태 블록을 포함한 파일 + 신규 공통 컴포넌트 파일(`frontend/components/inline-error-banner.tsx`, `frontend/components/empty-state-card.tsx` 등 신규 생성분)

## 19. 단계별 완료 조건

- Phase 0: 셸·네비 3종이 375/768/1280px에서 동일한 `max-w` 기준을 공유하고, 데스크톱에서 외곽 그림자가 사라진다. SUIT 적용 방식이 결정되고(옵션 A 또는 B) 최소 한 페이지에서 실제로 로드되는 것을 확인한다.
- Phase 1~4: 각 그룹의 모든 페이지가 375/768/1280px에서 레이아웃이 깨지지 않고, 카드 그리드가 9~10절 표대로 전환되며, 그룹에 속한 모든 기존 기능(로드/제출/토글/네비게이션)이 리디자인 전과 동일하게 동작한다.
- Phase 5: 중복 className이 공통 컴포넌트로 치환되고, 사용하지 않는 임의값 클래스가 남아있지 않으며, 전체 페이지에 대한 회귀 테스트(24절)를 통과한다.

## 20. 단계별 테스트

- Phase 0: 셸/네비 폭 스냅샷 비교(375/768/1280px), 폰트 로딩 성공 여부(네트워크 탭), 기존 페이지 아무거나 열어 콘솔 에러 없는지 확인
- Phase 1~4: 그룹별 대표 페이지 1~2개를 3개 뷰포트에서 수동 클릭 테스트(카드 클릭 이동, 폼 입력, 제출), 나머지 페이지는 시각 검수 위주
- Phase 3(OMR)은 별도로 전체 플로우 테스트 필수: 시험 목록 → 상세 → 시작 → 문항 답안 선택(자동저장 확인) → 제출 전 확인 모달 → 제출 → 결과 페이지까지 엔드투엔드 수동 확인
- Phase 5: 전체 페이지 목록(4절)을 순회하며 콘솔 에러/깨진 레이아웃 유무 최종 확인

## 21. 권장 커밋 단위

1. `Phase 0: responsive shell + nav breakpoints`
2. `Phase 0: SUIT font wiring`(방식 확정 후 별도 커밋으로 분리 권장)
3. `Phase 1: 오늘도 해냄 대시보드/진도 responsive grid`(그룹 A)
4. `Phase 1: 오늘도 해냄 과목/교재 responsive grid`(그룹 B)
5. `Phase 1: 오늘도 해냄 인강 responsive grid`(그룹 C)
6. `Phase 2: SPRINT 일반 화면 responsive grid`(그룹 D)
7. `Phase 2: SPRINT 문제지 + 영단어 목록/오답 responsive grid`(그룹 E, G 일부)
8. `Phase 3: SPRINT 모의고사 목록/상세 responsive grid`
9. `Phase 3: SPRINT OMR 응시 데스크톱 2단 분리`(가장 리스크 높은 커밋, 단독으로 분리)
10. `Phase 3: 결과 페이지 토큰 정합화`
11. `Phase 4: 영단어 test/result 반응형 컨테이너`(4파일 한 커밋 또는 2커밋)
12. `Phase 5: 공통 컴포넌트 추출 및 중복 제거`

각 커밋은 기능 코드 diff가 0이어야 하며(className/구조만 변경), 커밋 메시지에 "UI only, no behavior change"를 명시하는 것을 권장.

## 22. 위험 요소와 롤백 방법

| 위험 | 대상 | 완화/롤백 |
|---|---|---|
| OMR 좌우 분리 시 문항 순서/상태 렌더링 꼬임 | `attempts/[attemptId]/page.tsx` | grid wrapper만 커밋을 분리(9번 커밋)해서 문제 시 해당 커밋만 단독 revert. `.map()` 내부·핸들러는 diff 금지 규칙으로 원천 차단 |
| 바텀시트 → 중앙 모달 전환 시 모바일 회귀 | 동일 파일 `:308-324` | `md:` 접두어로만 분기, 모바일 기본값(`items-end`)은 그대로 두어 모바일 다이제스트 영향 없음 |
| SUIT 폰트 로딩 실패로 텍스트 깨짐 | `layout.tsx`/`globals.css` | `--font-body` 폴백 체인에 기존 Pretendard 유지, CDN 장애 시에도 폴백으로 표시됨 |
| 하단 고정 CTA `max-w` 확장 시 데스크톱에서 버튼이 콘텐츠와 정렬 안 맞음 | 여러 페이지의 `.fixed` 버튼 | 콘텐츠 컬럼과 동일한 `max-w`+`mx-auto` 기준을 공유하도록 강제, 페이지별 검증 항목에 정렬 확인 포함 |
| 영단어 test 코드가 한 줄로 압축돼 있어 diff 리뷰 누락 위험 | `vocabulary/test`, `vocabulary/result` | className 변경 전 우선 포맷팅만 별도 커밋(로직 무변경)으로 분리한 뒤 그 위에 className 변경 적용 — 리뷰어가 diff를 읽을 수 있게 함 |
| 공통 컴포넌트 추출 시 일부 페이지에서 조건 로직 실수로 함께 옮겨짐 | Phase 5 | 추출은 순수 표시부(JSX 마크업)만, `{error && <X/>}`의 조건문은 항상 호출부에 남기고 컴포넌트는 `error` 문자열만 prop으로 받게 설계 |

## 23. Codex 작업 체크리스트

- [ ] 각 Phase 착수 전 대상 파일을 실제로 Read해서 현재 className이 이 문서 기술과 정확히 일치하는지 재확인(파일이 그 사이 변경됐을 수 있음)
- [ ] className/구조 변경만 수행하고 `git diff`에 `useEffect`, `useState`, 함수 정의, `apiFetch` 호출부가 걸리지 않는지 커밋 전 확인
- [ ] `docs/StudentUIDesignSystem.md`의 토큰 표에 없는 새 hex/px 값을 도입하지 않았는지 확인
- [ ] 3개 뷰포트(375/768/1280px)에서 각 변경 파일을 직접 렌더링해 시각 확인
- [ ] OMR 관련 파일은 반드시 실제 답안 선택→자동저장 알림(`notice`)→제출 확인 모달→제출까지 수동으로 눌러본다
- [ ] Phase 완료 후 이 문서의 "완료 조건"(19절) 항목을 하나씩 체크
- [ ] 발견되는 기능적 이상은 코드로 고치지 않고 이 문서 "발견 사항" 섹션에 텍스트로만 추가 보고

## 24. 최종 회귀 테스트 체크리스트

- [ ] 로그인 → `/student` 홈 진입, 하단 네비 5개 탭 전부 이동 확인
- [ ] 오늘의 미션 체크 토글(`task-checkbox`) 정상 동작
- [ ] 진도표(`curriculum`) 그래프 노드 클릭 및 상태 필터 정상 동작
- [ ] 과목 → 교재 → 단원 체크리스트까지 진입 흐름 정상
- [ ] SPRINT 홈 진입, `SprintBottomNav` 5개 탭 전부 이동 확인
- [ ] SPRINT 문제지 제출 폼(`proof-form.tsx`) 정상 제출
- [ ] SPRINT 모의고사: 목록 → 상세 → 시작 → OMR 답안 선택(객관식/주관식) → 자동저장 알림 표시 → 제출 전 확인 모달 → 제출 → 결과 페이지까지 전 구간 동작
- [ ] 영단어(일반/SPRINT 양쪽): 시험 시작 → 입력 → 자동저장 → 제출 → 결과 → 오답 재시험 흐름 동작
- [ ] 375px/768px/1280px 3개 뷰포트에서 콘솔 에러 없음
- [ ] 데스크톱(1280px)에서 앱 프레임 외곽 그림자가 보이지 않음
- [ ] 로그아웃 정상 동작(`header.tsx`의 `handleLogout`)

---

## 발견 사항 (기능 문제, 별도 처리 필요)

이번 조사 중 시각적 재설계 범위를 벗어나는 항목들을 발견했다. 이 계획에는 수정 사항으로 포함하지 않았으며, 별도 논의/작업이 필요하다.

1. **영단어 test/result 4개 페이지에 공통 셸/하단 네비 없음**: `ScreenShell`도 `StudentBottomNav`/`SprintBottomNav`도 쓰지 않고 완전히 독립된 `<main>`으로 구현돼 있다. 시험에 집중하도록 의도된 설계일 수 있으나, 사용자가 시험 도중 다른 메뉴로 이동할 방법이 상단의 텍스트 링크(`← 나가기`/`챌린지 홈`) 하나뿐이라는 점은 정보구조(IA) 관점에서 별도 확인이 필요하다.
2. **OMR 주관식 입력이 uncontrolled(`defaultValue`+`onBlur`) 방식**: 같은 화면의 객관식 버튼은 controlled(`answers` 상태 직접 반영)인 반면, 주관식 입력(`attempts/[attemptId]/page.tsx:292-298`)은 `defaultValue`+`onBlur` 저장 방식이라 리렌더 시 입력값 동기화 방식이 다르다. 현재는 정상 동작하는 것으로 보이나, 추후 값 동기화 버그의 잠재 지점이 될 수 있어 별도 검토를 권장한다.
3. **`textbooks/[key]/page.tsx`의 로드 실패 처리 미흡**: `apiFetch` 실패 시 `catch { setTextbook(null) }`만 하고 별도 에러 메시지 없이 `title` fallback("교재 체크리스트")만 표시된다(`:39-42`). 사용자에게 "불러오지 못했습니다" 같은 안내가 없어, 실제로 데이터가 없는 것인지 로드 실패인지 구분이 안 된다. UI 문구 추가가 아니라 에러 상태 자체를 새로 만드는 것이라 이번 범위(className만 수정) 밖으로 판단했다.
