import { StoredAdmin, StoredStudent } from "@/lib/types";

const STUDENT_KEY = "mathcheck-student";
const ADMIN_KEY = "mathcheck-admin";

export function saveStudent(student: StoredStudent) {
  localStorage.setItem(STUDENT_KEY, JSON.stringify(student));
}

export function getStudent(): StoredStudent | null {
  const raw = localStorage.getItem(STUDENT_KEY);
  return raw ? (JSON.parse(raw) as StoredStudent) : null;
}

export function clearStudent() {
  localStorage.removeItem(STUDENT_KEY);
}

export function saveAdmin(admin: StoredAdmin) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
}

export function getAdmin(): StoredAdmin | null {
  const raw = localStorage.getItem(ADMIN_KEY);
  return raw ? (JSON.parse(raw) as StoredAdmin) : null;
}

export function clearAdmin() {
  localStorage.removeItem(ADMIN_KEY);
}
