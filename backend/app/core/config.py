"""Core configuration and settings."""

import os
import sys
from pathlib import Path

ROOT_DIR = Path(sys.executable).absolute().parent.parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = ROOT_DIR / "data"
TEMPLATES_DIR = DATA_DIR / "templates"
RECORDINGS_DIR = DATA_DIR / "recordings"
PROFILES_DIR = DATA_DIR / "profiles"

# Ensure directories exist
for d in [DATA_DIR, TEMPLATES_DIR, RECORDINGS_DIR, PROFILES_DIR]:
    d.mkdir(parents=True, exist_ok=True)

class Settings:
    ROOT_DIR: Path = ROOT_DIR
    PROJECT_NAME: str = "Isometric Auto Studio"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    DB_URL: str = f"sqlite:///{DATA_DIR / 'studio.db'}"
    DEFAULT_ADB_PATH: str = str(ROOT_DIR / "platform-tools" / "adb.exe")
    FRONTEND_DIST: Path = Path(os.environ.get("STUDIO_FRONTEND_DIST", str(ROOT_DIR / "frontend" / "dist")))

settings = Settings()
