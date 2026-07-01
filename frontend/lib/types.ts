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
