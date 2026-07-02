# 데이터베이스 구조

> 소스: `backend/models.py` / PostgreSQL

---

## 테이블 목록

| 테이블명 | 설명 |
|---|---|
| `math_students` | 학생 계정 |
| `math_admins` | 관리자 계정 |
| `math_subjects` | 과목 (수1, 수2, 확통) |
| `math_units` | 단원 |
| `math_tasks` | 단원별 학습 항목 |
| `math_progress` | 학생별 단원 학습 진도 |
| `math_textbook_series` | 교재 시리즈 (예: 딥러닝) |
| `math_textbooks` | 교재 |
| `math_textbook_items` | 교재 문항 |
| `math_student_item_progress` | 학생별 문항 진도 |
| `math_daily_tasks` | 학생별 일일 할 일 |

---

## 상세 구조

### math_students

학생 계정. 전화번호로 로그인.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| name | String(100) | 이름 |
| phone | String(20) UNIQUE | 전화번호 (로그인 키) |
| grade | String(20) | 학년 (예: 고3, 재수) |
| created_at | DateTime | 생성일시 |

관계: `math_progress`, `math_student_item_progress`, `math_daily_tasks` → cascade delete

---

### math_admins

관리자 계정. 비밀번호 평문 저장.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| username | String(100) UNIQUE | 로그인 아이디 |
| password | String(255) | 비밀번호 (평문) |
| created_at | DateTime | 생성일시 |

---

### math_subjects

과목 테이블. 수1 / 수2 / 확률과 통계.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| name | String(100) UNIQUE | 과목명 |
| order_index | Integer | 정렬 순서 |

관계: `math_units` → cascade delete

---

### math_units

단원 테이블. 과목에 속함.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| subject_id | Integer FK → math_subjects | |
| name | String(100) | 단원명 |
| order_index | Integer | 정렬 순서 |

관계: `math_tasks` → cascade delete

---

### math_tasks

단원별 학습 항목.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| unit_id | Integer FK → math_units | |
| title | String(200) | 항목 제목 |
| order_index | Integer | 정렬 순서 |

관계: `math_progress` → cascade delete

---

### math_progress

학생이 단원 학습 항목을 완료했는지 기록.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| student_id | Integer FK → math_students | |
| task_id | Integer FK → math_tasks | |
| is_done | Boolean | 완료 여부 |
| done_at | DateTime (nullable) | 완료 일시 |

유니크 제약: `(student_id, task_id)`

---

### math_textbook_series

교재 시리즈. 예: 딥러닝 Deep Learning.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| korean_name | String(100) | 한글명 |
| english_name | String(100) | 영문명 |
| display_name | String(200) | 표시명 |
| type | String(50) | 유형 (예: problem) |
| order_index | Integer | 정렬 순서 |
| created_at | DateTime | 생성일시 |

유니크 제약: `(display_name, type)`
관계: `math_textbooks` → cascade delete

---

### math_textbooks

교재 단위. 시리즈에 속함.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| series_id | Integer FK → math_textbook_series | |
| subject | String(50) (nullable) | 과목 (예: 수1) |
| title | String(200) | 교재 제목 |
| full_title | String(300) UNIQUE | 시리즈 포함 전체 제목 |
| type | String(50) | 유형 (예: problem) |
| is_checkable | Boolean | 체크 가능 여부 |
| is_published | Boolean | 공개 여부 |
| is_active | Boolean | 활성 여부 |
| order_index | Integer | 정렬 순서 |
| created_at | DateTime | 생성일시 |

관계: `math_textbook_items` → cascade delete, `math_daily_tasks`

---

### math_textbook_items

교재의 개별 문항.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| textbook_id | Integer FK → math_textbooks | |
| item_number | Integer | 문항 번호 |
| title | String(100) | 문항 제목 (예: 1번) |
| item_type | String(50) | 유형 (예: problem) |
| order_index | Integer | 정렬 순서 |
| is_active | Boolean | 활성 여부 |

유니크 제약: `(textbook_id, item_number)`
관계: `math_student_item_progress` → cascade delete

---

### math_student_item_progress

학생별 교재 문항 진도.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| student_id | Integer FK → math_students | |
| item_id | Integer FK → math_textbook_items | |
| status | String(50) | `not_started` / `in_progress` / `done` |
| updated_at | DateTime | 마지막 변경일시 |

유니크 제약: `(student_id, item_id)`

---

### math_daily_tasks

관리자가 학생에게 배정하는 일일 할 일.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | Integer PK | |
| student_id | Integer FK → math_students | |
| task_date | Date | 할 일 날짜 |
| title | String(200) | 제목 |
| detail | String(300) (nullable) | 상세 설명 |
| textbook_id | Integer FK → math_textbooks (nullable) | 연결된 교재 |
| textbook_key | String(100) (nullable) | 교재 URL 키 |
| start_item_number | Integer (nullable) | 시작 문항 번호 |
| end_item_number | Integer (nullable) | 끝 문항 번호 |
| status | String(50) | `todo` / `in_progress` / `done` |
| difficulty | String(50) (nullable) | 난이도 |
| category | String(100) (nullable) | 카테고리 |
| order_index | Integer | 정렬 순서 |
| created_at | DateTime | 생성일시 |
| updated_at | DateTime (nullable) | 수정일시 |

---

## 관계 다이어그램

```
math_subjects
    └── math_units
            └── math_tasks
                    └── math_progress ←── math_students
                                                ├── math_student_item_progress
                                                └── math_daily_tasks

math_textbook_series
    └── math_textbooks ──────────────── math_daily_tasks
            └── math_textbook_items
                    └── math_student_item_progress ←── math_students
```

---

## 참고

- 학생 로그인: `phone` 단독 조회 (비밀번호 없음)
- 관리자 로그인: `username` + `password` 평문 비교
- 교재 진도(`math_student_item_progress`)와 단원 진도(`math_progress`)는 별도 시스템
- `math_daily_tasks`는 관리자가 생성, 학생이 상태 업데이트
