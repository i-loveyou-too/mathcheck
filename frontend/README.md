# Frontend

Next.js App Router frontend for the math progress tracking app.

## Run

1. Install packages:
   `npm install`
2. Start the frontend:
   `npm run dev`
3. Open:
   `http://localhost:3000`

## Notes

- The frontend calls the FastAPI backend at `http://127.0.0.1:8000`.
- Student login uses `/auth/student-login` with `{ phone }`.
- Admin login uses `/auth/admin-login` with `{ username, password }`.
