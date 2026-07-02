# 오늘도 해냄 — 프로젝트 전체 개요

> 수학 학원 학생 진도 관리 앱. 관리자가 숙제를 배정하고, 학생이 교재 문항 진도를 직접 체크하는 서비스.

운영 주소: **http://aimon.teamzsoft.com**

---

## 목차

1. [기술 스택](#기술-스택)
2. [폴더 구조](#폴더-구조)
3. [로컬 실행 방법](#로컬-실행-방법)
4. [배포 구조](#배포-구조)
5. [인증 방식](#인증-방식)
6. [화면 구조](#화면-구조)
7. [백엔드 API](#백엔드-api)
8. [데이터베이스](#데이터베이스)
9. [진도 추적 시스템 2가지](#진도-추적-시스템-2가지)
10. [시드 스크립트](#시드-스크립트)
11. [주요 상수 및 설정](#주요-상수-및-설정)
12. [자주 있는 실수 / 주의사항](#자주-있는-실수--주의사항)

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| 백엔드 | FastAPI, SQLAlchemy 2.x, Pydantic v2 |
| DB | PostgreSQL |
| 서버 운영 | pm2 (프로세스), nginx (리버스 프록시) |

---

## 폴더 구조

```
mathcheck-main/
├── backend/                    # FastAPI 백엔드
│   ├── main.py                 # FastAPI 앱 진입점, 모든 라우트
│   ├── models.py               # SQLAlchemy 모델 (11개 테이블)
│   ├── crud.py                 # DB 조회/쓰기 함수 모음
│   ├── schemas.py              # Pydantic 요청/응답 스키마
│   ├── database.py             # DB 연결 설정
│   ├── seed.py                 # 기본 과목/단원/학생 데이터 시드
│   ├── seed_accounts.py        # 관리자 비밀번호 + 학생 계정 시드
│   ├── seed_daily_tasks.py     # 일일 숙제 샘플 시드
│   ├── seed_textbook.py        # 딥러닝 수1 삼각함수 도형 교재 시드
│   ├── requirements.txt        # 의존성 패키지
│   ├── .env                    # 실제 환경변수 (git 제외)
│   └── .env.example            # 환경변수 예시
│
├── frontend/                   # Next.js 프론트엔드
│   ├── app/                    # 페이지 라우트
│   │   ├── login/              # 학생 로그인
│   │   ├── admin/              # 관리자 영역
│   │   │   ├── login/          # 관리자 로그인
│   │   │   ├── page.tsx        # 관리자 대시보드 (학생 목록)
│   │   │   ├── daily-tasks/    # 숙제 관리 페이지
│   │   │   └── students/[studentId]/  # 학생 상세 진도
│   │   └── student/            # 학생 영역
│   │       ├── today/          # 오늘의 미션 (주간 숙제)
│   │       ├── subjects/       # 교재진도 (과목 → 교재 선택)
│   │       ├── tracker/        # 갓생 챌린지 (월간 달성률)
│   │       ├── textbooks/      # 교재별 문항 체크리스트
│   │       ├── my-progress/    # 단원 진도 요약
│   │       └── units/[unitId]/ # 단원 상세 체크리스트
│   ├── components/             # 공통 컴포넌트
│   ├── lib/                    # 유틸리티
│   │   ├── api.ts              # apiFetch 함수 (모든 API 호출)
│   │   ├── storage.ts          # localStorage (학생/관리자 세션)
│   │   ├── student-page-titles.ts  # 학생 페이지 제목/이모지 상수
│   │   ├── types.ts            # 공통 TypeScript 타입
│   │   └── utils.ts            # cn() 등 유틸
│   ├── public/                 # 정적 파일
│   │   └── haenaem-logo.png    # 로그인 화면 로고
│   ├── .env.local              # 환경변수 (로컬 dev용)
│   └── .env.example            # 환경변수 예시
│
└── docs/
    ├── database.md             # DB 테이블 상세 구조
    └── project-overview.md     # 이 파일
```

---

## 로컬 실행 방법

### 백엔드

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

# .env 파일 작성 (database.py가 자동으로 읽음)
# DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/mathcheck

uvicorn main:app --reload --port 8002
# API 문서: http://localhost:8002/docs
```

### 프론트엔드

```bash
cd frontend
npm install

# .env.local 파일 작성
# NEXT_PUBLIC_API_URL=http://localhost:8002

npm run dev
# http://localhost:3000
```

### 시드 데이터 (처음 실행 시)

```bash
cd backend
python seed.py              # 과목, 단원, 기본 학생 데이터
python seed_accounts.py     # 관리자 비밀번호 + 실제 학생 계정
python seed_textbook.py     # 딥러닝 수1 삼각함수 도형 (15문항)
```

---

## 배포 구조

```
외부 사용자
    ↓ HTTP (80/443)
nginx (포트 80 → 내부 라우팅)
    ├── /api/*  →  uvicorn (FastAPI, 포트 8000)
    └── /*      →  Next.js (pm2, 포트 3007 내부)

운영 URL:  http://aimon.teamzsoft.com
API 문서:  http://aimon.teamzsoft.com/api/docs
```

### 배포 환경변수

**백엔드** (`backend/.env`):
```
DATABASE_URL=postgresql+psycopg2://...
FRONTEND_ORIGINS=https://aimon.teamzsoft.com
```

**프론트엔드** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=https://aimon.teamzsoft.com/api
```

> **주의**: `NEXT_PUBLIC_*` 변수는 빌드 시점에 번들에 포함된다. 변경하면 반드시 `npm run build` 재실행 필요.

### 서버 재시작 명령

```bash
# 백엔드
pm2 restart backend

# 프론트엔드 (빌드 후)
npm run build
pm2 restart frontend
```

---

## 인증 방식

| 구분 | 방식 |
|---|---|
| 학생 로그인 | 전화번호만 입력 (비밀번호 없음) |
| 관리자 로그인 | username + password (DB에 **평문** 저장) |
| 세션 저장 | `localStorage` (`mathcheck-student`, `mathcheck-admin` 키) |
| 서버 인증 | 없음. 학생 ID는 쿼리 파라미터로 전달, 별도 JWT/세션 없음 |

```typescript
// lib/storage.ts — 세션 저장/읽기
getStudent()  // → { id, name, phone, grade } | null
getAdmin()    // → { username, isLoggedIn } | null
```

> **관리자 기본 계정**: `seed_accounts.py` 실행으로 설정. 비밀번호: `tjstodsla`

---

## 화면 구조

### 학생 화면

```
/login                          학생 로그인 (전화번호 입력)
/student/today                  🎯 오늘의 미션 — 이번 주 숙제 목록
/student/subjects               📚 교재진도 — 수1 / 수2 / 확통 선택
  /student/subjects/su1         수1 교재 목록
  /student/subjects/su2         수2 교재 목록
  /student/subjects/probability 확률과 통계 교재 목록
/student/textbooks/:key         교재별 문항 체크리스트
  deep-su1-exp-log              딥러닝 수1 지수로그
  deep-su1-trig-graph           딥러닝 수1 삼각함수 그래프
  deep-su1-sequence-basic       딥러닝 수1 수열 등차·등비
  deep-su1-sequence-sum         딥러닝 수1 수열의 합
  deep-prob-counting            딥러닝 확통 경우의 수
/student/tracker                🔥 갓생 챌린지 — 월간 달성 캘린더
/student/my-progress            단원 진도 요약
/student/units/:unitId          단원별 세부 체크리스트
```

**학생 하단 네비**: 오늘의 미션 / 교재진도 / 갓생 챌린지

### 관리자 화면

```
/admin/login                    관리자 로그인
/admin                          학생 목록 + 단원 진도 요약 대시보드
/admin/students/:studentId      학생 단원 진도 상세
/admin/daily-tasks              숙제 관리 (배정 / 수정 / 삭제)
```

**관리자 하단 네비**: 대시보드 / 학생 목록 / 숙제 / 나가기

---

## 백엔드 API

### 학생 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/auth/student-login` | 전화번호로 로그인 (학생 정보 반환) |
| GET | `/subjects` | 과목 + 단원 목록 |
| GET | `/units/{unit_id}/tasks` | 단원별 학습 항목 + 내 진도 |
| POST | `/progress/check` | 단원 학습 항목 완료 체크 |
| GET | `/students/{student_id}/summary` | 학생 전체 단원 진도 요약 |
| GET | `/student/progress-summary` | 학생 교재 진도 요약 (홈 대시보드용) |
| GET | `/student/daily-tasks` | 특정 날짜 일일 숙제 목록 |
| GET | `/student/weekly-tasks` | 주간 숙제 목록 |
| GET | `/student/achievement-tracker` | 월간 갓생 챌린지 데이터 |
| GET | `/student/textbook-progress/{key}` | 교재 문항별 진도 조회 |
| POST | `/student/item-progress` | 교재 문항 진도 저장 |
| PATCH | `/student/daily-tasks/{task_id}/status` | 숙제 상태 변경 |

### 관리자 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/auth/admin-login` | 관리자 로그인 |
| GET | `/admin/students` | 학생 목록 + 진도 요약 |
| GET | `/admin/students/{id}/progress` | 학생 단원 진도 상세 |
| GET | `/admin/textbooks` | 교재 카탈로그 (숙제 배정용, 하드코딩 기반) |
| POST | `/admin/daily-tasks` | 숙제 생성 |
| PATCH | `/admin/daily-tasks/{id}` | 숙제 수정 |
| DELETE | `/admin/daily-tasks/{id}` | 숙제 삭제 |
| GET | `/admin/textbook-series` | 교재 시리즈 목록 |
| POST | `/admin/textbook-series` | 교재 시리즈 생성 |
| POST | `/admin/textbooks` | 교재 + 문항 일괄 생성 |
| GET | `/admin/textbook-list` | 교재 관리 목록 (DB 기반) |
| GET | `/admin/textbooks/{id}` | 교재 상세 + 문항 목록 |

> API 문서 (Swagger): http://aimon.teamzsoft.com/api/docs

---

## 데이터베이스

상세 구조는 [database.md](database.md) 참고.

### 테이블 요약

| 테이블 | 역할 |
|---|---|
| `math_students` | 학생 계정 (phone 로그인 키) |
| `math_admins` | 관리자 계정 (password 평문) |
| `math_subjects` | 과목 (수1 / 수2 / 확통) |
| `math_units` | 단원 |
| `math_tasks` | 단원별 학습 항목 |
| `math_progress` | 학생별 단원 항목 완료 여부 |
| `math_textbook_series` | 교재 시리즈 (예: 딥러닝 Deep Learning) |
| `math_textbooks` | 교재 단위 |
| `math_textbook_items` | 교재 문항 (1번, 2번…) |
| `math_student_item_progress` | 학생별 문항 진도 (`not_started` / `partial` / `done`) |
| `math_daily_tasks` | 관리자가 배정한 일일 숙제 |

### DB 연결 설정 (`backend/database.py`)

환경변수 우선순위:
1. `DATABASE_URL` (전체 연결 문자열)
2. 개별 변수: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`

---

## 진도 추적 시스템 2가지

이 프로젝트에는 **독립적인 진도 추적 시스템이 2개** 존재한다.

### 1. 단원 진도 (Unit Progress)

과목 → 단원 → 학습 항목 순의 트리 구조.

```
수학 I (math_subjects)
  └── 지수로그 (math_units)
        ├── 지수법칙 계산 연습 (math_tasks)  ← 완료/미완료 (math_progress)
        ├── 로그의 성질 정리   (math_tasks)
        └── ...
```

- 학생이 `/student/units/:unitId`에서 체크박스를 클릭해 완료 표시
- 완료율(%) 계산: `completed / total * 100`
- 관리자 대시보드에서 학생별 전체 진도율 확인

### 2. 교재 문항 진도 (Textbook Item Progress)

교재 시리즈 → 교재 → 문항(1번~N번) 구조.

```
딥러닝 Deep Learning (math_textbook_series)
  └── 수1 - 지수로그 (math_textbooks, textbook_key="deep-su1-exp-log")
        ├── 1번 (math_textbook_items)  ← not_started / partial / done
        ├── 2번
        └── ...
```

- 학생이 `/student/textbooks/:key`에서 문항별 상태를 선택
- 상태: `not_started`(아직 안함) / `partial`(△ 질문) / `done`(○ 완료)
- `TEXTBOOK_PROGRESS_CONFIG` (crud.py): 하드코딩된 textbook_key → full_title 매핑
- 현재 연결된 교재 5개 (모두 딥러닝 시리즈)

---

## 시드 스크립트

| 스크립트 | 내용 | 실행 횟수 |
|---|---|---|
| `seed.py` | 과목 / 단원 / 학습 항목 / 샘플 학생 / 교재 시리즈 기본 데이터 | 최초 1회 |
| `seed_accounts.py` | 관리자 비밀번호 → `tjstodsla`, 학생 4명 upsert | 언제든 재실행 가능 |
| `seed_daily_tasks.py` | 숙제 샘플 데이터 | 개발/테스트용 |
| `seed_textbook.py` | 딥러닝 수1 삼각함수 도형 (15문항) 생성 | 최초 1회 |

모든 시드 스크립트는 **멱등성** 보장 — 중복 실행해도 안전.

---

## 주요 상수 및 설정

### 백엔드 (`backend/crud.py`)

```python
# 학생 교재 진도 페이지와 연결된 교재 목록 (하드코딩)
TEXTBOOK_PROGRESS_CONFIG = {
    "deep-su1-exp-log": "딥러닝 Deep Learning 수1 - 지수로그",
    "deep-su1-trig-graph": "딥러닝 Deep Learning 수1 - 삼각함수 그래프",
    "deep-su1-sequence-basic": "딥러닝 Deep Learning 수1 - 수열 등차수열·등비수열",
    "deep-su1-sequence-sum": "딥러닝 Deep Learning 수1 - 수열의 합과 시그마",
    "deep-prob-counting": "딥러닝 Deep Learning 확률과 통계 - 경우의 수",
}

ITEM_PROGRESS_STATUSES = {"not_started", "partial", "done"}
DAILY_TASK_STATUSES = {"todo", "in_progress", "done"}
```

> `GET /admin/textbooks` (숙제 배정 드롭다운용)는 이 config를 기반으로 동작. DB 교재가 늘어도 이 dict에 없으면 숙제 배정 드롭다운에 표시되지 않음.

### 프론트엔드

```typescript
// frontend/lib/student-page-titles.ts — 학생 페이지 제목/이모지
export const STUDENT_PAGE_TITLES = {
  today:    "🎯 오늘의 미션",
  subjects: "📚 교재진도",
  tracker:  "🔥 갓생 챌린지",
} as const;
```

```typescript
// frontend/lib/api.ts — API 호출 기본 함수
// NEXT_PUBLIC_API_URL 환경변수 필수
// credentials: "include" 고정 (CORS 쿠키 포함)
```

---

## 자주 있는 실수 / 주의사항

### 1. 환경변수 변경 후 빌드 필수

`NEXT_PUBLIC_*` 변수는 빌드 시 번들에 박힌다. `.env.local` 수정 후 반드시:
```bash
npm run build && pm2 restart frontend
```

### 2. CORS 설정 (`backend/main.py`)

새 도메인이나 포트에서 프론트를 실행하면 CORS 에러 발생.
`allowed_origins` 리스트 또는 `FRONTEND_ORIGINS` 환경변수에 추가 필요.

### 3. 관리자 비밀번호 평문 저장

`math_admins.password` 컬럼은 해시 없이 평문 그대로 저장.
로그인 검증: `admin.password != payload.password` 단순 문자열 비교.

### 4. 학생 ID는 URL 파라미터로 전달

서버 측 세션/JWT 없음. 학생 ID는 `?student_id=123` 형태로 모든 API에 전달.
서버가 해당 학생 존재 여부만 확인하고, 다른 학생 데이터 접근 차단 없음.

### 5. 숙제 배정 드롭다운 교재 추가 방법

DB에 교재를 추가하는 것만으로는 숙제 배정 드롭다운에 나타나지 않는다.
`backend/crud.py`의 `TEXTBOOK_PROGRESS_CONFIG` dict에도 추가해야 함.

### 6. 학생 교재 체크리스트 URL 추가 방법

`frontend/app/student/textbooks/` 하위에 새 폴더(페이지) 추가 필요.
`TextbookChecklistPage` 컴포넌트에 `progressKey` prop으로 연결.
