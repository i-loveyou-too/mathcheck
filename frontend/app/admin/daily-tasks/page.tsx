"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { apiFetch } from "@/lib/api";
import { getAdmin } from "@/lib/storage";
import { AdminStudentSummary, TextbookSeriesItem } from "@/lib/types";

type TextbookListEntry = {
  id: number;
  subject: string | null;
  title: string;
  full_title: string;
  series_name: string;
  is_checkable: boolean;
  is_active: boolean;
  item_count: number;
};

type TextbookOption = {
  id?: number;
  category: string;
  label: string;
  maxItemNumber?: number;
  minItemNumber?: number;
  shortTitle: string;
  totalItems?: number;
  textbookKey: string | null;
  isStudentOnly?: boolean;
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
  is_student_only: boolean;
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

type RangeType = "item" | "free" | "none";

type TaskFormState = {
  category: string;
  detail: string;
  difficulty: string;
  endNumber: string;
  orderIndex: string;
  rangeType: RangeType;
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

type WeeklyDay = {
  date: string;
  summary: { total: number; done: number; todo: number; completion_rate: number };
  tasks: DailyTask[];
};

type WeeklyTasksApiResponse = {
  student_id: number;
  week_start: string;
  days: WeeklyDay[];
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
    rangeType: "item",
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

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function getDayLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return WEEKDAY_LABELS[d.getDay()];
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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [studentTextbookIds, setStudentTextbookIds] = useState<Set<number>>(new Set());

  // Series + quick textbook registration
  const [seriesList, setSeriesList] = useState<TextbookSeriesItem[]>([]);
  const [showQuickReg, setShowQuickReg] = useState(false);
  const [quickRegSeriesId, setQuickRegSeriesId] = useState("");
  const [quickRegSubject, setQuickRegSubject] = useState("수1");
  const [quickRegTitle, setQuickRegTitle] = useState("");
  const [quickRegItemCount, setQuickRegItemCount] = useState("");
  const [quickRegSubmitting, setQuickRegSubmitting] = useState(false);
  const [quickRegError, setQuickRegError] = useState("");

  // Weekly plan
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyDay[]>([]);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);

  // Todo quick-add form
  const [showTodoForm, setShowTodoForm] = useState(false);
  const [todoDate, setTodoDate] = useState(today);
  const [todoTitle, setTodoTitle] = useState("");
  const [todoMemo, setTodoMemo] = useState("");
  const [todoSubmitting, setTodoSubmitting] = useState(false);

  // Page auto-distribution state (create form only)
  const [freeInputMode, setFreeInputMode] = useState<"direct" | "auto_page">("direct");
  const [autoPageStart, setAutoPageStart] = useState("");
  const [autoPageEnd, setAutoPageEnd] = useState("");
  const [autoPageLabel, setAutoPageLabel] = useState("p.");
  const [autoPageNote, setAutoPageNote] = useState("");
  const [autoPageDates, setAutoPageDates] = useState<string[]>([]);
  const [autoPageDateInput, setAutoPageDateInput] = useState(today);

  // Item auto-distribution state (create form only)
  const [itemInputMode, setItemInputMode] = useState<"manual" | "auto">("manual");
  const [autoItemStart, setAutoItemStart] = useState("");
  const [autoItemEnd, setAutoItemEnd] = useState("");
  const [autoItemDates, setAutoItemDates] = useState<string[]>([]);
  const [autoItemDateInput, setAutoItemDateInput] = useState(today);

  const visibleCatalogTextbooks = useMemo(
    () => catalogTextbooks.filter((t) => !t.isStudentOnly || studentTextbookIds.has(t.id ?? -1)),
    [catalogTextbooks, studentTextbookIds],
  );
  const textbookOptions = useMemo(
    () => [...visibleCatalogTextbooks, customTextbookOption],
    [visibleCatalogTextbooks],
  );
  const assignmentTextbookOptions = visibleCatalogTextbooks;
  const selectedTextbook = getTextbookByValue(createForm.selectedTextbookValue, textbookOptions);
  const isCustomTask = selectedTextbook.textbookKey === null;

  const generatedTitle = useMemo(() => {
    if (createForm.rangeType !== "item" || isCustomTask || !selectedTextbook.shortTitle || !createForm.startNumber || !createForm.endNumber) {
      return "";
    }

    return `${selectedTextbook.shortTitle} ${createForm.startNumber}번 ~ ${createForm.endNumber}번`;
  }, [createForm.endNumber, createForm.rangeType, createForm.startNumber, isCustomTask, selectedTextbook.shortTitle]);

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

  const autoPagePlan = useMemo<{ date: string; detail: string }[]>(() => {
    const start = parseInt(autoPageStart, 10);
    const end = parseInt(autoPageEnd, 10);
    if (!autoPageStart || !autoPageEnd || isNaN(start) || isNaN(end) || end < start || autoPageDates.length === 0) {
      return [];
    }
    const totalPages = end - start + 1;
    const numDates = autoPageDates.length;
    const base = Math.floor(totalPages / numDates);
    const remainder = totalPages % numDates;
    const sorted = [...autoPageDates].sort();
    let cursor = start;
    return sorted.map((date, i) => {
      const pages = base + (i < remainder ? 1 : 0);
      const dayStart = cursor;
      const dayEnd = cursor + pages - 1;
      cursor = dayEnd + 1;
      const lbl = autoPageLabel;
      const rangeText = dayStart === dayEnd ? `${lbl}${dayStart}` : `${lbl}${dayStart}~${lbl}${dayEnd}`;
      const detail = autoPageNote.trim() ? `${autoPageNote.trim()} ${rangeText}` : rangeText;
      return { date, detail };
    });
  }, [autoPageStart, autoPageEnd, autoPageLabel, autoPageNote, autoPageDates]);

  const autoItemPlan = useMemo<{ date: string; startNum: number; endNum: number; title: string }[]>(() => {
    const start = parseInt(autoItemStart, 10);
    const end = parseInt(autoItemEnd, 10);
    if (!autoItemStart || !autoItemEnd || isNaN(start) || isNaN(end) || end < start || autoItemDates.length === 0) {
      return [];
    }
    const totalItems = end - start + 1;
    const numDates = autoItemDates.length;
    const base = Math.floor(totalItems / numDates);
    const remainder = totalItems % numDates;
    const sorted = [...autoItemDates].sort();
    const shortTitle = selectedTextbook.shortTitle;
    let cursor = start;
    return sorted.map((date, i) => {
      const items = base + (i < remainder ? 1 : 0);
      const dayStart = cursor;
      const dayEnd = cursor + items - 1;
      cursor = dayEnd + 1;
      const rangeLabel = dayStart === dayEnd ? `${dayStart}번` : `${dayStart}번 ~ ${dayEnd}번`;
      const title = shortTitle ? `${shortTitle} ${rangeLabel}` : rangeLabel;
      return { date, startNum: dayStart, endNum: dayEnd, title };
    });
  }, [autoItemStart, autoItemEnd, autoItemDates, selectedTextbook.shortTitle]);

  const weekStart = useMemo(() => {
    const d = new Date(`${selectedDate}T00:00:00`);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    return toLocalDateKey(mon);
  }, [selectedDate]);

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
        const [studentData, textbookData, listData, seriesData] = await Promise.all([
          apiFetch<AdminStudentSummary[]>("/admin/students"),
          apiFetch<AdminTextbookCatalogResponse>("/admin/textbooks"),
          apiFetch<{ textbooks: TextbookListEntry[] }>("/admin/textbook-list").catch(() => ({ textbooks: [] })),
          apiFetch<{ series: TextbookSeriesItem[] }>("/admin/textbook-series").catch(() => ({ series: [] })),
        ]);

        const catalogMapped = textbookData.textbooks
          .filter(
            (textbook) =>
              Boolean(textbook.textbook_key) &&
              textbook.is_active &&
              textbook.is_checkable
          )
          .map((textbook) => ({
            id: textbook.id,
            category: textbook.category ?? textbook.subject ?? "기타",
            label: `${textbook.short_title || textbook.title}${textbook.subject ? " · " + textbook.subject : ""} (${textbook.total_items}문항)`,
            maxItemNumber: textbook.max_item_number ?? textbook.total_items,
            minItemNumber: textbook.min_item_number ?? (textbook.total_items > 0 ? 1 : undefined),
            shortTitle: textbook.short_title,
            textbookKey: textbook.textbook_key,
            totalItems: textbook.total_items,
            isStudentOnly: textbook.is_student_only ?? false,
          }));

        const catalogIds = new Set(textbookData.textbooks.map((t) => t.id));
        const extraMapped = listData.textbooks
          .filter((t) => !catalogIds.has(t.id) && t.is_active && t.is_checkable && t.item_count > 0)
          .map((t) => ({
            category: t.subject ?? t.series_name ?? "기타",
            label: `${t.title}${t.subject ? " · " + t.subject : ""} (${t.item_count}문항)`,
            maxItemNumber: t.item_count,
            minItemNumber: 1,
            shortTitle: t.title,
            textbookKey: null as string | null,
            totalItems: t.item_count,
          }));

        const loadedTextbooks = [...catalogMapped, ...extraMapped];

        setStudents(studentData);
        setCatalogTextbooks(loadedTextbooks);
        setSeriesList(seriesData.series ?? []);
        if (seriesData.series?.[0]) setQuickRegSeriesId(String(seriesData.series[0].id));
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
    if (!selectedStudentId) return;
    apiFetch<{ textbook_ids: number[] }>(`/admin/students/${selectedStudentId}/textbook-ids`)
      .then((data) => setStudentTextbookIds(new Set(data.textbook_ids)))
      .catch(() => setStudentTextbookIds(new Set()));
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedStudentId || !weekStart) { setWeeklyTasks([]); return; }
    setLoadingWeekly(true);
    apiFetch<WeeklyTasksApiResponse>(`/student/weekly-tasks?student_id=${selectedStudentId}&week_start=${weekStart}`)
      .then((data) => setWeeklyTasks(data.days ?? []))
      .catch(() => setWeeklyTasks([]))
      .finally(() => setLoadingWeekly(false));
  }, [selectedStudentId, weekStart, taskRefreshKey]);

  useEffect(() => {
    if (generatedTitle && !titleEdited) {
      setCreateForm((current) => ({ ...current, title: generatedTitle }));
    }
  }, [generatedTitle, titleEdited]);

  useEffect(() => {
    if (!createForm.detail && createForm.startNumber && createForm.endNumber && !isCustomTask && createForm.rangeType === "item") {
      setCreateForm((current) => ({
        ...current,
        detail: `${current.startNumber}번 ~ ${current.endNumber}번`,
      }));
    }
  }, [createForm.detail, createForm.endNumber, createForm.rangeType, createForm.startNumber, isCustomTask]);

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

  const addAutoPageDate = () => {
    if (!autoPageDateInput || autoPageDates.includes(autoPageDateInput)) return;
    setAutoPageDates((current) => [...current, autoPageDateInput].sort());
  };

  const removeAutoPageDate = (date: string) => {
    setAutoPageDates((current) => current.filter((d) => d !== date));
  };

  const addAutoItemDate = () => {
    if (!autoItemDateInput || autoItemDates.includes(autoItemDateInput)) return;
    setAutoItemDates((current) => [...current, autoItemDateInput].sort());
  };

  const removeAutoItemDate = (date: string) => {
    setAutoItemDates((current) => current.filter((d) => d !== date));
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

    if (!selectedStudentId || !selectedDate) {
      setError("학생과 날짜를 확인해주세요.");
      return;
    }

    if (createForm.rangeType === "item" && itemInputMode === "auto") {
      if (autoItemDates.length === 0) { setError("날짜를 1개 이상 추가해주세요."); return; }
      if (!autoItemStart || !autoItemEnd) { setError("시작/끝 문항 번호를 입력해주세요."); return; }
      const is = parseInt(autoItemStart, 10);
      const ie = parseInt(autoItemEnd, 10);
      if (isNaN(is) || isNaN(ie)) { setError("문항 번호는 숫자로 입력해주세요."); return; }
      if (ie < is) { setError("끝 번호는 시작 번호 이상이어야 합니다."); return; }
      if (!isCustomTask && selectedTextbook.minItemNumber !== undefined && is < selectedTextbook.minItemNumber) {
        setError(`시작 번호는 ${selectedTextbook.minItemNumber}번 이상이어야 합니다.`); return;
      }
      if (!isCustomTask && selectedTextbook.maxItemNumber !== undefined && ie > selectedTextbook.maxItemNumber) {
        setError(`끝 번호는 ${selectedTextbook.maxItemNumber}번 이하여야 합니다.`); return;
      }
      if (autoItemPlan.length === 0) { setError("문항 분배 계획을 확인해주세요."); return; }

      setSubmitting(true);
      try {
        for (const plan of autoItemPlan) {
          await apiFetch<DailyTask>("/admin/daily-tasks", {
            method: "POST",
            body: {
              student_id: Number(selectedStudentId),
              task_date: plan.date,
              title: plan.title,
              detail: createForm.detail.trim() || null,
              textbook_key: selectedTextbook.textbookKey,
              start_item_number: plan.startNum,
              end_item_number: plan.endNum,
              status: "todo",
              difficulty: createForm.difficulty,
              category: createForm.category,
              order_index: Number(createForm.orderIndex) || 1,
            },
          });
        }
        setMessage(`${autoItemPlan.length}일치 숙제가 배정되었습니다.`);
        setAutoItemStart("");
        setAutoItemEnd("");
        setAutoItemDates([]);
        setCreateForm((c) => ({ ...makeEmptyForm(today), rangeType: "item", selectedTextbookValue: c.selectedTextbookValue, category: c.category, difficulty: c.difficulty, orderIndex: c.orderIndex }));
        setItemInputMode("auto");
        await fetchTasks(selectedStudentId, selectedDate);
      } catch {
        setError("숙제 배정에 실패했습니다. 다시 시도해주세요.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!createForm.title.trim()) {
      setError("제목을 확인해주세요.");
      return;
    }

    if (createForm.rangeType === "free" && freeInputMode === "auto_page") {
      if (autoPageDates.length === 0) { setError("날짜를 1개 이상 추가해주세요."); return; }
      if (!autoPageStart || !autoPageEnd) { setError("시작 페이지와 끝 페이지를 입력해주세요."); return; }
      const ps = parseInt(autoPageStart, 10);
      const pe = parseInt(autoPageEnd, 10);
      if (isNaN(ps) || isNaN(pe)) { setError("페이지는 숫자로 입력해주세요."); return; }
      if (pe < ps) { setError("끝 페이지는 시작 페이지 이상이어야 합니다."); return; }
      if (autoPagePlan.length === 0) { setError("페이지 분배 계획을 확인해주세요."); return; }

      setSubmitting(true);
      try {
        for (const plan of autoPagePlan) {
          await apiFetch<DailyTask>("/admin/daily-tasks", {
            method: "POST",
            body: {
              student_id: Number(selectedStudentId),
              task_date: plan.date,
              title: createForm.title.trim(),
              detail: plan.detail,
              textbook_key: selectedTextbook.textbookKey,
              start_item_number: null,
              end_item_number: null,
              status: "todo",
              difficulty: createForm.difficulty,
              category: createForm.category,
              order_index: Number(createForm.orderIndex) || 1,
            },
          });
        }
        setMessage(`${autoPagePlan.length}일치 숙제가 배정되었습니다.`);
        setAutoPageStart("");
        setAutoPageEnd("");
        setAutoPageNote("");
        setAutoPageDates([]);
        setCreateForm((c) => ({ ...makeEmptyForm(today), rangeType: "free", selectedTextbookValue: c.selectedTextbookValue, category: c.category, difficulty: c.difficulty, orderIndex: c.orderIndex }));
        await fetchTasks(selectedStudentId, selectedDate);
      } catch {
        setError("숙제 배정에 실패했습니다. 다시 시도해주세요.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const createStartNumber = Number(createForm.startNumber);
    const createEndNumber = Number(createForm.endNumber);
    if (createForm.rangeType === "item" && !isCustomTask && createForm.startNumber && selectedTextbook.minItemNumber !== undefined && createStartNumber < selectedTextbook.minItemNumber) {
      setError(`시작 번호는 ${selectedTextbook.minItemNumber}번 이상이어야 합니다.`);
      return;
    }
    if (createForm.rangeType === "item" && !isCustomTask && createForm.endNumber && selectedTextbook.maxItemNumber !== undefined && createEndNumber > selectedTextbook.maxItemNumber) {
      setError(`끝 번호는 ${selectedTextbook.maxItemNumber}번 이하여야 합니다.`);
      return;
    }
    if (createForm.rangeType === "item" && createForm.startNumber && createForm.endNumber && createStartNumber > createEndNumber) {
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
          start_item_number: createForm.rangeType === "item" ? toNullableNumber(createForm.startNumber) : null,
          end_item_number: createForm.rangeType === "item" ? toNullableNumber(createForm.endNumber) : null,
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
      setTaskRefreshKey((k) => k + 1);
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
      rangeType: task.start_item_number !== null ? "item" : "none",
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
          start_item_number: editForm.rangeType === "item" ? toNullableNumber(editForm.startNumber) : null,
          end_item_number: editForm.rangeType === "item" ? toNullableNumber(editForm.endNumber) : null,
          status: editForm.status,
          difficulty: editForm.difficulty,
          category: editForm.category.trim() || editTextbook.category,
          order_index: Number(editForm.orderIndex) || 1,
        },
      });

      setMessage("숙제가 수정되었습니다.");
      setEditTaskId(null);
      await fetchTasks(selectedStudentId, selectedDate);
      setTaskRefreshKey((k) => k + 1);
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
      setTaskRefreshKey((k) => k + 1);
    } catch {
      setError("삭제에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleTodoSubmit = async () => {
    setMessage("");
    setError("");
    if (!selectedStudentId || !todoTitle.trim()) return;
    setTodoSubmitting(true);
    try {
      await apiFetch<DailyTask>("/admin/daily-tasks", {
        method: "POST",
        body: {
          student_id: Number(selectedStudentId),
          task_date: todoDate,
          title: todoTitle.trim(),
          detail: todoMemo.trim() || null,
          textbook_key: null,
          start_item_number: null,
          end_item_number: null,
          status: "todo",
          difficulty: "보통",
          category: "기타",
          order_index: 1,
        },
      });
      setMessage("할 일이 추가됐습니다.");
      setTodoTitle("");
      setTodoMemo("");
      await fetchTasks(selectedStudentId, selectedDate);
      setTaskRefreshKey((k) => k + 1);
    } catch {
      setError("추가에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setTodoSubmitting(false);
    }
  };

  const handleQuickRegister = async () => {
    setQuickRegError("");
    if (!quickRegTitle.trim()) { setQuickRegError("교재명을 입력해주세요."); return; }
    if (!quickRegSeriesId) { setQuickRegError("시리즈를 선택해주세요."); return; }
    const series = seriesList.find((s) => String(s.id) === quickRegSeriesId);
    if (!series) { setQuickRegError("시리즈를 선택해주세요."); return; }
    const subjectMap: Record<string, string> = { "수1": "math1", "수2": "math2", "확통": "statistics" };
    const fullTitle = `${series.display_name} ${quickRegSubject} - ${quickRegTitle.trim()}`;
    const textbookKey = `${series.english_name.toLowerCase().replace(/\s+/g, "-")}-${subjectMap[quickRegSubject] ?? quickRegSubject}-${quickRegTitle.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 20)}`;
    setQuickRegSubmitting(true);
    try {
      await apiFetch("/admin/textbooks", {
        method: "POST",
        body: {
          series_id: Number(quickRegSeriesId),
          subject: quickRegSubject,
          title: quickRegTitle.trim(),
          full_title: fullTitle,
          textbook_key: textbookKey,
          type: "problem",
          is_checkable: true,
          is_published: true,
          is_active: true,
          order_index: 0,
          item_count: Number(quickRegItemCount) || 0,
        },
      });
      // Refetch textbooks
      const [textbookData, listData] = await Promise.all([
        apiFetch<AdminTextbookCatalogResponse>("/admin/textbooks"),
        apiFetch<{ textbooks: TextbookListEntry[] }>("/admin/textbook-list").catch(() => ({ textbooks: [] })),
      ]);
      const catalogMapped = textbookData.textbooks
        .filter((t) => Boolean(t.textbook_key) && t.is_active && t.is_checkable)
        .map((t) => ({
          id: t.id,
          category: t.category ?? t.subject ?? "기타",
          label: `${t.short_title || t.title}${t.subject ? " · " + t.subject : ""} (${t.total_items}문항)`,
          maxItemNumber: t.max_item_number ?? t.total_items,
          minItemNumber: t.min_item_number ?? (t.total_items > 0 ? 1 : undefined),
          shortTitle: t.short_title,
          textbookKey: t.textbook_key,
          totalItems: t.total_items,
          isStudentOnly: t.is_student_only ?? false,
        }));
      const catalogIds = new Set(textbookData.textbooks.map((t) => t.id));
      const extraMapped = listData.textbooks
        .filter((t) => !catalogIds.has(t.id) && t.is_active && t.is_checkable && t.item_count > 0)
        .map((t) => ({
          category: t.subject ?? t.series_name ?? "기타",
          label: `${t.title}${t.subject ? " · " + t.subject : ""} (${t.item_count}문항)`,
          maxItemNumber: t.item_count,
          minItemNumber: 1,
          shortTitle: t.title,
          textbookKey: null as string | null,
          totalItems: t.item_count,
        }));
      setCatalogTextbooks([...catalogMapped, ...extraMapped]);
      setQuickRegTitle("");
      setQuickRegItemCount("");
      setShowQuickReg(false);
      setMessage(`"${fullTitle}" 교재가 등록됐습니다.`);
    } catch {
      setQuickRegError("등록에 실패했습니다. 교재명 중복 또는 서버 오류.");
    } finally {
      setQuickRegSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#EEF2F6]">
      <div className="mx-auto min-h-screen w-full max-w-2xl space-y-4 px-5 py-8 pb-32 lg:px-8">

        {/* Header */}
        <div className="pb-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">관리자</p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-gray-900">숙제 배정</h1>
          <p className="mt-1 text-sm text-gray-500">학생별 교재 범위와 할 일을 배정해요.</p>
        </div>

        {/* 학생 선택 */}
        <section className="rounded-3xl bg-white p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">학생</p>
          <h2 className="mt-1 text-lg font-black text-gray-900">누구에게 배정할까요?</h2>
          <select
            className="mt-4 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
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
        </section>

        {/* Step 1: 배정 방식 */}
        <section className="rounded-3xl bg-white p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Step 1</p>
          <h2 className="mt-1 text-lg font-black text-gray-900">배정 방식</h2>
          <p className="mt-0.5 text-xs text-gray-400">어떤 방식으로 숙제를 배정할지 선택하세요.</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <button
              className={`rounded-2xl p-4 text-left transition ${!showCreateForm ? "bg-[#0F172A] text-white" : "bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
              onClick={() => setShowCreateForm(false)}
              type="button"
            >
              <p className="text-2xl">📚</p>
              <p className="mt-3 text-sm font-black">문항수</p>
              <p className={`mt-0.5 text-xs font-medium ${!showCreateForm ? "text-white/60" : "text-gray-400"}`}>자동 분배</p>
            </button>
            <button
              className={`rounded-2xl p-4 text-left transition ${showCreateForm && createForm.rangeType === "free" ? "bg-[#0F172A] text-white" : "bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
              onClick={() => { setShowCreateForm(true); updateCreateForm({ rangeType: "free", startNumber: "", endNumber: "" }); setFreeInputMode("direct"); setItemInputMode("manual"); }}
              type="button"
            >
              <p className="text-2xl">📄</p>
              <p className="mt-3 text-sm font-black">페이지</p>
              <p className={`mt-0.5 text-xs font-medium ${showCreateForm && createForm.rangeType === "free" ? "text-white/60" : "text-gray-400"}`}>직접 입력</p>
            </button>
            <button
              className={`rounded-2xl p-4 text-left transition ${showCreateForm && createForm.rangeType !== "free" ? "bg-[#0F172A] text-white" : "bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
              onClick={() => { setShowCreateForm(true); updateCreateForm({ rangeType: "none", startNumber: "", endNumber: "" }); setFreeInputMode("direct"); setItemInputMode("manual"); }}
              type="button"
            >
              <p className="text-2xl">✏️</p>
              <p className="mt-3 text-sm font-black">직접 등록</p>
              <p className={`mt-0.5 text-xs font-medium ${showCreateForm && createForm.rangeType !== "free" ? "text-white/60" : "text-gray-400"}`}>단건 등록</p>
            </button>
          </div>

          {/* 교재 빠른 등록 */}
          <div className="mt-4 border-t border-gray-50 pt-4">
            <button
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${showQuickReg ? "bg-[#0F172A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              onClick={() => setShowQuickReg((v) => !v)}
              type="button"
            >
              + 교재 빠른 등록
            </button>
            {showQuickReg ? (
              <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
                <p className="mb-3 text-sm font-black text-gray-800">교재 빠른 등록</p>
                {seriesList.length === 0 ? (
                  <p className="text-xs font-bold text-yellow-600">
                    등록된 시리즈가 없습니다.{" "}
                    <Link className="underline" href="/admin/textbooks-management">
                      교재 관리에서 시리즈를 먼저 추가해주세요 →
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">시리즈</label>
                        <select
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none"
                          onChange={(e) => setQuickRegSeriesId(e.target.value)}
                          value={quickRegSeriesId}
                        >
                          {seriesList.map((s) => (
                            <option key={s.id} value={s.id}>{s.display_name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">과목</label>
                        <div className="flex gap-1.5">
                          {(["수1", "수2", "확통"] as const).map((subj) => (
                            <button
                              key={subj}
                              type="button"
                              onClick={() => setQuickRegSubject(subj)}
                              className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${quickRegSubject === subj ? "bg-[#0F172A] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                            >
                              {subj}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">교재명</label>
                        <input
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none"
                          onChange={(e) => setQuickRegTitle(e.target.value)}
                          placeholder="예: 유형 마스터"
                          value={quickRegTitle}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">문항 수 (선택)</label>
                        <input
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none"
                          min="0"
                          onChange={(e) => setQuickRegItemCount(e.target.value)}
                          placeholder="0"
                          type="number"
                          value={quickRegItemCount}
                        />
                      </div>
                    </div>
                    {quickRegError ? <p className="text-xs font-bold text-red-500">{quickRegError}</p> : null}
                    <div className="flex gap-2">
                      <button
                        className="rounded-xl bg-[#0F172A] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        disabled={quickRegSubmitting || !quickRegTitle.trim()}
                        onClick={() => void handleQuickRegister()}
                        type="button"
                      >
                        {quickRegSubmitting ? "등록 중..." : "등록"}
                      </button>
                      <button
                        className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-gray-600"
                        onClick={() => { setShowQuickReg(false); setQuickRegError(""); }}
                        type="button"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>

        {/* 문항수 자동 배정 흐름 */}
        {!showCreateForm ? (
          <>
            {/* Step 2: 배정 기준 */}
            <section className="rounded-3xl bg-white p-5 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Step 2</p>
              <h2 className="mt-1 text-lg font-black text-gray-900">배정 기준</h2>
              <p className="mt-0.5 text-xs text-gray-400">날짜와 하루 분량 기준을 설정하세요.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-bold text-gray-500">시작 날짜</label>
                  <input
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    onChange={(event) => setAutoStartDate(event.target.value)}
                    type="date"
                    value={autoStartDate}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                  <input
                    checked={autoExcludeWeekends}
                    className="h-4 w-4 accent-[#0F172A]"
                    onChange={(event) => setAutoExcludeWeekends(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="text-sm font-bold text-gray-700">주말 제외</span>
                </label>
                <div>
                  <label className="mb-2 block text-xs font-bold text-gray-500">하루 최소 문항</label>
                  <input
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    min="1"
                    onChange={(event) => setAutoMinProblems(event.target.value)}
                    type="number"
                    value={autoMinProblems}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold text-gray-500">하루 최대 문항</label>
                  <input
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    min="1"
                    onChange={(event) => setAutoMaxProblems(event.target.value)}
                    type="number"
                    value={autoMaxProblems}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-bold text-gray-500">하루 최대 교재 수</label>
                  <input
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    min="1"
                    onChange={(event) => setAutoMaxTextbooks(event.target.value)}
                    type="number"
                    value={autoMaxTextbooks}
                  />
                </div>
              </div>
            </section>

            {/* Step 3: 교재 선택 */}
            <section className="rounded-3xl bg-white p-5 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Step 3</p>
              <h2 className="mt-1 text-lg font-black text-gray-900">교재 선택</h2>
              <p className="mt-0.5 text-xs text-gray-400">배정할 교재와 문항 범위를 입력하세요.</p>

              {!loadingTextbooks && assignmentTextbookOptions.length === 0 ? (
                <div className="mt-4 rounded-2xl bg-yellow-50 px-4 py-3 text-xs font-bold text-yellow-700">
                  교재가 없습니다.{" "}
                  <Link className="underline" href="/admin/textbooks-management">
                    교재 관리에서 교재를 먼저 등록해주세요 →
                  </Link>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {autoRows.map((row) => {
                  const rowTextbook = getTextbookByValue(row.textbookValue, assignmentTextbookOptions);
                  return (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4" key={row.id}>
                      <select
                        className="w-full rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-sm font-bold text-gray-900 outline-none"
                        disabled={loadingTextbooks}
                        onChange={(event) => updateAutoRow(row.id, { textbookValue: event.target.value })}
                        value={row.textbookValue}
                      >
                        {assignmentTextbookOptions.map((option) => (
                          <option key={getTextbookValue(option.textbookKey)} value={getTextbookValue(option.textbookKey)}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
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
                          className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-red-400 disabled:opacity-30"
                          disabled={autoRows.length === 1}
                          onClick={() => removeAutoRow(row.id)}
                          type="button"
                        >
                          삭제
                        </button>
                      </div>
                      {rowTextbook.textbookKey ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">총 {rowTextbook.totalItems}문항 · {rowTextbook.minItemNumber}~{rowTextbook.maxItemNumber}번</span>
                          <button
                            className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-500"
                            onClick={() => updateAutoRow(row.id, { endNumber: String(rowTextbook.maxItemNumber), startNumber: String(rowTextbook.minItemNumber) })}
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

              <button
                className="mt-3 w-full rounded-2xl border-2 border-dashed border-gray-200 py-3.5 text-sm font-bold text-gray-400 transition hover:border-indigo-200 hover:text-indigo-400"
                onClick={addAutoRow}
                type="button"
              >
                + 교재 추가
              </button>

              {autoValidationErrors.length > 0 ? (
                <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500">
                  {autoValidationErrors.map((validationError) => (
                    <p key={validationError}>{validationError}</p>
                  ))}
                </div>
              ) : null}
            </section>

            {/* Step 4: 미리보기 */}
            <section className="rounded-3xl bg-white p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Step 4</p>
                  <h2 className="mt-1 text-lg font-black text-gray-900">미리보기</h2>
                </div>
                {autoPlan.length > 0 ? (
                  <span className="mt-1 shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-500">
                    총 {autoPlan.length}일
                  </span>
                ) : null}
              </div>
              {autoPlan.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {autoPlan.map((day, dayIndex) => (
                    <article className="rounded-2xl bg-gray-50 p-4" key={day.date}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-[10px] font-black text-white">{dayIndex + 1}</span>
                          <p className="text-sm font-black text-gray-900">{day.date}</p>
                        </div>
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-500">{day.problemCount}문항</span>
                      </div>
                      <div className="mt-2.5 space-y-1 pl-8">
                        {day.tasks.map((task) => (
                          <p className="text-xs font-bold leading-relaxed text-gray-500" key={`${task.textbookKey}-${task.startNumber}`}>{task.title}</p>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm font-bold text-gray-400">
                  교재 범위를 입력하면 계획이 표시됩니다.
                </p>
              )}
            </section>

            {/* CTA */}
            <button
              className="w-full rounded-3xl bg-[#0F172A] py-4 text-base font-black text-white shadow-lg transition hover:opacity-90 disabled:opacity-40"
              disabled={autoSubmitting || autoPlan.length === 0 || autoValidationErrors.length > 0 || !selectedStudentId}
              onClick={() => void handleAutoSubmit()}
              type="button"
            >
              {autoSubmitting ? "배정 중..." : autoPlan.length > 0 ? `숙제 배정하기 (${autoPlan.length}일)` : "숙제 배정하기"}
            </button>
          </>
        ) : (
          /* 직접 등록 / 페이지 등록 폼 */
          <section className="rounded-3xl bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
              {createForm.rangeType === "free" ? "페이지 등록" : "직접 등록"}
            </p>
            <h2 className="mt-1 text-lg font-black text-gray-900">숙제 단건 등록</h2>
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-xs font-bold text-gray-500">교재 선택</label>
                {loadingTextbooks ? (
                  <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-400">불러오는 중...</p>
                ) : (
                  <select
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    disabled={loadingTextbooks}
                    onChange={(event) => handleTextbookChange(event.target.value)}
                    value={createForm.selectedTextbookValue}
                  >
                    {textbookOptions.map((option) => (
                      <option key={getTextbookValue(option.textbookKey)} value={getTextbookValue(option.textbookKey)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                {!isCustomTask && selectedTextbook.totalItems ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-400">
                    <span>총 {selectedTextbook.totalItems}문항 / {selectedTextbook.minItemNumber}~{selectedTextbook.maxItemNumber}번</span>
                    <button
                      className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-500"
                      onClick={() => { updateCreateForm({ endNumber: String(selectedTextbook.maxItemNumber), startNumber: String(selectedTextbook.minItemNumber) }); setTitleEdited(false); }}
                      type="button"
                    >
                      전체 배정
                    </button>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-gray-500">범위 방식</label>
                <div className="flex gap-2">
                  {(["item", "free", "none"] as const).map((type) => (
                    <button
                      className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${createForm.rangeType === type ? "bg-[#0F172A] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                      key={type}
                      onClick={() => { updateCreateForm({ rangeType: type, startNumber: "", endNumber: "" }); setFreeInputMode("direct"); setItemInputMode("manual"); }}
                      type="button"
                    >
                      {type === "item" ? "문항 번호" : type === "free" ? "페이지/자유" : "범위 없음"}
                    </button>
                  ))}
                </div>
              </div>

              {createForm.rangeType === "item" ? (
                <>
                  <div>
                    <label className="mb-2 block text-xs font-bold text-gray-500">입력 방식</label>
                    <div className="flex gap-2">
                      {(["manual", "auto"] as const).map((mode) => (
                        <button
                          className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${itemInputMode === mode ? "bg-[#0F172A] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                          key={mode}
                          onClick={() => setItemInputMode(mode)}
                          type="button"
                        >
                          {mode === "manual" ? "직접 입력" : "문항 자동 분배"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {itemInputMode === "manual" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-2 block text-xs font-bold text-gray-500">시작 번호</label>
                        <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" min={selectedTextbook.minItemNumber ?? 1} max={selectedTextbook.maxItemNumber} onChange={(event) => updateCreateForm({ startNumber: event.target.value })} type="number" value={createForm.startNumber} />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-bold text-gray-500">끝 번호</label>
                        <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" min={selectedTextbook.minItemNumber ?? 1} max={selectedTextbook.maxItemNumber} onChange={(event) => updateCreateForm({ endNumber: event.target.value })} type="number" value={createForm.endNumber} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-2 block text-xs font-bold text-gray-500">시작 문항</label>
                          <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" min={selectedTextbook.minItemNumber ?? 1} onChange={(e) => setAutoItemStart(e.target.value)} placeholder={String(selectedTextbook.minItemNumber ?? 1)} type="number" value={autoItemStart} />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold text-gray-500">끝 문항</label>
                          <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" min={selectedTextbook.minItemNumber ?? 1} max={selectedTextbook.maxItemNumber} onChange={(e) => setAutoItemEnd(e.target.value)} placeholder={String(selectedTextbook.maxItemNumber ?? 15)} type="number" value={autoItemEnd} />
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-bold text-gray-500">날짜 추가</label>
                        <div className="flex gap-2">
                          <input className="flex-1 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" onChange={(e) => setAutoItemDateInput(e.target.value)} type="date" value={autoItemDateInput} />
                          <button className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700" onClick={addAutoItemDate} type="button">+ 추가</button>
                        </div>
                        {autoItemDates.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {autoItemDates.map((date) => (
                              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700" key={date}>
                                {date}
                                <button className="ml-1 text-gray-400 hover:text-red-400" onClick={() => removeAutoItemDate(date)} type="button">×</button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {autoItemPlan.length > 0 ? (
                        <div className="rounded-2xl bg-indigo-50 p-4">
                          <p className="text-xs font-black text-indigo-700">자동 배정 미리보기</p>
                          <div className="mt-2 space-y-1">
                            {autoItemPlan.map((plan) => (
                              <p className="text-xs font-bold text-gray-600" key={plan.date}>{plan.date}: {plan.title}</p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              ) : createForm.rangeType === "free" ? (
                <>
                  <div>
                    <label className="mb-2 block text-xs font-bold text-gray-500">입력 방식</label>
                    <div className="flex gap-2">
                      {(["direct", "auto_page"] as const).map((mode) => (
                        <button
                          className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${freeInputMode === mode ? "bg-[#3730A3] text-white" : "bg-[#EEF2FF] text-[#3730A3] hover:bg-[#E0E7FF]"}`}
                          key={mode}
                          onClick={() => setFreeInputMode(mode)}
                          type="button"
                        >
                          {mode === "direct" ? "직접 입력" : "페이지 자동 분배"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {freeInputMode === "auto_page" ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-2 block text-xs font-bold text-gray-500">시작 페이지</label>
                          <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" min="1" onChange={(e) => setAutoPageStart(e.target.value)} placeholder="32" type="number" value={autoPageStart} />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold text-gray-500">끝 페이지</label>
                          <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" min="1" onChange={(e) => setAutoPageEnd(e.target.value)} placeholder="45" type="number" value={autoPageEnd} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-2 block text-xs font-bold text-gray-500">라벨</label>
                          <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" onChange={(e) => setAutoPageLabel(e.target.value)} placeholder="p." value={autoPageLabel} />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold text-gray-500">메모 (선택)</label>
                          <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" onChange={(e) => setAutoPageNote(e.target.value)} placeholder="쎈 수1 풀기" value={autoPageNote} />
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-bold text-gray-500">날짜 추가</label>
                        <div className="flex gap-2">
                          <input className="flex-1 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" onChange={(e) => setAutoPageDateInput(e.target.value)} type="date" value={autoPageDateInput} />
                          <button className="rounded-2xl bg-[#EEF2FF] px-4 py-3 text-sm font-bold text-[#3730A3]" onClick={addAutoPageDate} type="button">+ 추가</button>
                        </div>
                        {autoPageDates.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {autoPageDates.map((date) => (
                              <span className="flex items-center gap-1 rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-bold text-[#3730A3]" key={date}>
                                {date}
                                <button className="ml-1 text-[#6366F1] hover:text-red-400" onClick={() => removeAutoPageDate(date)} type="button">×</button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {autoPagePlan.length > 0 ? (
                        <div className="rounded-2xl border border-[#C7D2FE] bg-[#F5F3FF] p-4">
                          <p className="text-xs font-black text-[#3730A3]">자동 배정 미리보기</p>
                          <div className="mt-2 space-y-1">
                            {autoPagePlan.map((plan) => (
                              <p className="text-xs font-bold text-gray-600" key={plan.date}>{plan.date}: {plan.detail}</p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}

              <div>
                <label className="mb-2 block text-xs font-bold text-gray-500">날짜</label>
                <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" onChange={(event) => setSelectedDate(event.target.value)} type="date" value={selectedDate} />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold text-gray-500">제목</label>
                <input
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                  onChange={(event) => { updateCreateForm({ title: event.target.value }); setTitleEdited(true); }}
                  placeholder={isCustomTask ? "오답노트 2개 복습" : "문제 범위를 입력하면 자동으로 채워져요"}
                  value={createForm.title}
                />
              </div>
              {!(createForm.rangeType === "free" && freeInputMode === "auto_page") ? (
                <div>
                  <label className="mb-2 block text-xs font-bold text-gray-500">
                    {createForm.rangeType === "free" ? "범위 메모" : "상세"}
                  </label>
                  <input
                    className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                    onChange={(event) => updateCreateForm({ detail: event.target.value })}
                    placeholder={createForm.rangeType === "free" ? "예: p.32~p.36 / 프린트 1장 / 오답 5문제" : "1번 ~ 10번 / △ 문제는 질문 표시하기"}
                    value={createForm.detail}
                  />
                </div>
              ) : null}
              <div>
                <label className="mb-2 block text-xs font-bold text-gray-500">순서</label>
                <input className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]" min="1" onChange={(event) => updateCreateForm({ orderIndex: event.target.value })} type="number" value={createForm.orderIndex} />
              </div>
              <button className="w-full rounded-2xl bg-[#0F172A] py-3.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50" disabled={submitting || loadingStudents} type="submit">
                {submitting ? "배정 중..." : "등록하기"}
              </button>
            </form>
          </section>
        )}

        {/* 메시지 */}
        {(message || error) ? (
          <div className="space-y-2">
            {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3.5 text-sm font-bold text-emerald-600">{message}</p> : null}
            {error ? <p className="rounded-2xl bg-red-50 px-4 py-3.5 text-sm font-bold text-red-500">{error}</p> : null}
          </div>
        ) : null}

        {/* 할 일 추가 */}
        <section className="rounded-3xl bg-white shadow-card">
          <button
            className="flex w-full items-center justify-between p-5"
            onClick={() => setShowTodoForm((v) => !v)}
            type="button"
          >
            <div className="text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">기타</p>
              <h2 className="mt-1 text-lg font-black text-gray-900">할 일 추가</h2>
              <p className="mt-0.5 text-xs text-gray-400">오답노트, 프린트, 개념복습 등 자유롭게 추가해요.</p>
            </div>
            <span className="ml-4 shrink-0 text-sm font-bold text-gray-300">{showTodoForm ? "▲" : "▼"}</span>
          </button>
          {showTodoForm ? (
            <form
              className="space-y-4 border-t border-gray-50 px-5 pb-5 pt-4"
              onSubmit={(e) => { e.preventDefault(); void handleTodoSubmit(); }}
            >
              <div>
                <label className="mb-2 block text-xs font-bold text-gray-500">날짜</label>
                <input
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                  onChange={(e) => setTodoDate(e.target.value)}
                  type="date"
                  value={todoDate}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold text-gray-500">제목</label>
                <input
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                  onChange={(e) => setTodoTitle(e.target.value)}
                  placeholder="오답노트 2개 복습"
                  value={todoTitle}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold text-gray-500">메모 (선택)</label>
                <input
                  className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-[#0F172A]"
                  onChange={(e) => setTodoMemo(e.target.value)}
                  placeholder="추가 메모"
                  value={todoMemo}
                />
              </div>
              <button
                className="w-full rounded-2xl bg-[#0F172A] py-3.5 text-sm font-black text-white disabled:opacity-50"
                disabled={todoSubmitting || !todoTitle.trim() || !selectedStudentId}
                type="submit"
              >
                {todoSubmitting ? "추가 중..." : "할 일 추가하기"}
              </button>
            </form>
          ) : null}
        </section>

        {/* 주간 계획표 */}
        <section className="rounded-3xl bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">배정 현황</p>
              <h2 className="mt-1 text-lg font-black text-gray-900">주간 계획표</h2>
              <p className="mt-0.5 text-xs text-gray-400">{weekStart} 주 (월~일)</p>
            </div>
            <div className="flex items-center gap-2">
              {loadingWeekly ? <span className="text-xs font-bold text-gray-400">불러오는 중...</span> : null}
              <input
                className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900 outline-none"
                onChange={(event) => setSelectedDate(event.target.value)}
                type="date"
                value={selectedDate}
              />
            </div>
          </div>

          {weeklyTasks.length > 0 ? (
            <div className="space-y-4">
              {weeklyTasks.map((day) => (
                <div key={day.date}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-black text-gray-700">{day.date} ({getDayLabel(day.date)})</span>
                    {day.summary.total > 0 ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                        {day.summary.done}/{day.summary.total} 완료
                      </span>
                    ) : null}
                  </div>
                  {day.tasks.length > 0 ? (
                    <div className="space-y-2">
                      {day.tasks.map((task) => (
                        <article className="rounded-2xl bg-[#F8FAFC] p-3" key={task.id}>
                          {editTaskId === task.id ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <input className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none" onChange={(event) => updateEditForm({ taskDate: event.target.value })} type="date" value={editForm.taskDate} />
                                <input className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none" onChange={(event) => updateEditForm({ orderIndex: event.target.value })} type="number" value={editForm.orderIndex} />
                              </div>
                              <input className="w-full rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none" onChange={(event) => updateEditForm({ title: event.target.value })} value={editForm.title} />
                              <input className="w-full rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none" onChange={(event) => updateEditForm({ detail: event.target.value })} placeholder={editForm.rangeType === "free" ? "예: p.32~p.36 / 프린트 1장" : "상세 설명"} value={editForm.detail} />
                              <div className="flex gap-1">
                                {(["item", "free", "none"] as const).map((type) => (
                                  <button className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${editForm.rangeType === type ? "bg-[#0F172A] text-white" : "bg-gray-100 text-gray-500"}`} key={type} onClick={() => updateEditForm({ rangeType: type, startNumber: "", endNumber: "" })} type="button">
                                    {type === "item" ? "문항" : type === "free" ? "페이지" : "없음"}
                                  </button>
                                ))}
                              </div>
                              {editForm.rangeType === "item" ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <input className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none" onChange={(event) => updateEditForm({ startNumber: event.target.value })} placeholder="시작 번호" type="number" value={editForm.startNumber} />
                                  <input className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold outline-none" onChange={(event) => updateEditForm({ endNumber: event.target.value })} placeholder="끝 번호" type="number" value={editForm.endNumber} />
                                </div>
                              ) : null}
                              <div className="grid grid-cols-2 gap-2">
                                <select className="rounded-xl border border-gray-100 bg-white px-2 py-2 text-sm font-bold outline-none" onChange={(event) => updateEditForm({ status: event.target.value as DailyTaskStatus })} value={editForm.status}>
                                  <option value="todo">예정</option>
                                  <option value="in_progress">진행중</option>
                                  <option value="done">완료</option>
                                </select>
                                <input className="rounded-xl border border-gray-100 bg-white px-2 py-2 text-sm font-bold outline-none" onChange={(event) => updateEditForm({ category: event.target.value })} placeholder="카테고리" value={editForm.category} />
                              </div>
                              <div className="flex gap-2">
                                <button className="flex-1 rounded-xl bg-[#0F172A] px-3 py-2 text-sm font-bold text-white" disabled={savingEdit} onClick={() => void handleSaveEdit(task.id)} type="button">저장</button>
                                <button className="flex-1 rounded-xl bg-white px-3 py-2 text-sm font-bold text-gray-500" onClick={() => setEditTaskId(null)} type="button">취소</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="text-sm font-black leading-snug text-gray-900">{task.title}</h3>
                                {task.detail ? <p className="mt-0.5 text-xs font-medium text-gray-500">{task.detail}</p> : null}
                                <p className="mt-1 text-xs font-bold text-gray-400">
                                  {task.textbook_key
                                    ? (catalogTextbooks.find((t) => t.textbookKey === task.textbook_key)?.shortTitle ?? task.textbook_key)
                                    : "직접 입력"}{" "}
                                  · {getRangeText(task)}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${task.status === "done" ? "bg-emerald-100 text-emerald-600" : task.status === "in_progress" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500"}`}>
                                  {getStatusLabel(task.status)}
                                </span>
                                <button className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#3730A3]" onClick={() => startEdit(task)} type="button">수정</button>
                                <button className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-red-400" onClick={() => void handleDelete(task.id)} type="button">삭제</button>
                              </div>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-gray-50 py-2 text-center text-xs font-bold text-gray-300">숙제 없음</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm font-bold text-gray-400">
              {loadingWeekly ? "불러오는 중..." : selectedStudentId ? "이번 주 배정된 숙제가 없습니다." : "학생을 선택해주세요."}
            </div>
          )}
        </section>
      </div>

      <AdminBottomNav />
    </main>
  );
}
