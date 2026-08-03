# Student UI Design System

이 문서는 AIMON 학생 화면(AIMON 기본 학습 흐름 + SPRINT)에 실제로 적용할 최종 디자인 시스템을 정의한다. 모든 색상·spacing·radius 값은 `frontend/app/student/**`, `frontend/components/**` 실제 코드에서 grep/Read로 확인한 값을 근거로 한다. 새로 추측한 값은 없다.

이 문서는 설계 문서이며, 이 단계에서 `.tsx`/`.ts`/`.css`는 수정하지 않는다. 실제 적용은 `docs/StudentUIRedesignPlan.md`의 Phase 0부터 별도로 진행한다.

---

## 1. 디자인 목표

- AIMON 기본 학습 흐름과 SPRINT 두 영역이 공존하는 학생 화면 전체에 **일관된 spacing·radius·타이포그래피 규칙**을 적용하되, **영역별 색은 분리**한다.
- 현재 430px 모바일 앱 프레임에 고정된 레이아웃을 모바일/태블릿/데스크톱에서 자연스럽게 넓어지는 반응형 구조로 바꾼다.
- 기존에 검증된 반응형 패턴(`StudentResultShell`, `frontend/app/student/sprint/exams/attempts/[attemptId]/result/page.tsx:181-191`)을 표준으로 승격한다.
- 시험 응시(OMR), 자동저장, 채점, 제출 같은 기능 로직은 절대 건드리지 않고 시각 레이어만 재설계한다.
- 접근성(키보드 포커스, aria)의 현재 공백을 문서화하고 최소 기준을 제시한다.

## 2. 토스 가이드에서 참고할 원칙

`docs/TossUIDesignGuide.md`에서 색상·폰트를 제외하고 아래 원칙만 가져온다.

- 버튼의 로딩/비활성/눌림/키보드 포커스 상태를 명확히 구분해서 보존한다.
- 정보 계층(제목 → 본문 → 보조문구)을 크기·굵기·색상 대비로 분명히 나눈다.
- 카드/섹션 내부 여백과 요소 간 간격을 일관된 스케일로 사용한다.
- 배지(badge)는 상태 표시 전용으로만 쓰고, 클릭 가능한 액션처럼 보이게 만들지 않는다.
- 절제된 카피, 불필요한 장식 문구를 지양한다.
- "flat color layering" 개념 — 그림자를 남발하지 않고 배경색 레이어 차이로 깊이감을 표현하는 방향을 지향점으로 삼는다(단, 아래 13번에서 서술하듯 현재 코드베이스는 이미 색이 있는 은은한 그림자를 광범위하게 쓰고 있어 완전히 배제하지는 않는다).

## 3. 토스 가이드에서 적용하지 않을 항목

- Primary 컬러 `#3182f6`를 그대로 쓰지 않는다. AIMON 기본 학습 흐름과 SPRINT는 각자의 실제 색을 유지한다(4·6·7절).
- Toss Product Sans를 쓰지 않는다. 전역 폰트는 SUIT으로 통일한다(9절).
- Toss가 명시한 카드/그림자/탭/토스트/다이얼로그의 "정답" 스펙을 그대로 이식하지 않는다 — 이 프로젝트는 이미 자체적인 카드 radius(20~30px 커스텀 값)와 색이 있는 그림자 언어를 갖고 있고, 이번 리디자인은 그것을 정리·체계화하는 것이지 토스 스타일로 대체하는 것이 아니다.
- 토스의 텍스트필드 4단 변형(box/line/big/hero) 명칭을 그대로 쓰지 않는다. 이 프로젝트의 입력창은 대부분 `h-11~h-14` 높이의 박스형 하나만 쓰고 있으므로 그 실사용 패턴을 기준으로 정의한다(18절).

## 4. AIMON과 SPRINT의 영역 구분

두 개의 학생 경험이 한 앱 안에 공존한다.

| 구분 | 진입 경로 | 톤 | 대표 색 |
|---|---|---|---|
| AIMON 기본 학습 흐름 | `/student`, `/student/today`, `/student/curriculum`, `/student/tracker`, `/student/subjects/**`, `/student/textbooks/**`, `/student/units/**`, `/student/lessons`, `/student/lectures/**`, `/student/my-progress` | 보라색 계열 브랜드, 진한 남색 텍스트 | `#17213B` 텍스트 + 보라 계열(6절) |
| SPRINT (미션형 학습 프로그램) | `/student/sprint/**` 전체(모의고사 포함) | 파란색·하늘색 계열 브랜드 | `#2874E8` primary(7절) |

`frontend/components/student-bottom-nav.tsx:17`이 `pathname.startsWith("/student/sprint")`일 때 자기 자신을 숨기고, `frontend/components/sprint-bottom-nav.tsx`가 그 자리를 대체하는 것이 이미 코드에 존재하는 분기 기준이다. 이 경로 기준(`/student/sprint` 접두어)을 브랜드 분기의 유일한 기준으로 삼는다.

예외: `/student/vocabulary/**`(AIMON 영단어)와 `/student/sprint/vocabulary/**`(SPRINT 영단어)는 두 영역 어디에도 완전히 속하지 않는 **제3의 서브 팔레트**(짙은 남색 카드 + 민트/틸 그린 강조, `#17213B` · `#45D3A2` · `#19A879`)를 쓰고 있다. 이는 실제 코드에서 확인된 사실이며, 이번 시스템에서는 이를 "영단어 전용 강조색"으로 명시적으로 인정하고 8절에 별도 토큰화한다(새 색을 만들지 않고 기존 값 유지).

금지: AIMON 기본 학습 흐름과 SPRINT를 단일 브랜드 색으로 통합하지 않는다. 두 톤이 같은 화면에 섞여 보이면 안 된다.

## 5. 공통 중립 색상 체계

