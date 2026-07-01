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

- Set `NEXT_PUBLIC_API_URL=https://api.aimon.teamzsoft.com` in Vercel.
- API requests are sent through the shared `apiFetch` helper.
- Student login uses `/auth/student-login` with `{ phone }`.
- Admin login uses `/auth/admin-login` with `{ username, password }`.
