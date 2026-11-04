"""Create the initial administrator once; migrations must have run first."""
import argparse
import getpass
import os
from sqlalchemy import select
from app.database import SessionLocal
from app.models import User
from app.security import passwords


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default="admin")
    args = parser.parse_args()
    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)):
            print("Пользователи уже созданы. Пароли не изменены.")
            return
        password = os.environ.get("MEKORA_ADMIN_PASSWORD") or getpass.getpass("Пароль администратора (минимум 12 символов): ")
        if len(password) < 12:
            raise SystemExit("Пароль должен содержать минимум 12 символов")
        db.add(User(username=args.username, password_hash=passwords.hash(password), role="admin"))
        db.commit()
        print("Администратор создан: " + args.username)


if __name__ == "__main__":
    main()
