# Backend

Simple FastAPI backend for the student math progress app.

## Setup

1. Create a virtual environment.
2. Install dependencies with `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and update the `DB_*` settings.
4. Seed the database with `python seed.py`.
5. Run the server with `uvicorn main:app --reload`.

## API

- `GET /` returns a basic health message.
- FastAPI docs are available at `http://localhost:8000/docs`.
