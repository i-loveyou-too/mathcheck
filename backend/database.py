import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import declarative_base, sessionmaker


ENV_PATH = Path(__file__).resolve().with_name(".env")
load_dotenv(dotenv_path=ENV_PATH)


def read_env(name: str, default: str = "") -> str:
    value = os.getenv(name, default)
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    return str(value).strip()


def build_database_url() -> URL:
    db_name = read_env("DB_NAME", "mathcheck")
    db_user = read_env("DB_USER", "postgres")
    db_password = read_env("DB_PASSWORD", "") or None
    db_host = read_env("DB_HOST", "localhost")
    db_port_raw = read_env("DB_PORT", "5432")

    try:
        db_port = int(db_port_raw)
    except ValueError:
        db_port = 5432

    return URL.create(
        drivername="postgresql+psycopg2",
        username=db_user,
        password=db_password,
        host=db_host,
        port=db_port,
        database=db_name,
    )


DATABASE_URL = build_database_url()

engine = create_engine(
    DATABASE_URL,
    echo=False,
    client_encoding="utf8",
    connect_args={"options": "-c client_encoding=utf8"},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
