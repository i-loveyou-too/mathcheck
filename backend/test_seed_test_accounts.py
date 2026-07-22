from unittest import TestCase

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
import seed_test_accounts
from database import Base


def make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


class SeedTestAccountsTests(TestCase):
    def setUp(self):
        self.engine, self.db = make_db()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_seed_creates_expected_accounts_idempotently(self):
        seed_test_accounts.upsert_test_admin(self.db)
        for student in seed_test_accounts.TEST_STUDENTS:
            seed_test_accounts.upsert_test_student(self.db, student)
        self.db.commit()

        seed_test_accounts.upsert_test_admin(self.db)
        for student in seed_test_accounts.TEST_STUDENTS:
            seed_test_accounts.upsert_test_student(self.db, student)
        self.db.commit()

        admins = self.db.query(models.Admin).filter_by(username="testadmin").all()
        students = self.db.query(models.Student).filter(
            models.Student.phone.in_(["01011111111", "01022222222"])
        ).all()

        self.assertEqual(len(admins), 1)
        self.assertEqual(admins[0].password, "testadmin")
        self.assertEqual(len(students), 2)
        self.assertEqual({student.name for student in students}, {"teststudent1", "teststudent2"})
        self.assertTrue(all(student.grade == "고3" for student in students))
