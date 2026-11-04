from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MEKORA_", env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./data/mekora.db"
    demo_enabled: bool = True
    simulator_key: str = ""
    cookie_secure: bool = False
    session_hours: int = 12
    stale_seconds: int = 30
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"


settings = Settings()
if settings.database_url.startswith("sqlite"):
    database = make_url(settings.database_url).database
    if database and database != ":memory:":
        Path(database).parent.mkdir(parents=True, exist_ok=True)
