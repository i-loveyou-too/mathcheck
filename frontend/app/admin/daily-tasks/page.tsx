"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { AdminStudentSummary } from "@/lib/types";

type TextbookOption = {
  category: string;
  label: string;
  maxItemNumber?: number;
  minItemNumber?: number;
  shortTitle: string;
  totalItems?: number;
  textbookKey: string | null;
};

type AdminTextbookCatalogItem = {
  id: number;
  textbook_key: string;
  title: string;
  short_title: string;
  category: string;
  subject: string;
  min_item_number: number;
  max_item_number: number;
  total_items: number;
  is_active: boolean;
  is_checkable: boolean;
};

type AdminTextbookCatalogResponse = {
  textbooks: AdminTextbookCatalogItem[];
};

type DailyTaskStatus = "todo" | "in_progress" | "done";

type DailyTask = {
  id: number;
  title: string;
  detail: string | null;
  textbook_key: string | null;
  start_item_number: number | null;
  end_item_number: number | null;
  status: DailyTaskStatus;
  difficulty: string | null;
  category: string | null;
  order_index: number;
};

type DailyTasksResponse = {
  student_id: number;
  date: string;
  summary: {
    total: number;
    done: number;
    todo: number;
    completion_rate: number;
  };
  tasks: DailyTask[];
};

type TaskFormState = {
  category: string;
  detail: string;
  difficulty: string;
  endNumber: string;
  orderIndex: string;
  selectedTextbookValue: string;
  startNumber: string;
  status: DailyTaskStatus;
  taskDate: string;
  title: string;
};

type AutoRangeRow = {
  id: number;
  textbookValue: string;
  startNumber: string;
  endNumber: string;
};

type AutoPlanTask = {
  category: string;
  date: string;
  detail: string;
  endNumber: number;
  orderIndex: number;
  problemCount: number;
  startNumber: number;
  textbookKey: string;
  title: string;
};

type AutoPlanDay = {
  date: string;
  problemCount: number;
  tasks: AutoPlanTask[];
};

const customTextbookValue = "__custom__";

