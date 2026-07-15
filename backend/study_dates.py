from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


DEFAULT_STUDY_CUTOFF_HOUR = 5
DEFAULT_STUDY_TIMEZONE = "Asia/Seoul"


def get_study_timezone(timezone_name: str = DEFAULT_STUDY_TIMEZONE) -> tzinfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        if timezone_name == DEFAULT_STUDY_TIMEZONE:
            return timezone(timedelta(hours=9))
        raise


def to_study_datetime(
    value: datetime,
    timezone_name: str = DEFAULT_STUDY_TIMEZONE,
) -> datetime:
    timezone = get_study_timezone(timezone_name)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone)
    return value.astimezone(timezone)


def get_study_date(
    now: datetime | None = None,
    cutoff_hour: int = DEFAULT_STUDY_CUTOFF_HOUR,
    timezone: str = DEFAULT_STUDY_TIMEZONE,
) -> date:
    study_now = to_study_datetime(now or datetime.now(get_study_timezone(timezone)), timezone)
    if study_now.hour < cutoff_hour:
        return (study_now - timedelta(days=1)).date()
    return study_now.date()


def get_study_day_bounds(
    study_date: date,
    cutoff_hour: int = DEFAULT_STUDY_CUTOFF_HOUR,
    timezone: str = DEFAULT_STUDY_TIMEZONE,
) -> tuple[datetime, datetime]:
    study_timezone = get_study_timezone(timezone)
    start = datetime.combine(study_date, time(hour=cutoff_hour), tzinfo=study_timezone)
    return start, start + timedelta(days=1)
