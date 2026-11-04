"""Initialize secrets once. Does not replace existing configuration."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
target = root / ".env"
if target.exists():
    print(".env уже существует и не изменён.")
else:
    password = secrets.token_urlsafe(18)
    content = (root / ".env.example").read_text(encoding="utf-8")
    content = content.replace("MEKORA_ADMIN_PASSWORD=", "MEKORA_ADMIN_PASSWORD=" + password)
    content = content.replace("MEKORA_SIMULATOR_KEY=", "MEKORA_SIMULATOR_KEY=" + secrets.token_urlsafe(32))
    content = content.replace("POSTGRES_PASSWORD=", "POSTGRES_PASSWORD=" + secrets.token_hex(24))
    with target.open("x", encoding="utf-8") as file:
        file.write(content)
    target.chmod(0o600)
    print("Создан .env с индивидуальными секретами.")
    print("Логин: admin. Пароль находится в MEKORA_ADMIN_PASSWORD внутри .env.")
    print("Не публикуйте .env и не отправляйте его в чат.")