const customTextbookOption: TextbookOption = {
  category: "기타",
  label: "직접 입력 / 기타",
  shortTitle: "",
  textbookKey: null,
};

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNullableNumber(value: string) {
  if (!value) return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function getStatusLabel(status: DailyTaskStatus) {
  if (status === "done") return "완료";
  if (status === "in_progress") return "진행중";
  return "예정";
}

function getTextbookValue(textbookKey: string | null) {
  return textbookKey ?? customTextbookValue;
}

function getTextbookByValue(value: string, options: TextbookOption[]) {
  return (
    options.find((option) => getTextbookValue(option.textbookKey) === value) ??
    options[0] ??
    customTextbookOption
  );
}

function makeEmptyForm(today: string): TaskFormState {
  return {
    category: customTextbookOption.category,
    detail: "",
    difficulty: "보통",
    endNumber: "",
    orderIndex: "1",
    selectedTextbookValue: customTextbookValue,
    startNumber: "",
    status: "todo",
    taskDate: today,
    title: "",
  };
}

function getRangeText(task: DailyTask) {
  if (task.start_item_number === null && task.end_item_number === null) return "-";
  if (task.start_item_number === task.end_item_number) return `${task.start_item_number}번`;
  return `${task.start_item_number ?? "?"}번 ~ ${task.end_item_number ?? "?"}번`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getNextAssignmentDate(date: Date, excludeWeekends: boolean) {
  let nextDate = date;
  while (excludeWeekends && (nextDate.getDay() === 0 || nextDate.getDay() === 6)) {
    nextDate = addDays(nextDate, 1);
  }
  return nextDate;
}

function chooseDayTarget(remainingTotal: number, minProblems: number, maxProblems: number) {
  if (remainingTotal <= maxProblems) return remainingTotal;
  const daysNeeded = Math.ceil(remainingTotal / maxProblems);
  return Math.min(maxProblems, Math.max(minProblems, Math.ceil(remainingTotal / daysNeeded)));
}

function makeAutoTitle(option: TextbookOption, startNumber: number, endNumber: number) {
  if (startNumber === endNumber) return `${option.shortTitle} ${startNumber}번`;
  return `${option.shortTitle} ${startNumber}번 ~ ${endNumber}번`;
}

export default function AdminDailyTasksPage() {
  const router = useRouter();
  const today = useMemo(() => toLocalDateKey(new Date()), []);
  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [catalogTextbooks, setCatalogTextbooks] = useState<TextbookOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [createForm, setCreateForm] = useState<TaskFormState>(() => makeEmptyForm(today));
  const [editTaskId, setEditTaskId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TaskFormState>(() => makeEmptyForm(today));
  const [titleEdited, setTitleEdited] = useState(false);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [autoStartDate, setAutoStartDate] = useState(today);
  const [autoExcludeWeekends, setAutoExcludeWeekends] = useState(true);
  const [autoMinProblems, setAutoMinProblems] = useState("10");
  const [autoMaxProblems, setAutoMaxProblems] = useState("15");
  const [autoMaxTextbooks, setAutoMaxTextbooks] = useState("2");
  const [autoRows, setAutoRows] = useState<AutoRangeRow[]>([
    {
      id: 1,
      textbookValue: "",
      startNumber: "",
      endNumber: "",
    },
  ]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingTextbooks, setLoadingTextbooks] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const textbookOptions = useMemo(
    () => [...catalogTextbooks, customTextbookOption],
    [catalogTextbooks],
  );
  const assignmentTextbookOptions = catalogTextbooks;
  const selectedTextbook = getTextbookByValue(createForm.selectedTextbookValue, textbookOptions);
  const isCustomTask = selectedTextbook.textbookKey === null;

  const generatedTitle = useMemo(() => {
    if (isCustomTask || !selectedTextbook.shortTitle || !createForm.startNumber || !createForm.endNumber) {
      return "";
    }

    return `${selectedTextbook.shortTitle} ${createForm.startNumber}번 ~ ${createForm.endNumber}번`;
  }, [createForm.endNumber, createForm.startNumber, isCustomTask, selectedTextbook.shortTitle]);

  const autoPlan = useMemo<AutoPlanDay[]>(() => {
    const minProblems = Math.max(1, Number(autoMinProblems) || 10);
    const maxProblems = Math.max(minProblems, Number(autoMaxProblems) || 15);
    const maxTextbooks = Math.max(1, Number(autoMaxTextbooks) || 2);
    const segments = autoRows
      .map((row) => {
        const option = getTextbookByValue(row.textbookValue, assignmentTextbookOptions);
        const startNumber = Number(row.startNumber);
        const endNumber = Number(row.endNumber);

        if (!option.textbookKey || !startNumber || !endNumber || endNumber < startNumber) {
          return null;
        }
        if (
          option.minItemNumber !== undefined &&
          (startNumber < option.minItemNumber || endNumber > (option.maxItemNumber ?? endNumber))
        ) {
          return null;
        }

        return {
          category: option.category,
          current: startNumber,
          end: endNumber,
          option,
          textbookKey: option.textbookKey,
        };
      })
      .filter((segment): segment is NonNullable<typeof segment> => segment !== null);

    const plan: AutoPlanDay[] = [];
    let currentDate = getNextAssignmentDate(
      new Date(`${autoStartDate}T00:00:00`),
      autoExcludeWeekends,
    );

    while (segments.some((segment) => segment.current <= segment.end)) {
      const remainingTotal = segments.reduce(
        (sum, segment) => sum + Math.max(segment.end - segment.current + 1, 0),
        0,
      );
      const target = chooseDayTarget(remainingTotal, minProblems, maxProblems);
      const dayTasks: AutoPlanTask[] = [];
      let dayProblemCount = 0;
      let textbookCount = 0;

      for (const segment of segments) {
        if (segment.current > segment.end) continue;
        if (dayProblemCount >= target) break;
        if (textbookCount >= maxTextbooks) break;

        const remainingInSegment = segment.end - segment.current + 1;
        const needed = target - dayProblemCount;
        const take = Math.min(remainingInSegment, needed);
        const startNumber = segment.current;
        const endNumber = segment.current + take - 1;
        const orderIndex = dayTasks.length + 1;

        dayTasks.push({
          category: segment.category,
          date: toLocalDateKey(currentDate),
          detail: `${startNumber}번 ~ ${endNumber}번`,
          endNumber,
          orderIndex,
          problemCount: take,
          startNumber,
          textbookKey: segment.textbookKey,
          title: makeAutoTitle(segment.option, startNumber, endNumber),
        });

        segment.current = endNumber + 1;
        dayProblemCount += take;
        textbookCount += 1;
      }

      if (dayTasks.length === 0) break;

      plan.push({
        date: toLocalDateKey(currentDate),
        problemCount: dayProblemCount,
        tasks: dayTasks,
      });

      currentDate = getNextAssignmentDate(addDays(currentDate, 1), autoExcludeWeekends);
    }

    return plan;
  }, [
    assignmentTextbookOptions,
    autoExcludeWeekends,
    autoMaxProblems,
    autoMaxTextbooks,
    autoMinProblems,
    autoRows,
    autoStartDate,
  ]);

  const autoValidationErrors = useMemo(() => {
    const errors: string[] = [];

    autoRows.forEach((row, index) => {
      const option = getTextbookByValue(row.textbookValue, assignmentTextbookOptions);
      const startNumber = Number(row.startNumber);
      const endNumber = Number(row.endNumber);
      const label = `${index + 1}번째 교재`;

      if (!option.textbookKey) {
        errors.push(`${label}: 교재를 선택해주세요.`);
        return;
      }
      if (!row.startNumber || !row.endNumber) return;
      if (!startNumber || !endNumber) {
        errors.push(`${label}: 시작 번호와 끝 번호는 숫자로 입력해주세요.`);
        return;
      }
      if (option.minItemNumber !== undefined && startNumber < option.minItemNumber) {
        errors.push(`${label}: 시작 번호는 ${option.minItemNumber}번 이상이어야 합니다.`);
      }
      if (option.maxItemNumber !== undefined && endNumber > option.maxItemNumber) {
        errors.push(`${label}: 끝 번호는 ${option.maxItemNumber}번 이하여야 합니다.`);
      }
      if (startNumber > endNumber) {
        errors.push(`${label}: 시작 번호는 끝 번호보다 클 수 없습니다.`);
      }
    });

    return errors;
  }, [assignmentTextbookOptions, autoRows]);

  const fetchTasks = useCallback(async (studentId: string, taskDate: string) => {
    if (!studentId || !taskDate) {
      setTasks([]);
      return;
    }

    setLoadingTasks(true);
    try {
      const data = await apiFetch<DailyTasksResponse>(
        `/student/daily-tasks?student_id=${studentId}&date=${taskDate}`,
      );
      setTasks(data.tasks);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.isLoggedIn) {
      router.push("/admin/login");
      return;
    }

    const loadStudents = async () => {
      try {
        const [studentData, textbookData] = await Promise.all([
          apiFetch<AdminStudentSummary[]>("/admin/students"),
          apiFetch<AdminTextbookCatalogResponse>("/admin/textbooks"),
        ]);
        const loadedTextbooks = textbookData.textbooks.map((textbook) => ({
          category: textbook.category ?? textbook.subject,
          label: textbook.title,
          maxItemNumber: textbook.max_item_number,
          minItemNumber: textbook.min_item_number,
          shortTitle: textbook.short_title,
          textbookKey: textbook.textbook_key,
          totalItems: textbook.total_items,
        }));

        setStudents(studentData);
        setCatalogTextbooks(loadedTextbooks);
        if (studentData[0]) setSelectedStudentId(String(studentData[0].id));
        if (loadedTextbooks[0]) {
          const firstTextbookValue = getTextbookValue(loadedTextbooks[0].textbookKey);
          setCreateForm((current) => ({
            ...current,
            category: loadedTextbooks[0].category,
            selectedTextbookValue: firstTextbookValue,
          }));
          setAutoRows((current) =>
            current.map((row) => ({
              ...row,
              textbookValue: row.textbookValue || firstTextbookValue,
            })),
          );
        }
      } finally {
        setLoadingStudents(false);
        setLoadingTextbooks(false);
      }
    };

    void loadStudents();
  }, [router]);

  useEffect(() => {
    void fetchTasks(selectedStudentId, selectedDate);
    setEditTaskId(null);
  }, [fetchTasks, selectedDate, selectedStudentId]);

  useEffect(() => {
    if (generatedTitle && !titleEdited) {
      setCreateForm((current) => ({ ...current, title: generatedTitle }));
    }
  }, [generatedTitle, titleEdited]);

  useEffect(() => {
    if (!createForm.detail && createForm.startNumber && createForm.endNumber && !isCustomTask) {
      setCreateForm((current) => ({
        ...current,
        detail: `${current.startNumber}번 ~ ${current.endNumber}번`,
      }));
    }
  }, [createForm.detail, createForm.endNumber, createForm.startNumber, isCustomTask]);

  const updateCreateForm = (updates: Partial<TaskFormState>) => {
    setCreateForm((current) => ({ ...current, ...updates }));
  };

  const updateEditForm = (updates: Partial<TaskFormState>) => {
    setEditForm((current) => ({ ...current, ...updates }));
  };

  const updateAutoRow = (rowId: number, updates: Partial<AutoRangeRow>) => {
    setAutoRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...updates } : row)),
    );
  };

  const addAutoRow = () => {
    setAutoRows((current) => [
      ...current,
      {
        id: Date.now(),
        textbookValue: getTextbookValue(assignmentTextbookOptions[0]?.textbookKey ?? null),
        startNumber: "",
        endNumber: "",
      },
    ]);
  };

  const removeAutoRow = (rowId: number) => {
    setAutoRows((current) => current.filter((row) => row.id !== rowId));
  };

  const handleTextbookChange = (value: string) => {
    const option = getTextbookByValue(value, textbookOptions);
    updateCreateForm({
      category: option.category,
      selectedTextbookValue: value,
    });
    setTitleEdited(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!selectedStudentId || !selectedDate || !createForm.title.trim()) {
      setError("학생, 날짜, 제목을 확인해주세요.");
      return;
    }
    const createStartNumber = Number(createForm.startNumber);
    const createEndNumber = Number(createForm.endNumber);
    if (!isCustomTask && createForm.startNumber && selectedTextbook.minItemNumber !== undefined && createStartNumber < selectedTextbook.minItemNumber) {
      setError(`시작 번호는 ${selectedTextbook.minItemNumber}번 이상이어야 합니다.`);
      return;
    }
    if (!isCustomTask && createForm.endNumber && selectedTextbook.maxItemNumber !== undefined && createEndNumber > selectedTextbook.maxItemNumber) {
      setError(`끝 번호는 ${selectedTextbook.maxItemNumber}번 이하여야 합니다.`);
      return;
    }
    if (createForm.startNumber && createForm.endNumber && createStartNumber > createEndNumber) {
      setError("시작 번호는 끝 번호보다 클 수 없습니다.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch<DailyTask>("/admin/daily-tasks", {
        method: "POST",
        body: {
          student_id: Number(selectedStudentId),
          task_date: selectedDate,
          title: createForm.title.trim(),
          detail: createForm.detail.trim() || null,
          textbook_key: selectedTextbook.textbookKey,
          start_item_number: toNullableNumber(createForm.startNumber),
          end_item_number: toNullableNumber(createForm.endNumber),
          status: "todo",
          difficulty: createForm.difficulty,
          category: createForm.category,
          order_index: Number(createForm.orderIndex) || 1,
        },
      });

      setMessage("숙제가 배정되었습니다.");
      setCreateForm({
        ...makeEmptyForm(today),
        selectedTextbookValue: createForm.selectedTextbookValue,
        category: createForm.category,
        difficulty: createForm.difficulty,
        orderIndex: createForm.orderIndex,
      });
      setTitleEdited(false);
      await fetchTasks(selectedStudentId, selectedDate);
    } catch {
      setError("숙제 배정에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoSubmit = async () => {
    setMessage("");
    setError("");

    if (!selectedStudentId || autoPlan.length === 0) {
      setError("자동 배정할 학생과 교재 범위를 확인해주세요.");
      return;
    }
    if (autoValidationErrors.length > 0) {
      setError(autoValidationErrors[0]);
      return;
    }

    setAutoSubmitting(true);
    try {
      for (const day of autoPlan) {
        for (const task of day.tasks) {
          await apiFetch<DailyTask>("/admin/daily-tasks", {
            method: "POST",
            body: {
              student_id: Number(selectedStudentId),
              task_date: task.date,
              title: task.title,
              detail: task.detail,
              textbook_key: task.textbookKey,
              start_item_number: task.startNumber,
              end_item_number: task.endNumber,
              status: "todo",
              difficulty: "보통",
              category: task.category,
              order_index: task.orderIndex,
            },
          });
        }
      }

      setMessage("자동 숙제가 배정되었습니다.");
      await fetchTasks(selectedStudentId, selectedDate);
    } catch {
      setError("자동 배정에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setAutoSubmitting(false);
    }
  };

  const startEdit = (task: DailyTask) => {
    setEditTaskId(task.id);
    setEditForm({
      category: task.category ?? "기타",
      detail: task.detail ?? "",
      difficulty: task.difficulty ?? "보통",
      endNumber: task.end_item_number === null ? "" : String(task.end_item_number),
      orderIndex: String(task.order_index),
      selectedTextbookValue: getTextbookValue(task.textbook_key),
      startNumber: task.start_item_number === null ? "" : String(task.start_item_number),
      status: task.status,
      taskDate: selectedDate,
      title: task.title,
    });
    setMessage("");
    setError("");
  };

  const handleSaveEdit = async (taskId: number) => {
    setMessage("");
    setError("");

    if (!editForm.taskDate || !editForm.title.trim()) {
      setError("수정할 날짜와 제목을 확인해주세요.");
      return;
    }

    const editTextbook = getTextbookByValue(editForm.selectedTextbookValue, textbookOptions);
    setSavingEdit(true);
    try {
      await apiFetch<DailyTask>(`/admin/daily-tasks/${taskId}`, {
        method: "PATCH",
        body: {
          task_date: editForm.taskDate,
          title: editForm.title.trim(),
          detail: editForm.detail.trim() || null,
          textbook_key: editTextbook.textbookKey,
          start_item_number: toNullableNumber(editForm.startNumber),
          end_item_number: toNullableNumber(editForm.endNumber),
          status: editForm.status,
          difficulty: editForm.difficulty,
          category: editForm.category.trim() || editTextbook.category,
          order_index: Number(editForm.orderIndex) || 1,
        },
      });

      setMessage("숙제가 수정되었습니다.");
      setEditTaskId(null);
      await fetchTasks(selectedStudentId, selectedDate);
    } catch {
      setError("숙제 수정에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (taskId: number) => {
    setMessage("");
    setError("");

    if (!window.confirm("이 숙제를 삭제할까요?")) return;

    try {
      await apiFetch<{ ok: boolean }>(`/admin/daily-tasks/${taskId}`, {
        method: "DELETE",
      });
      setMessage("숙제가 삭제되었습니다.");
      await fetchTasks(selectedStudentId, selectedDate);
    } catch {
      setError("삭제에 실패했습니다. 다시 시도해주세요.");
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6]">
      <div className="mx-auto min-h-screen w-full max-w-7xl px-5 py-8 pb-32 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-400">관리자</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-gray-900">숙제 배정</h1>
            <p className="mt-1 text-sm leading-relaxed text-gray-500">
              학생별 날짜와 교재 범위를 선택해 해냄리스트에 숙제를 등록하고 관리해요.
            </p>
          </div>
          <div className="rounded-2xl bg-[#0F172A] px-5 py-3 text-sm font-bold text-white shadow-card">
            {tasks.length}개 배정됨
          </div>
        </div>

      <section className="rounded-3xl bg-white p-5 shadow-card lg:p-6">
        <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-black text-gray-900">필터</h2>
          <p className="text-xs font-bold text-gray-400">학생과 날짜를 바꾸면 목록이 바로 갱신돼요.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">학생 선택</label>
            <select
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
              disabled={loadingStudents}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              value={selectedStudentId}
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} ({student.grade})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">날짜 선택</label>
            <input
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-3xl bg-white p-5 shadow-card lg:p-6">
        <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900">자동 숙제 배정</h2>
            <p className="mt-1 text-xs font-bold text-gray-400">
              여러 교재 범위를 넣으면 날짜별 10~15문항 계획으로 나눠요.
            </p>
          </div>
          <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-bold text-[#3730A3]">
            {autoPlan.length}일 계획
          </span>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">시작 날짜</label>
                <input
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                  onChange={(event) => setAutoStartDate(event.target.value)}
                  type="date"
                  value={autoStartDate}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">하루 최소</label>
                <input
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                  min="1"
                  onChange={(event) => setAutoMinProblems(event.target.value)}
                  type="number"
                  value={autoMinProblems}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">하루 최대</label>
                <input
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                  min="1"
                  onChange={(event) => setAutoMaxProblems(event.target.value)}
                  type="number"
                  value={autoMaxProblems}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">최대 교재</label>
                <input
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                  min="1"
                  onChange={(event) => setAutoMaxTextbooks(event.target.value)}
                  type="number"
                  value={autoMaxTextbooks}
                />
              </div>
              <label className="flex items-end gap-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">
                <input
                  checked={autoExcludeWeekends}
                  className="h-4 w-4"
                  onChange={(event) => setAutoExcludeWeekends(event.target.checked)}
                  type="checkbox"
                />
                주말 제외
              </label>
            </div>

            <div className="space-y-3">
              {autoRows.map((row) => {
                const rowTextbook = getTextbookByValue(row.textbookValue, assignmentTextbookOptions);

                return (
                  <div className="rounded-2xl bg-[#F8FAFC] p-3" key={row.id}>
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
                      <select
                        className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none"
                        disabled={loadingTextbooks}
                        onChange={(event) => updateAutoRow(row.id, { textbookValue: event.target.value })}
                        value={row.textbookValue}
                      >
                        {assignmentTextbookOptions.map((option) => (
                          <option
                            key={getTextbookValue(option.textbookKey)}
                            value={getTextbookValue(option.textbookKey)}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none"
                        min={rowTextbook.minItemNumber ?? 1}
                        max={rowTextbook.maxItemNumber}
                        onChange={(event) => updateAutoRow(row.id, { startNumber: event.target.value })}
                        placeholder="시작 번호"
                        type="number"
                        value={row.startNumber}
                      />
                      <input
                        className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none"
                        min={rowTextbook.minItemNumber ?? 1}
                        max={rowTextbook.maxItemNumber}
                        onChange={(event) => updateAutoRow(row.id, { endNumber: event.target.value })}
                        placeholder="끝 번호"
                        type="number"
                        value={row.endNumber}
                      />
                      <button
                        className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-red-400"
                        disabled={autoRows.length === 1}
                        onClick={() => removeAutoRow(row.id)}
                        type="button"
                      >
                        삭제
                      </button>
                    </div>

                    {rowTextbook.textbookKey ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-400">
                        <span>
                          총 {rowTextbook.totalItems}문항 / {rowTextbook.minItemNumber}~
                          {rowTextbook.maxItemNumber}번
                        </span>
                        <button
                          className="rounded-full bg-white px-3 py-1 text-[#3730A3]"
                          onClick={() =>
                            updateAutoRow(row.id, {
                              endNumber: String(rowTextbook.maxItemNumber),
                              startNumber: String(rowTextbook.minItemNumber),
                            })
                          }
                          type="button"
                        >
                          전체 배정
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {autoValidationErrors.length > 0 ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">
                {autoValidationErrors.map((validationError) => (
                  <p key={validationError}>{validationError}</p>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="rounded-2xl bg-[#EEF2FF] px-5 py-3 text-sm font-black text-[#3730A3]"
                onClick={addAutoRow}
                type="button"
              >
                교재 추가
              </button>
              <button
                className="rounded-2xl bg-[#0F172A] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                disabled={
                  autoSubmitting ||
                  autoPlan.length === 0 ||
                  autoValidationErrors.length > 0 ||
                  !selectedStudentId
                }
                onClick={() => void handleAutoSubmit()}
                type="button"
              >
                {autoSubmitting ? "자동 배정 중..." : "자동 배정하기"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-[#F8FAFC] p-4">
            <h3 className="text-sm font-black text-gray-900">미리보기</h3>
            {autoPlan.length > 0 ? (
              <div className="mt-3 max-h-[420px] space-y-3 overflow-auto pr-1">
                {autoPlan.map((day) => (
                  <article className="rounded-2xl bg-white p-3" key={day.date}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-gray-900">{day.date}</p>
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-600">
                        총 {day.problemCount}문항
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {day.tasks.map((task) => (
                        <p className="text-xs font-bold leading-relaxed text-gray-500" key={`${task.textbookKey}-${task.startNumber}`}>
                          {task.title}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-center text-sm font-bold text-gray-400">
                교재 범위를 입력하면 계획이 표시됩니다.
              </p>
            )}
          </div>
        </div>
      </section>

      {(message || error) ? (
        <div className="space-y-2">
          {message ? (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[440px_minmax(0,1fr)]">
        <form className="space-y-4 rounded-3xl bg-white p-5 shadow-card lg:p-6" onSubmit={handleSubmit}>
          <h2 className="text-lg font-black text-gray-900">새 숙제 등록</h2>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">교재 선택</label>
            <select
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
              onChange={(event) => handleTextbookChange(event.target.value)}
              value={createForm.selectedTextbookValue}
              disabled={loadingTextbooks}
            >
              {textbookOptions.map((option) => (
                <option
                  key={getTextbookValue(option.textbookKey)}
                  value={getTextbookValue(option.textbookKey)}
                >
                  {option.label}
                </option>
              ))}
            </select>
            {!isCustomTask && selectedTextbook.totalItems ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-400">
                <span>
                  총 {selectedTextbook.totalItems}문항 / {selectedTextbook.minItemNumber}~
                  {selectedTextbook.maxItemNumber}번
                </span>
                <button
                  className="rounded-full bg-[#EEF2FF] px-3 py-1 text-[#3730A3]"
                  onClick={() => {
                    updateCreateForm({
                      endNumber: String(selectedTextbook.maxItemNumber),
                      startNumber: String(selectedTextbook.minItemNumber),
                    });
                    setTitleEdited(false);
                  }}
                  type="button"
                >
                  전체 배정
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">시작 번호</label>
              <input
                className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                min={selectedTextbook.minItemNumber ?? 1}
                max={selectedTextbook.maxItemNumber}
                onChange={(event) => updateCreateForm({ startNumber: event.target.value })}
                type="number"
                value={createForm.startNumber}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">끝 번호</label>
              <input
                className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                min={selectedTextbook.minItemNumber ?? 1}
                max={selectedTextbook.maxItemNumber}
                onChange={(event) => updateCreateForm({ endNumber: event.target.value })}
                type="number"
                value={createForm.endNumber}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">난이도</label>
              <select
                className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                onChange={(event) => updateCreateForm({ difficulty: event.target.value })}
                value={createForm.difficulty}
              >
                <option>쉬움</option>
                <option>보통</option>
                <option>어려움</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">제목</label>
            <input
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
              onChange={(event) => {
                updateCreateForm({ title: event.target.value });
                setTitleEdited(true);
              }}
              placeholder={isCustomTask ? "오답노트 2개 복습" : "문제 범위를 입력하면 자동으로 채워져요"}
              value={createForm.title}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">상세</label>
            <input
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
              onChange={(event) => updateCreateForm({ detail: event.target.value })}
              placeholder="1번 ~ 10번 / △ 문제는 질문 표시하기"
              value={createForm.detail}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">순서</label>
            <input
              className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
              min="1"
              onChange={(event) => updateCreateForm({ orderIndex: event.target.value })}
              type="number"
              value={createForm.orderIndex}
            />
          </div>

          <button
            className="w-full rounded-2xl bg-[#0F172A] py-4 text-base font-black text-white transition hover:opacity-90 disabled:opacity-50"
            disabled={submitting || loadingStudents}
            type="submit"
          >
            {submitting ? "배정 중..." : "숙제 배정하기"}
          </button>
        </form>

        <section className="rounded-3xl bg-white p-5 shadow-card lg:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-gray-900">배정된 숙제</h2>
              <p className="mt-1 text-xs font-bold text-gray-400">{selectedDate}</p>
            </div>
            {loadingTasks ? <span className="text-xs font-bold text-gray-400">불러오는 중...</span> : null}
          </div>

          {tasks.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {tasks.map((task) => (
                <article className="rounded-2xl bg-[#F8FAFC] p-4" key={task.id}>
                  {editTaskId === task.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none"
                          onChange={(event) => updateEditForm({ taskDate: event.target.value })}
                          type="date"
                          value={editForm.taskDate}
                        />
                        <input
                          className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none"
                          onChange={(event) => updateEditForm({ orderIndex: event.target.value })}
                          type="number"
                          value={editForm.orderIndex}
                        />
                      </div>
                      <input
                        className="w-full rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none"
                        onChange={(event) => updateEditForm({ title: event.target.value })}
                        value={editForm.title}
                      />
                      <input
                        className="w-full rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none"
                        onChange={(event) => updateEditForm({ detail: event.target.value })}
                        value={editForm.detail}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none"
                          onChange={(event) => updateEditForm({ startNumber: event.target.value })}
                          placeholder="시작 번호"
                          type="number"
                          value={editForm.startNumber}
                        />
                        <input
                          className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none"
                          onChange={(event) => updateEditForm({ endNumber: event.target.value })}
                          placeholder="끝 번호"
                          type="number"
                          value={editForm.endNumber}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          className="rounded-xl border border-gray-100 bg-white px-2 py-2 text-sm font-bold outline-none"
                          onChange={(event) => updateEditForm({ status: event.target.value as DailyTaskStatus })}
                          value={editForm.status}
                        >
                          <option value="todo">예정</option>
                          <option value="in_progress">진행중</option>
                          <option value="done">완료</option>
                        </select>
                        <select
                          className="rounded-xl border border-gray-100 bg-white px-2 py-2 text-sm font-bold outline-none"
                          onChange={(event) => updateEditForm({ difficulty: event.target.value })}
                          value={editForm.difficulty}
                        >
                          <option>쉬움</option>
                          <option>보통</option>
                          <option>어려움</option>
                        </select>
                        <input
                          className="rounded-xl border border-gray-100 bg-white px-2 py-2 text-sm font-bold outline-none"
                          onChange={(event) => updateEditForm({ category: event.target.value })}
                          value={editForm.category}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="flex-1 rounded-xl bg-[#0F172A] px-3 py-2 text-sm font-bold text-white"
                          disabled={savingEdit}
                          onClick={() => void handleSaveEdit(task.id)}
                          type="button"
                        >
                          저장
                        </button>
                        <button
                          className="flex-1 rounded-xl bg-white px-3 py-2 text-sm font-bold text-gray-500"
                          onClick={() => setEditTaskId(null)}
                          type="button"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-black leading-snug text-gray-900">{task.title}</h3>
                          {task.detail ? (
                            <p className="mt-1 text-sm font-medium text-gray-500">{task.detail}</p>
                          ) : null}
                          <p className="mt-2 text-xs font-bold text-gray-400">
                            {task.textbook_key ?? "직접 입력"} · {getRangeText(task)} · 순서 {task.order_index}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#3730A3]"
                            onClick={() => startEdit(task)}
                            type="button"
                          >
                            수정
                          </button>
                          <button
                            className="rounded-full bg-white px-3 py-1 text-xs font-bold text-red-400"
                            onClick={() => void handleDelete(task.id)}
                            type="button"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-bold text-[#3730A3]">
                          {task.category ?? "기타"}
                        </span>
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-600">
                          {task.difficulty ?? "보통"}
                        </span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">
                          {getStatusLabel(task.status)}
                        </span>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm font-bold text-gray-400">
              아직 배정된 숙제가 없습니다.
            </div>
          )}
        </section>
      </div>
      </div>

      <AdminBottomNav />
    </main>
  );
}