두 브랜드 모두에서 공통으로 쓸 수 있는 무채색/거의 무채색 값. Tailwind 기본 gray 스케일과 프로젝트 커스텀 hex가 혼재되어 있던 것을 아래처럼 정리한다.

| 토큰 | 값 | 근거 |
|---|---|---|
| `neutral-canvas` | `#F8FAFC` / `#EEF2F6` | `screen-shell.tsx:10-11` (바깥 배경 `#EEF2F6`, 안쪽 배경 `#F8FAFC`) |
| `neutral-surface` | `#FFFFFF` | 카드 배경 전반 |
| `neutral-border` | `#E5E7EB` (AIMON) / `#DFEAF6`, `#DCEBFA` (SPRINT) | `tailwind.config.ts` `brand.border`, `sprint/exams/page.tsx:102,115` |
| `neutral-text-strong` | AIMON `#17213B` / SPRINT `#10213D` | 6·7절 참고 |
| `neutral-text-muted` | `#98A1B3`, `#98A2B3`, `#8A94A8`, `#7A859F` (AIMON) / `#6E7F99`, `#8CA0BD` (SPRINT) | 컴포넌트·페이지 다수 |
| `neutral-disabled` | `#B8C4D6` | `sprint/exams/[assignmentId]/page.tsx:185` 비활성 버튼 배경 |

원칙: 새 화면을 만들 때 임의의 회색(`text-gray-400` 등 Tailwind 기본 팔레트)을 새로 도입하지 말고, 이미 코드에 존재하는 위 값 중에서 고른다. 기존에 `text-gray-400`, `text-gray-500`, `text-gray-900` 같은 Tailwind 기본 클래스도 다수 섞여 있으므로(`stat-card.tsx`, `unit-card.tsx`, `header.tsx`) — 이들을 즉시 강제 치환하지는 않되, 신규/수정 영역에서는 위 커스텀 토큰을 우선한다.

## 6. AIMON 보라색 토큰

실제 코드(`frontend/app/student/page.tsx`, `subjects/page.tsx`, `components/curriculum-graph.tsx`, `components/student-card.tsx` 등)에서 확인된 보라/인디고 계열 hex를 있는 그대로 토큰화한다. **단일 값으로 통합하지 않는다** — 용도별로 이미 분화되어 쓰이고 있었기 때문에, 그 용도 구분을 그대로 유지한다.

| 토큰 | 값 | 실사용 근거 | 용도 |
|---|---|---|---|
| `today-purple-primary` | `#635BFF` | `curriculum-graph.tsx:58` (`in_progress` 상태 텍스트/닷) | 진행 중 상태, 강조 텍스트 |
| `today-purple-primary-alt` | `#6D73FF` | `student/page.tsx` 등 14회 | primary와 상호 교체적으로 쓰이는 근접값 — 리디자인 시 `today-purple-primary`로 점진 통일 대상 |
| `today-purple-icon-1` | `#6366F1` (indigo) | `subjects/page.tsx:65` `ringColor` | 원형 진행률 링, 아이콘 배지(수1) |
| `today-purple-icon-2` | `#8B5CF6` (violet) | `subjects/page.tsx:77` `ringColor` | 원형 진행률 링, 아이콘 배지(수2) |
| `today-purple-weak-bg` | `#EEF2FF` | `student-card.tsx:53,101`, `subjects/page.tsx` indigo-50 계열 | 아이콘 원형 배경, 약한 강조 박스 |
| `today-purple-weak-bg-alt` | `#F1EDFF`, `#F1F0FF`, `#F1EEFF` | `curriculum-graph.tsx:58` | `in_progress` 배지/카드 배경 |
| `today-purple-deep` | `#4F46E5` | 리스트/상세 페이지 소수 사용 | 진한 강조가 필요한 텍스트 |

발견된 이탈값: `frontend/app/student/lessons/page.tsx:46`의 `#5C63FF`(뒤로가기 버튼 텍스트)는 위 클러스터와 가깝지만 정확히 일치하는 값이 없는 1회성 사용이다. SPRINT가 아니라 **AIMON 기본 학습 흐름** 쪽에서 발견됐다는 점에 주의 — 리디자인 시 `today-purple-primary`(`#635BFF`) 또는 `today-purple-primary-alt`(`#6D73FF`)로 흡수 통합할 후보다.

원칙: 새로운 보라색을 만들지 않는다. 위 표에 없는 보라 계열 값이 필요하면 반드시 코드에서 재검색 후 근접값을 골라 쓴다.

## 7. SPRINT 하늘색·파란색 토큰

확정된 SPRINT 팔레트는 `Primary #2874E8`, `Weak bg #EAF5FF`, `Strong text #10213D`이다. 이를 실제 코드와 대조했다.

| 토큰 | 확정값 | 코드 실측값 | 검증 결과 |
|---|---|---|---|
| `sprint-primary` | `#2874E8` | `#2874E8` (106회, `sprint-bottom-nav.tsx:42`, `sprint/exams/page.tsx` 전역 등) | **정확히 일치.** 그대로 채택 |
| `sprint-weak-bg` | `#EAF5FF` | `#EAF5FF` (29회, `sprint/exams/page.tsx:60,103,137` 등) | **정확히 일치.** 그대로 채택 |
| `sprint-strong-text` | `#10213D` | `#10213D` (97회, `sprint/exams/page.tsx:93,104,119` 등 SPRINT 전 페이지) | **정확히 일치.** 그대로 채택 |

확정: `sprint-strong-text` 토큰은 `#10213D`다. 코드 전역(97회)에서 이미 압도적으로 쓰이던 값과 정확히 일치하며, 초안 검토 단계에서 근사값으로 제시됐던 `#10233F`는 프로젝트 토큰으로 사용하지 않는다.

