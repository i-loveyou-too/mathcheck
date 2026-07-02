export type StudentLoginResponse = {
  id: number;
  name: string;
  grade: string;
};

export type AdminLoginResponse = {
  id: number;
  username: string;
};

export type SubjectWithUnits = {
  id: number;
  name: string;
  order_index: number;
  units: {
    id: number;
    name: string;
    order_index: number;
  }[];
};

export type TaskWithProgress = {
  id: number;
  title: string;
  order_index: number;
  is_done: boolean;
  done_at: string | null;
};

export type ProgressCheckResponse = {
  id: number;
  student_id: number;
  task_id: number;
  is_done: boolean;
  done_at: string | null;
};

export type TaskStatus = {
  id: number;
  title: string;
  order_index: number;
  is_done: boolean;
  done_at: string | null;
};

export type UnitStatus = {
  id: number;
  name: string;
  order_index: number;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
  tasks: TaskStatus[];
};

export type SubjectStatus = {
  id: number;
  name: string;
  order_index: number;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
  units: UnitStatus[];
};

export type StudentSummary = {
  student_id: number;
  name: string;
  grade: string;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
  subjects: SubjectStatus[];
};

export type AdminStudentSummary = {
  id: number;
  name: string;
  phone: string;
  grade: string;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
};

export type AdminStudentProgress = StudentSummary;

export type StudentCardSubjectProgress = {
  id: number;
  name: string;
  progressPercentage: number;
};

export type StudentDashboardProgressBucket = {
  total: number;
  done: number;
  partial: number;
  not_started: number;
  progress_rate: number;
};

export type StudentDashboardSubjectProgress = StudentDashboardProgressBucket & {
  subject: string;
};

export type StudentDashboardProgressSummary = {
  student_id: number;
  overall: StudentDashboardProgressBucket;
  subjects: StudentDashboardSubjectProgress[];
};

export type StoredStudent = {
  id: number;
  name: string;
  grade: string;
};

export type StoredAdmin = {
  id: number;
  username: string;
  isLoggedIn: boolean;
};

export type StudentTextbook = {
  id: number;
  textbook_key: string;
  subject: string | null;
  title: string;
  full_title: string;
  type: string;
  is_checkable: boolean;
  is_published: boolean;
  is_active: boolean;
  item_count: number;
};

export type StudentTextbookListResponse = {
  textbooks: StudentTextbook[];
};

export type TextbookSeriesItem = {
  id: number;
  korean_name: string;
  english_name: string;
  display_name: string;
  type: string;
  order_index: number;
};

export type TextbookMgmtListItem = {
  id: number;
  series_id: number;
  series_name: string;
  subject: string | null;
  title: string;
  full_title: string;
  type: string;
  is_checkable: boolean;
  is_published: boolean;
  is_active: boolean;
  is_student_only: boolean;
  item_count: number;
  order_index: number;
  created_at: string;
};

export type TextbookMgmtDetailItem = {
  id: number;
  item_number: number;
  title: string;
  item_type: string;
  is_active: boolean;
};

export type TextbookMgmtDetail = {
  id: number;
  series_id: number;
  series_name: string;
  subject: string | null;
  title: string;
  full_title: string;
  type: string;
  is_checkable: boolean;
  is_published: boolean;
  is_active: boolean;
  is_student_only: boolean;
  order_index: number;
  item_count: number;
  items: TextbookMgmtDetailItem[];
};

export type StudentTextbookAssignment = {
  student_id: number;
  student_name: string;
  student_grade: string;
  is_active: boolean;
  assigned_at: string;
};

export type TextbookAssignmentsResponse = {
  textbook_id: number;
  is_student_only: boolean;
  assignments: StudentTextbookAssignment[];
};
