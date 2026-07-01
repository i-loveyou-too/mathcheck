from database import SessionLocal
import models  # noqa: F401

NEW_ADMIN_PASSWORD = "tjstodsla"

STUDENTS = [
    {"name": "김수아", "phone": "01034363809"},
    {"name": "김주리", "phone": "01058837264"},
    {"name": "장경은", "phone": "01025366155"},
    {"name": "상승수학", "phone": "01099998888"},
]


def run():
    db = SessionLocal()
    try:
        # --- Admin: update all existing admins; create one if none exist ---
        admins = db.query(models.Admin).all()
        if admins:
            for admin in admins:
                admin.password = NEW_ADMIN_PASSWORD
            print(f"Admin updated: {[a.username for a in admins]}")
        else:
            db.add(models.Admin(username="admin", password=NEW_ADMIN_PASSWORD))
            print("Admin created: admin")

        # --- Students: upsert by phone ---
        created, updated, unchanged = [], [], []
        for s in STUDENTS:
            student = (
                db.query(models.Student)
                .filter(models.Student.phone == s["phone"])
                .first()
            )
            if student is None:
                db.add(models.Student(name=s["name"], phone=s["phone"], grade="고3"))
                created.append(f"{s['name']} ({s['phone']})")
            elif student.name != s["name"]:
                student.name = s["name"]
                updated.append(f"{s['name']} ({s['phone']})")
            else:
                unchanged.append(f"{s['name']} ({s['phone']})")

        db.commit()

        if created:
            print(f"Students created: {', '.join(created)}")
        if updated:
            print(f"Students name-updated: {', '.join(updated)}")
        if unchanged:
            print(f"Students unchanged: {', '.join(unchanged)}")

    finally:
        db.close()


if __name__ == "__main__":
    run()