추가로 SPRINT 전역에서 함께 쓰이는 파생 토큰:

| 토큰 | 값 | 근거 |
|---|---|---|
| `sprint-primary-strong` | `#2E8AEA`, `#2E74E8`, `#145FDB` | 호버/눌림 등 primary의 진한 변형으로 추정되는 근접값들(8·6회) |
| `sprint-body-muted` | `#6E7F99` | 67회, 카드 본문/보조문구 (`sprint/exams/page.tsx:94,105,120`) |
| `sprint-muted-light` | `#8CA0BD` | 28회, 더 옅은 보조문구 (`sprint/exams/page.tsx:100,130`) |
| `sprint-border` | `#DFEAF6`(38회), `#DCEBFA`(37회) | 카드 `ring-1` 테두리 |
| `sprint-surface-tint-1` | `#F6FAFF` | 카드 안 소박스 배경 |
| `sprint-surface-tint-2` | `#F1F7FF` | 강조 박스 배경(`sprint/my/page.tsx:73,79`) |
| `sprint-canvas-gradient` | `radial-gradient(circle_at_50%_-5%, #D9F6FF 0, #EEF9FF 34%, #F8FBFF 68%)` | `sprint/exams/page.tsx:85`, `sprint/exams/[assignmentId]/page.tsx:123`, `sprint/exams/attempts/[attemptId]/page.tsx:195`, `sprint/my/page.tsx:53`, `sprint/worksheets/page.tsx:67` 등 SPRINT 메인 화면 배경으로 반복 사용 |

이탈값 확인: 사용자가 우려했던 `#5C63FF`는 **SPRINT 디렉터리 어디에도 존재하지 않는다**(grep 결과 0건). SPRINT는 색상 관점에서 AIMON의 보라 계열과 실제로 잘 분리되어 있다 — 유일한 예외는 8절에서 다루는 영단어 서브 팔레트(`#17213B` 등)가 `/student/sprint/vocabulary/**` 경로에도 그대로 쓰이는 것이다.

## 8. 성공·경고·오류·비활성 상태 색상

SPRINT 쪽 상태 배지에서 이미 일관된 3색 체계가 있다(`sprint/exams/page.tsx:59-65`, `sprint/exams/[assignmentId]/page.tsx:60-65`의 `StateCard`/`statusTone` 함수). 이를 공통 semantic 토큰으로 승격한다.

| 상태 | 배경 | 텍스트 | 근거 |
|---|---|---|---|
| `state-info`(진행 가능/응시 중) | `#EAF5FF` | `#2874E8` | `sprint/exams/page.tsx:60` |
| `state-pending`(대기/제출완료) | `#FFF6E2` | `#D68B00`, `#9A6500`, `#E18A00` (혼재) | `sprint/exams/page.tsx:61`, `sprint/exams/[assignmentId]/page.tsx:157` |
| `state-success`(채점완료/정답) | `#EAF8F1` | `#17895E`, `#18A566`, `#12815F` (혼재) | `sprint/exams/page.tsx:62` |
| `state-danger`(무효/오답/에러) | `#FFF0F0`, `bg-red-50` | `#E25050`, `#D94343`, `#E15B45`, `#E5533C`, `text-red-600` (혼재) | `sprint/exams/page.tsx:63`, 다수 에러 배너 |
| `state-disabled` | `#B8C4D6`(배경) | `text-white`, `opacity-45~55` | `sprint/exams/[assignmentId]/page.tsx:185`, 각종 `disabled:opacity-*` |

AIMON 쪽 대응 값(현재 상태 배지에서 확인):

| 상태 | 배경 | 텍스트 | 근거 |
|---|---|---|---|
| `state-success`(진행 중/양호) | `bg-emerald-50`, `#DCFCE7`, `#D1FAE5` | `text-emerald-600`, `#065F46`, `#16A34A`, `#22C55E` | `student-card.tsx:26`, `subject-card.tsx:36-38` |
| `state-danger`(진도 낮음) | `bg-red-50` | `text-red-500` | `student-card.tsx:21` |
| `state-warning`(체크 필요) | `bg-orange-50` | `text-orange-500` | `student-card.tsx:23` |

경고/오류 색은 정확한 hex가 두 영역·기능별로 미세하게 갈라져 있다(`#E25050` vs `#D94343` vs `#E15B45` 등). 완전 통일은 이번 범위 밖으로 두고, semantic 토큰 4종(info/pending·warning/success/danger) + disabled 1종의 **역할 구분만 표준화**한다. 값 자체는 브랜드 캔버스(AIMON/SPRINT)에 맞는 근접값을 그대로 사용해도 된다.

영단어 서브 팔레트(AIMON·SPRINT 공통, 8절 별도 인정):

| 토큰 | 값 | 근거 |
|---|---|---|
| `vocab-accent-fill` | `#45D3A2` | 진행바 채움, 정답 강조 (`vocabulary/test/[sessionId]/page.tsx`) |
| `vocab-accent-text` | `#19A879`, `#12815F`, `#276B58` | "저장됨" 상태, 정답 텍스트 |
| `vocab-accent-weak-bg` | `#E7F9F2`, `#F0FAF6` | 안내 박스 배경 |
| `vocab-card-dark` | `#17213B` | 결과 화면 상단 스코어 카드 배경(`vocabulary/result/[sessionId]/page.tsx:20`) |
| `vocab-wrong` | `#F27A63`, `#E15B45`, `#D95D48` | 오답 강조 |

## 9. SUIT 폰트 전역 적용 방식

