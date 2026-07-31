# Handoff

## Summary

- Curriculum-related admin and student flows were expanded across both backend and frontend.
- Lecture assignment update behavior and related API/schema logic were updated.
- A new `frontend/components/curriculum-graph.tsx` component was added for curriculum graph UI work.

## Changed Areas

- `backend/crud.py`
  - Extended curriculum and lecture-assignment related CRUD logic.
- `backend/main.py`
  - Updated API routes tied to curriculum and lecture assignment flows.
- `backend/models.py`
  - Added a model-level field/update needed by the new flow.
- `backend/schemas.py`
  - Added and expanded request/response schemas.
- `backend/test_lecture_assignment_update.py`
  - Updated backend coverage for lecture assignment updates.
- `frontend/app/admin/curriculums/page.tsx`
  - Large admin curriculum page update.
- `frontend/app/admin/daily-tasks/page.tsx`
  - Daily task admin behavior adjusted to match curriculum changes.
- `frontend/app/admin/lecture-assignments/[assignmentId]/page.tsx`
  - Lecture assignment detail/update UI adjusted.
- `frontend/app/admin/textbooks-management/page.tsx`
  - Textbook management flow updated.
- `frontend/app/student/curriculum/page.tsx`
  - Student curriculum page refactored to use the updated UI/data flow.
- `frontend/components/curriculum-graph.tsx`
  - New shared curriculum graph component.

## Git Status Notes

- `.claude/settings.local.json` is intentionally left out of the commit because it looks like local tool settings.
- `frontend/tsconfig.tsbuildinfo` is currently modified and included with the rest of the working tree changes.

## Suggested Next Checks

- Run backend tests around lecture assignment update behavior.
- Run frontend build or type-check once to verify the curriculum pages after the large refactor.
- If `.claude/` should be shared for the team, review it separately before committing.
