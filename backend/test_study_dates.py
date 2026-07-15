from datetime import date, datetime
from unittest import TestCase

from crud import is_completed_within_deadline
from study_dates import get_study_date, get_study_day_bounds, get_study_timezone


class StudyDateTests(TestCase):
    def test_get_study_date_before_cutoff_maps_to_previous_day(self):
        timezone = get_study_timezone()

        self.assertEqual(
            get_study_date(datetime(2026, 7, 17, 0, 0, tzinfo=timezone)),
            date(2026, 7, 16),
        )
        self.assertEqual(
            get_study_date(datetime(2026, 7, 17, 4, 59, tzinfo=timezone)),
            date(2026, 7, 16),
        )

    def test_get_study_date_at_or_after_cutoff_maps_to_same_day(self):
        timezone = get_study_timezone()

        self.assertEqual(
            get_study_date(datetime(2026, 7, 17, 5, 0, tzinfo=timezone)),
            date(2026, 7, 17),
        )
        self.assertEqual(
            get_study_date(datetime(2026, 7, 17, 5, 1, tzinfo=timezone)),
            date(2026, 7, 17),
        )

    def test_study_day_bounds_start_and_end_at_five_am(self):
        timezone = get_study_timezone()
        start, end = get_study_day_bounds(date(2026, 7, 16))

        self.assertEqual(start, datetime(2026, 7, 16, 5, 0, tzinfo=timezone))
        self.assertEqual(end, datetime(2026, 7, 17, 5, 0, tzinfo=timezone))

    def test_task_is_not_overdue_until_next_day_five_am_boundary(self):
        timezone = get_study_timezone()

        self.assertTrue(
            is_completed_within_deadline(
                "done",
                datetime(2026, 7, 17, 4, 59, tzinfo=timezone),
                date(2026, 7, 16),
            )
        )
        self.assertFalse(
            is_completed_within_deadline(
                "done",
                datetime(2026, 7, 17, 5, 0, tzinfo=timezone),
                date(2026, 7, 16),
            )
        )