현재 상태(재확인 완료, `frontend/app/globals.css:1-24`, `frontend/app/layout.tsx:18-20`):
- `--font-body`: `'Pretendard Rounded', 'Pretendard Variable', 'Pretendard', ...` — CDN(`pretendardvariable-dynamic-subset.css`)에서 로드.
- `--font-display`, `--font-button`, `--font-number`: `JalnanGothic`, `Cafe24Ssurround`를 `@font-face`로 jsDelivr CDN에서 로드(`globals.css:5-16`), 제목(h1/h2 `.font-black`/`.font-extrabold`)과 버튼에 적용.

목표 상태: 기본 UI 폰트를 SUIT으로 전환한다. **이번 단계에서는 실제 적용을 하지 않는다** — 아래는 Phase 0에서 선택할 옵션의 설계다.

옵션 A — CDN 방식(현재 Pretendard와 동일한 패턴 유지):
- SUIT 공식 CDN(`sunn.us`/`cdn.jsdelivr.net` 배포) `<link>` 태그를 `layout.tsx`의 기존 Pretendard `<link>` 자리에 교체 삽입.
- `globals.css`의 `--font-body` 값을 `'SUIT Variable', 'SUIT', 'Pretendard Variable', system-ui, sans-serif`처럼 SUIT을 1순위, 기존 Pretendard를 폴백으로 남겨 전환 리스크를 낮춘다.
- 장점: 현재 구조 변경이 가장 적음, 배포 파이프라인 변경 불필요.
- 단점: 외부 CDN 의존 유지, 폰트 로딩 성능이 네트워크에 좌우됨.

옵션 B — `next/font/local` 방식:
- SUIT 폰트 파일(`.woff2`)을 `frontend/public/fonts/` 또는 `frontend/app/fonts/`에 두고 `next/font/local`로 로드, `layout.tsx`에서 `className`/CSS 변수(`--font-suit`)로 주입.
- 장점: self-host로 CDN 장애에 영향받지 않음, Next.js가 자동으로 폰트 최적화(preload, `font-display` 처리)를 해줌.
- 단점: 폰트 파일을 리포에 실제로 추가하는 작업이 필요(이번 단계 범위 밖), 라이선스 파일 배치 확인 필요.

제목용 display 폰트(`JalnanGothic`/`Cafe24Ssurround`) 처리 방향: 이번 리디자인의 핵심은 SUIT 전역 적용이므로, `--font-display`/`--font-button`도 SUIT 계열(굵은 weight)로 대체할지, 아니면 브랜드 포인트로 두 폰트를 유지할지는 Phase 0에서 별도 결정 항목으로 둔다. 이 문서는 "본문·UI 기본 폰트는 SUIT, display 폰트는 후속 결정"으로 범위를 좁혀 명시한다.

공통 금지: Toss Product Sans를 어떤 형태로도 로드하지 않는다.

## 10. 제목·본문·보조문구 타이포그래피 계층

토스 가이드의 계층 개념(제목→본문→보조문구)을 차용하되 값은 프로젝트 실사용 기준으로 정의한다(`font-black`이 프로젝트에서 사실상 h1/h2 역할을 하고 있음, `header.tsx:49`, `subjects/page.tsx:142` 등).

| 레벨 | 크기/굵기 | 용도 | 근거 |
|---|---|---|---|
| Display (페이지 대제목) | `text-3xl font-black tracking-[-0.05em]` | SPRINT 페이지 최상단 타이틀 | `sprint/exams/page.tsx:93`, `sprint/my/page.tsx:57` |
| H1 | `text-2xl font-black` | AIMON 페이지 타이틀, `Header` 컴포넌트 | `header.tsx:49` |
| H2 | `text-xl font-black` ~ `text-lg font-black` | 섹션 제목, 카드 상세 제목 | `sprint/exams/[assignmentId]/page.tsx:151`, `subject-card.tsx:72` |
| Body | `text-sm font-semibold` ~ `text-sm font-bold` | 본문 설명, 카드 보조 텍스트 | `sprint/exams/page.tsx:94,120` |
| Body-small / Caption | `text-xs font-bold` ~ `text-[11px] font-black` | 배지, 라벨, 타임스탬프 | `sprint/exams/page.tsx:88`, `progress-bar.tsx:37` |
| Eyebrow(상단 라벨) | `text-sm font-black tracking-[0.18em]` | "SPRINT EXAM", "OMR ANSWER" 같은 섹션 식별 라벨 | `sprint/exams/page.tsx:92`, `sprint/exams/attempts/[attemptId]/page.tsx:208` |

원칙: `font-black`/`font-bold`를 지금처럼 폭넓게 쓰는 것은 유지한다(이 프로젝트의 시각적 정체성). 다만 같은 레벨의 텍스트가 페이지마다 `text-2xl`/`text-3xl`을 임의로 오가지 않도록, 신규 작업 시 위 6단계 중 하나를 선택해서 쓴다.

## 11. spacing 체계

`tailwind.config.ts`에 별도 spacing 오버라이드가 없으므로 **Tailwind 기본 4px 스케일**(`1=4px, 2=8px, 3=12px, 4=16px, 5=20px, 6=24px, 8=32px`)이 이미 전역 기준이다. 실사용 빈도 조사 결과(SPRINT 기준 `px-4`/`py-3` 56회, `p-5` 43회, `gap-3` 30회, `px-5` 29회, `gap-2` 26회, `gap-4` 20회 등)도 이 스케일과 정확히 일치한다.

Toss 가이드의 `4/6/8/16/24/32`(6px 스텝 포함)는 채택하지 않는다 — 이미 코드가 100% Tailwind 기본 4px 배수로 통일돼 있으므로 6px 스텝을 섞으면 오히려 새로운 불일치가 생긴다.

