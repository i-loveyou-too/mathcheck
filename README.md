# Mathcheck

Mathcheck is a student math progress tracking app with a FastAPI backend and a Next.js frontend.

## Local backend

1. Move into the backend folder:
   `cd backend`
2. Create and activate a virtual environment.
3. Install packages:
   `pip install -r requirements.txt`
4. Create `backend/.env` from `backend/.env.example`.
5. Seed sample data if needed:
   `python seed.py`
6. Run the backend:
   `uvicorn main:app --reload`

Backend environment variables:

- `DATABASE_URL`
- `SECRET_KEY`
- `FRONTEND_ORIGINS`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`

## Local frontend

1. Move into the frontend folder:
   `cd frontend`
2. Install packages:
   `npm install`
3. Create `frontend/.env.local` from `frontend/.env.example` if needed.
4. Run the frontend:
   `npm run dev`

Frontend environment variables:

- `NEXT_PUBLIC_API_URL`

## Backend deployment

- Set `DATABASE_URL` for Postgres.
- Set `SECRET_KEY` to a long random value.
- Set `FRONTEND_ORIGINS` to a comma-separated list:
  `https://your-vercel-app.vercel.app,https://aimon.teamzsoft.com,http://localhost:3000`
- `FRONTEND_ORIGIN_REGEX` defaults to `https://.*\.vercel\.app` for Vercel deployments.
- Run FastAPI with PM2/uvicorn on the home server as usual.
- Public frontend traffic should call `http://aimon.teamzsoft.com:8002`.

## Vercel frontend deployment

- Root Directory: `frontend`
- Environment variable:
  `NEXT_PUBLIC_API_URL=http://aimon.teamzsoft.com:8002`
