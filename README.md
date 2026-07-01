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

- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`
- `FRONTEND_ORIGIN`

## Local frontend

1. Move into the frontend folder:
   `cd frontend`
2. Install packages:
   `npm install`
3. Create `frontend/.env.local` from `frontend/.env.example` if needed.
4. Run the frontend:
   `npm run dev`

Frontend environment variables:

- `NEXT_PUBLIC_API_BASE_URL`

## Render backend deployment

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Vercel frontend deployment

- Root Directory: `frontend`
- Environment variable:
  `NEXT_PUBLIC_API_BASE_URL=https://YOUR_RENDER_BACKEND_URL`