| 용도 | 값 |
|---|---|
| 카드 내부 padding | `p-4`(16px) ~ `p-5`(20px), 큰 히어로 카드는 `p-6`(24px)~`p-8`(32px) |
| 카드 사이 세로 간격 | `space-y-3`(12px) ~ `space-y-5`(20px, `ScreenShell` 기본값) |
| 아이콘·텍스트 가로 gap | `gap-2`(8px) ~ `gap-3`(12px) |
| 그룹 사이 gap(그리드) | `gap-3`(12px) ~ `gap-4`(16px) |
| 페이지 좌우 여백 | `px-5`(20px, `ScreenShell` 기본값) |

## 12. border radius 체계

실사용 빈도(SPRINT: `rounded-2xl` 85회, `rounded-full` 69회, `rounded-[28px]` 24회, `rounded-[22px]` 15회, `rounded-[20px]` 12회, `rounded-[24px]` 11회 / AIMON: `rounded-full` 87회, `rounded-2xl` 47회, `rounded-[28px]` 13회, `rounded-[24px]` 12회)를 기준으로 3단계로 정리한다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `radius-pill` | `rounded-full` | 배지, 알약형 버튼, 탭, 아바타 |
| `radius-control` | `rounded-2xl`(16px), 보조로 `rounded-xl`(12px) | 입력창, 작은 버튼, 리스트 안 소박스 |
| `radius-card` | `rounded-[20px]` ~ `rounded-[28px]`(실측 클러스터 20/22/24/26/28px) | 카드, 섹션, 바텀시트, 빈 상태 박스 |

`radius-card`는 정확히 하나의 값으로 강제 통일하지 않는다 — 카드 크기(작은 리스트 아이템 vs 큰 히어로 섹션)에 따라 20px~28px 사이에서 고르되, **새 화면에서는 24px(`rounded-[24px]`)를 기본값**으로 삼고, 히어로/모달급 카드만 28px을 쓴다. 이렇게 하면 기존 시각 언어를 깨지 않으면서 앞으로의 무작위 증식(30px, 26px, 18px 등 1~2회성 값)을 막는다.

## 13. 그림자와 테두리 원칙

토스 가이드는 그림자 토큰을 두지 않고 flat layering을 권장하지만, 이 프로젝트는 이미 영역별로 **색이 있는 은은한 그림자**를 광범위하게 쓰고 있다(SPRINT: `rgba(71,104,143,*)`, `rgba(49,89,130,*)`가 카드에, `rgba(40,116,232,*)`가 primary 버튼에 / AIMON: `shadow-card` = `rgba(15,23,42,0.06)`가 33회, 보라 계열 `rgba(109,115,255,*)`가 강조 CTA에). 이는 이미 확립된 시각 언어이므로 **토스 원칙을 그대로 따르지 않고, 기존 색 그림자 언어를 토큰으로 정리해서 유지**한다.

| 토큰 | 값 | 용도 | 근거 |
|---|---|---|---|
| `shadow-today-card` | `shadow-card` = `0 4px 20px rgba(15,23,42,0.06)` | AIMON 기본 카드 | `tailwind.config.ts`, 33회 사용 |
| `shadow-today-cta` | `0 6px 16px rgba(140,132,255,0.25)` 계열 | 보라 강조 버튼 | 소수 페이지 |
| `shadow-sprint-card` | `0 12px 28px rgba(71,104,143,0.14)` | SPRINT 기본 카드 | `sprint/exams/page.tsx:115` |
| `shadow-sprint-card-lg` | `0 18px 36px rgba(49,89,130,0.16)` | SPRINT 히어로/상세 섹션 | `sprint/exams/[assignmentId]/page.tsx:131` |
| `shadow-sprint-cta` | `0 16px 35px rgba(40,116,232,0.28)` | SPRINT primary 버튼(고정 CTA 포함) | `sprint/exams/[assignmentId]/page.tsx:177,183` |

테두리: 카드는 그림자만 쓰거나(AIMON) 옅은 `ring-1`(SPRINT, `ring-[#DFEAF6]`/`ring-[#DCEBFA]`)을 함께 쓴다. 두 방식 다 유지하되, **SPRINT 카드는 ring을 항상 동반**하고 **AIMON 카드는 그림자만으로 구분**하는 현재 관례를 규칙으로 명문화한다.

데스크톱 확장 시 원칙: `screen-shell.tsx:11`의 바깥 `shadow-[0_0_60px_rgba(0,0,0,0.07)]`(앱 프레임 외곽 그림자)는 모바일 앱처럼 보이게 하는 장치이므로, 데스크톱 폭에서는 제거한다(이미 `StudentResultShell`이 `lg:shadow-none`으로 검증한 패턴, 14·22절 참고). 카드 내부 그림자(`shadow-card`, `shadow-sprint-card` 등)는 뷰포트와 무관하게 유지한다.

## 14. 모바일·태블릿·데스크톱 breakpoint

`tailwind.config.ts`에 `screens` 오버라이드가 없으므로 Tailwind 기본값을 그대로 breakpoint로 채택한다: `sm 640px`, `md 768px`, `lg 1024px`, `xl 1280px`.

검증된 기준 패턴(`StudentResultShell`, `.../result/page.tsx:184-185`):
```
max-w-[430px] md:max-w-[760px] lg:max-w-[1180px] lg:shadow-none
px-4 pb-32 pt-8 sm:px-5 sm:pt-10 lg:px-6
```

이 프로젝트의 breakpoint 원칙:
- **모바일**(`~767px`, 기본/`md:` 미만): 430px 앱 프레임 폭 유지, 1열, 바텀시트/터치 UX 그대로.
- **태블릿**(`md: 768px~1023px`): 컨테이너 `760px`까지 확장, 콘텐츠 성격에 따라 1열 또는 2열.
- **데스크톱**(`lg: 1024px~`): 컨테이너 `1180px`까지 확장, 콘텐츠 성격에 따라 2~3열, 앱 프레임 외곽 그림자 제거.

