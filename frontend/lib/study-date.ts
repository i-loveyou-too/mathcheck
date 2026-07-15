const DEFAULT_STUDY_CUTOFF_HOUR = 5;
const DEFAULT_STUDY_TIMEZONE = "Asia/Seoul";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function getZonedParts(
  value: Date,
  timeZone: string = DEFAULT_STUDY_TIMEZONE,
): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
  };
}

function formatUtcDateKey(value: Date) {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getStudyDate(
  now: Date = new Date(),
  cutoffHour: number = DEFAULT_STUDY_CUTOFF_HOUR,
  timeZone: string = DEFAULT_STUDY_TIMEZONE,
) {
  const { year, month, day, hour } = getZonedParts(now, timeZone);
  const currentStudyDate = new Date(Date.UTC(year, month - 1, day));
  if (hour < cutoffHour) {
    currentStudyDate.setUTCDate(currentStudyDate.getUTCDate() - 1);
  }
  return formatUtcDateKey(currentStudyDate);
}

export function getStudyDateObject(
  now: Date = new Date(),
  cutoffHour: number = DEFAULT_STUDY_CUTOFF_HOUR,
  timeZone: string = DEFAULT_STUDY_TIMEZONE,
) {
  return parseDateKey(getStudyDate(now, cutoffHour, timeZone));
}

export function getWeekStartFromDateKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return toDateKey(date);
}

export function getCurrentStudyWeekStart(
  now: Date = new Date(),
  cutoffHour: number = DEFAULT_STUDY_CUTOFF_HOUR,
  timeZone: string = DEFAULT_STUDY_TIMEZONE,
) {
  return getWeekStartFromDateKey(getStudyDate(now, cutoffHour, timeZone));
}