무조건 3열 금지 — 카드 개수가 적거나(예: 과목 3개) 세로 흐름이 중요한 화면(OMR, 시험 진행)은 데스크톱에서도 1~2열 유지.

## 15. 페이지 container와 최대 너비

| 뷰포트 | 최대 너비 | 근거 |
|---|---|---|
| 모바일 | `430px` | `screen-shell.tsx:11`, `student-bottom-nav.tsx:28`, `sprint-bottom-nav.tsx:32` |
| 태블릿 | `760px` | `result/page.tsx:184` 검증 패턴 |
| 데스크톱 | `1180px` | `result/page.tsx:184` 검증 패턴 |

공통 셸(`ScreenShell`)과 하단 네비(`StudentBottomNav`, `SprintBottomNav`)는 항상 같은 `max-w-*` 3단 값을 공유해야 한다 — 지금은 셸만 넓어지고 네비는 430px에 고정된 상태(리디자인 대상, `StudentUIRedesignPlan.md` 2절 참고).

## 16. 카드

기본 카드 스펙(공통):
- radius: `radius-card`(20~28px, 기본 24px)
- padding: `p-4`~`p-6`
- 배경: `bg-white` 또는 `bg-white/90~95`(SPRINT는 반투명 흰색을 자주 씀, 그라디언트 배경 위에 얹히기 때문)
- 그림자: 13절의 브랜드별 카드 그림자 + (SPRINT만) `ring-1` 테두리

리스트형 카드(클릭 가능): `Link`로 감싸고 `hover:-translate-y-0.5` 같은 미세한 hover 리프트를 유지(`student-card.tsx:49`, `subject-card.tsx:61`, `sprint/exams/page.tsx:112-115`는 hover 효과 없음 — SPRINT는 hover 리프트가 빠져있는데, 데스크톱 확장 시 클릭 가능한 카드에는 추가를 검토).

## 17. 버튼

실사용 기준(`sprint/exams/[assignmentId]/page.tsx:177,183,185`, `vocabulary/test/[sessionId]/page.tsx:19`):

| 종류 | 스펙 |
|---|---|
| Primary(대형, 하단 고정 CTA) | `h-14 rounded-[20px]` 배경 `sprint-primary`/브랜드 primary, `text-white font-black`, `shadow-sprint-cta` 계열 |
| Primary(다크, 결과/제출류) | `h-14 rounded-[20px]` 배경 `#10213D`/`#17213B`, 텍스트 흰색 |
| Secondary(아웃라인) | `h-12 rounded-2xl border` 텍스트만 색상, 배경 흰색 또는 투명 |
| Pill(작은 액션/필터) | `rounded-full px-3~4 py-1.5~2` |
| 비활성 | `disabled:opacity-45~55` 또는 배경을 `neutral-disabled`(`#B8C4D6`)로 교체 |
| 눌림(active) | `active:scale-[.99]` (`vocabulary/test/[sessionId]/page.tsx:19`에서 확인) — 다른 곳엔 거의 없음, 표준화 대상 |

원칙: disabled 상태는 `opacity` 방식과 `배경색 교체` 방식이 혼재돼 있다(`sprint/exams/[assignmentId]/page.tsx:183`은 opacity, `:185`는 배경 교체). 새 버튼은 **텍스트가 있는 액션은 opacity 방식, "아예 진행 불가"를 나타내는 버튼은 배경 교체 방식**으로 역할을 나눠서 쓴다.

## 18. 입력창

실사용 기준(`vocabulary/test/[sessionId]/page.tsx:19`, `sprint/exams/attempts/[attemptId]/page.tsx:296`, `proof-form.tsx:306`):
- 높이: `h-11`(작은 인라인 입력) ~ `h-14`(주요 입력)
- radius: `rounded-2xl`
- 테두리: `border` 또는 `border-2`, 기본 `border-[#E4E9EC]`/`border-[#C7D5E8]` 계열, 포커스 시 브랜드 primary 색으로 전환(`focus:border-[#45D3A2]`, `focus:border-[#2874E8]`)
- 배경: 기본은 옅은 회색(`bg-[#FAFCFB]`), 포커스 시 흰색으로 전환되는 패턴 존재(`vocabulary/test`)
- `outline-none` + `focus:border-*`만으로 포커스를 표시 — **키보드 포커스 링이 없다.** 27절 접근성 항목에서 보강한다.
- textarea: `resize-none rounded-2xl border p-3`, disabled 시 배경만 옅게(`disabled:bg-[#F5F8FC]`)

## 19. 탭

두 가지 실제 패턴이 확인됐다.

1) 세그먼트 필 탭(2개 옵션 토글) — `sprint/vocabulary/result/[sessionId]/page.tsx:76-89`: 바깥 `rounded-full bg-[#E7EBF0] p-1` 컨테이너 안에 `rounded-full px-3 py-1.5` 버튼 2개, 활성 = `bg-white shadow-sm` + 의미색 텍스트, 비활성 = 무색.
2) 가로 스크롤 칩 탭(과목/문항 그룹 전환) — `sprint/exams/attempts/[attemptId]/page.tsx:218-226`: `flex gap-2 overflow-x-auto`, 각 칩 `rounded-2xl px-4 py-2`, 활성 = 배경 `sprint-primary` + 흰 텍스트, 비활성 = 흰 배경 + `ring-1`.

이 두 패턴을 표준 탭 컴포넌트의 두 변형(`segment`/`chip-scroll`)으로 채택한다. 새 탭 UI가 필요하면 옵션 개수가 2~3개면 `segment`, 4개 이상이거나 가로 스크롤이 필요하면 `chip-scroll`을 쓴다.

## 20. 배지

상태 배지(semantic, 8절 색 사용): `rounded-full px-3 py-1.5 text-xs font-black`(`sprint/exams/page.tsx:124`), 더 작은 것은 `text-[11px]`.
카운트/정보 배지(중립): `rounded-full bg-[#F4F6FA] px-3 py-1 text-xs font-bold text-[#667085]`(`student-card.tsx:78`).

원칙(토스 가이드에서 채택): 배지는 상태 표시 전용이며 그 자체를 클릭 타깃으로 쓰지 않는다. 현재 코드에서 배지가 버튼 역할을 겸하는 곳은 없음 — 확인됨, 유지.

## 21. 안내 상자

두 종류가 확인된다.
- 정보/팁 박스(중립~브랜드 약한 배경): `flex items-start gap-2.5 rounded-2xl bg-indigo-50 px-4 py-3.5`(`subjects/page.tsx:172`), SPRINT는 `rounded-2xl bg-[#FFF8E8] px-4 py-3 text-[#9A6500]`(`sprint/exams/[assignmentId]/page.tsx:157`, 유의사항 톤).
- 오류 배너: `rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600` — 거의 모든 페이지에서 동일 문자열로 복붙되어 있음(`sprint/exams/page.tsx:97`, `.../worksheets/page.tsx:80`, `vocabulary/test/[sessionId]/page.tsx:19` 등). 공통 컴포넌트 추출 1순위 후보(리디자인 문서 11절).

## 22. 모달과 바텀시트

확인된 유일한 패턴은 OMR 제출 확인 시트다(`sprint/exams/attempts/[attemptId]/page.tsx:308-324`):
```
바깥: fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-4 pb-4
시트: w-full max-w-[430px] rounded-[28px] bg-white p-5 shadow-2xl
```
`items-end`로 하단 고정 — 모바일 바텀시트 형태.

원칙:
- 모바일(`<md`): 현재처럼 하단 시트(`items-end`) 유지 — 터치 사용성을 위해 그대로 둔다.
- 태블릿/데스크톱(`md` 이상): 같은 오버레이 구조를 `items-center`로 바꾸고 시트 `max-w`를 고정폭 모달(예 `max-w-[480px]`)로 전환해서 화면 하단에 어색하게 붙지 않게 한다. 시트 내부 콘텐츠·버튼·상태(`showConfirm`, `submitting`)는 그대로 재사용한다.

## 23. 하단 네비게이션

세 가지 구현이 존재한다(3개 다 실제로 확인):
- `StudentBottomNav`(`student-bottom-nav.tsx:28`): AIMON, `max-w-[430px]`, 배경 `#0F172A`.
- `SprintBottomNav`(`sprint-bottom-nav.tsx:32`): SPRINT, `max-w-[430px]`, 배경 `white/95` + `backdrop-blur`, 활성색 `#2874E8`.
- `BottomNav`(`bottom-nav.tsx:19`, 범용/관리자용 추정): `max-w-md`(448px), 배경 `bg-brand-deep`.

학생 화면에는 앞의 둘만 쓰인다. 두 네비 모두 **셸과 동일한 3단 `max-w`**(430/760/1180)를 갖도록 확장하고, 아이템 배치(`grid-cols-5`)는 넓은 화면에서도 그대로 유지하되 아이템 자체 폭·아이콘 크기를 넓은 컨테이너에 맞춰 살짝 키운다(현재처럼 5칸을 억지로 늘리지 않고, 네비 바 자체가 셸 폭만큼 넓어지는 것으로 대응).

## 24. 표와 데이터 목록

정형 `<table>` 사용처는 학생 화면에 없음(관리자 쪽 `admin-student-progress-manager.tsx` 등에만 존재, 이번 범위 아님). 학생 화면은 전부 **카드 리스트**로 데이터를 표현한다(`sprint/worksheets/page.tsx:89-108`, `sprint/exams/page.tsx:108-133`). `dl`/`dt`/`dd`를 쓴 키-값 요약 블록도 있다(`sprint/exams/[assignmentId]/page.tsx:140-145`, `flex justify-between` 행 반복).

원칙: 표 형태가 필요한 새 화면(예: 다건 성적 비교)이 생기면 `dl` 키-값 반복 패턴을 확장하거나, 데스크톱에서만 진짜 `<table>`을 도입하는 것을 검토 — 모바일에서는 반드시 카드/리스트 유지.

## 25. 시험 OMR

`sprint/exams/attempts/[attemptId]/page.tsx`의 실제 구조:
- 상단: 뒤로가기 + "제출 전 확인" 버튼(`:196-205`)
- 과목 전환 칩 탭, `sticky top-0`(`:216-228`)
- 활성 과목 카드: 진행률 배지 + (영어인 경우) 리스닝 embed(`:230-265`)
- 문항 목록: `grid grid-cols-[2.25rem_1fr]`, 객관식은 `grid grid-cols-5` 원형 버튼, 주관식은 인풋(`:267-304`)
- 제출 확인 바텀시트(`:308-324`)
- 하단 고정 제출 버튼(`:326-334`)

이 구조는 **로직(저장/제출)과 강하게 결합**되어 있으므로 무리하게 재조립하지 않는다. 데스크톱 2단 레이아웃 후보(리디자인 문서 6·10절에서 상세화):
- 좌측: 과목 칩 탭 + 진행 요약(고정/`sticky`)
- 우측: 문항 목록(현재 `grid-cols-[2.25rem_1fr]` 유지)

이렇게 나누면 문항 순서·onClick 핸들러는 그대로 두고 바깥 wrapper의 grid 구조만 `lg:` 접두어로 2컬럼화할 수 있다.

## 26. 빈 상태·로딩·오류 상태

- 빈 상태: 중앙 정렬 카드, `rounded-[24~28px] bg-white/85~90 p-8 text-center`, 아이콘/이니셜 원형 배지 + 제목 + 보조문구(`sprint/exams/page.tsx:101-106`, `sprint/worksheets/page.tsx:84-87`).
- 로딩 상태: 대부분 `text-center text-sm font-bold text-[무채색]"불러오는 중..."` 단순 텍스트(`sprint/exams/page.tsx:100`). 스피너는 result 페이지에만 존재(`border-4 border-t-[#2874E8] animate-spin` 원형, `.../result/page.tsx:207`).
- 오류 상태: 21절의 빨간 배너가 표준. 페이지 전체가 로드 실패한 경우 셸 안에 안내 카드로 대체(`sprint/exams/[assignmentId]/page.tsx:110-114`).

원칙: 로딩 스피너 패턴(result 페이지)을 표준 로딩 컴포넌트로 승격하고, 지금처럼 텍스트만 있는 로딩 상태들도 점진적으로 이 스피너를 함께 쓰도록 통일한다(기능 변경 없음, 시각 전용).

## 27. 접근성 및 focus-visible

현재 상태(재확인 완료):
- `focus-visible` 클래스 사용 0건.
- `aria-*` 사용 15건, 대부분 아이콘 전용 버튼의 `aria-label`(`today/page.tsx` 완료 토글, `tracker/page.tsx` 월 이동, `student-logout-button.tsx`)과 장식용 `aria-hidden`(`sprint/page.tsx:145,234`, `result/page.tsx:379`) 정도.
- 여러 입력 요소가 `outline-none`을 걸고 `focus:border-*` 색 변경만으로 포커스를 표시(`sprint/exams/attempts/[attemptId]/page.tsx:296`, `proof-form.tsx:306`, `vocabulary/test/[sessionId]/page.tsx`) — **네이티브 포커스 링이 제거되고 대체 표시가 색상 대비에만 의존**하는 상태.

이번 시스템에서 추가할 최소 기준(신규/수정 영역에 적용, 기존 로직 변경 없이 className만 추가):
- 클릭 가능한 모든 요소(`button`, `Link`, 커스텀 클릭 카드)에 `focus-visible:ring-2 focus-visible:ring-offset-2` + 브랜드 primary 링 색을 추가한다.
- `outline-none`을 쓰는 입력창은 `focus-visible:outline` 또는 동등한 대체 링을 반드시 함께 넣는다(테두리 색 변경만으로 대체하지 않는다).
- 아이콘 전용 버튼(OMR 선택지 원형 버튼 등)에는 `aria-label` 패턴을 계속 확장 적용한다(`aria-label={`${question.question_no}번 ${value}번`}`, `.../attemptId]/page.tsx:284`가 이미 좋은 예시 — 이 패턴을 다른 아이콘 버튼에도 넓힌다).
- 이 항목들은 전부 className/속성 추가이며 상태·핸들러·데이터 흐름을 바꾸지 않으므로 "기능 보호 원칙"(28절)에 위배되지 않는다.

## 28. 기능 보호 원칙

이 디자인 시스템과 이후 구현은 아래를 **절대 수정하지 않는다**:
- API 엔드포인트, request/response 스키마, `apiFetch` 호출부
- `useEffect`와 dependency array
- 상태 변수, 상태 전환 로직, 이벤트 핸들러(`onClick`, `onChange`, `onBlur` 등)의 동작
- `disabled` 조건의 판단 로직(스타일만 바뀔 수 있음, 조건 자체는 불변)
- 제출/자동저장/채점/결과공개/재응시/삭제 흐름
- 인증·권한 체크(`getStudent()`, `router.push("/login")` 등)
- 조건부 렌더링의 기능적 의미(어떤 조건에서 무엇을 보여줄지)

허용되는 것: className, 반응형 wrapper, grid/flex 구조, padding/gap/margin, 색상/폰트/radius/shadow, 모바일·데스크톱 모달 표현 전환.

## 29. 금지 사례

- AIMON과 SPRINT를 하나의 primary 색으로 합치는 것
- 토스 primary `#3182f6`를 전역 primary로 쓰는 것
- Toss Product Sans를 로드하는 것
- 셸만 넓히고 하단 네비/카드 그리드는 430px 그대로 두는 것(불일치 레이아웃)
- 데스크톱에서 모든 요소를 단순히 가로로 늘리기만 하는 것(콘텐츠 없는 여백만 커지는 상태)
- OMR 문항 순서를 재배치하거나 응답 흐름(선택→저장→다음)을 바꾸는 것
- 새로운 보라색/파란색 hex를 추측해서 추가하는 것
- 회원가입/로그인 없는 상태에서도 보이는 화면에 학생 개인정보를 시각적 예시로 하드코딩하는 것(해당 없음 확인, 원칙만 명시)

## 30. 구현 검증 체크리스트

- [x] 375px, 768px, 1280px 3개 뷰포트에서 셸·네비·카드 그리드가 모두 같은 `max-w` 기준을 공유하는가
- [x] 데스크톱(`lg` 이상)에서 앱 프레임 외곽 그림자(`shadow-[0_0_60px_...]`)가 제거됐는가
- [ ] AIMON 화면에 SPRINT 블루가, SPRINT 화면에 AIMON 퍼플이 섞여 들어가지 않았는가
- [ ] 모바일에서 바텀시트가 여전히 하단 고정으로 뜨는가, 데스크톱에서 중앙 모달로 전환됐는가
- [ ] 모든 클릭 가능 요소에 키보드 탭 이동 시 시각적 포커스 표시가 있는가
- [ ] OMR 문항 저장/제출 플로우가 리디자인 전후로 동일하게 동작하는가(수동 회귀 테스트)
- [ ] `apiFetch`, `useEffect`, 상태 변수, 이벤트 핸들러에 diff가 없는가(className/구조 변경만 있는가)
- [ ] 새로 추가된 색상/radius/shadow 값이 전부 이 문서의 토큰 표에 존재하는가(새 값 추측 여부 확인)
