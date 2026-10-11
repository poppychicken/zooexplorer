"""Application configuration.

Two sources, in precedence order:

  1. Environment variables — what the platform actually uses. The chart's
     ExternalSecret injects MONGODB_URI / MONGODB_DATABASE on every pod
     start, so a deployed pod needs no config file at all.
  2. ``config.yaml`` — local dev, plus anything mounted at
     /etc/app/config.yaml.

Identity settings are deliberately absent: the caller's identity arrives
per request as SSO headers injected by the gateway (see app/api/me.py).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ — the directory the app is imported from.
BASE_DIR = Path(__file__).resolve().parents[2]

# Searched in order when CONFIG_PATH is unset. First hit wins.
CONFIG_CANDIDATES = (
    Path("/etc/app/config.yaml"),
    Path.cwd() / "config.yaml",
    BASE_DIR / "config.yaml",
    BASE_DIR.parent / "config.yaml",
)

# env var -> (yaml section, key)
ENV_OVERRIDES = {
    "MONGODB_URI": ("mongodb", "uri"),
    "MONGODB_DATABASE": ("mongodb", "database"),
    "APP_URL": ("app", "url"),
    "LOG_LEVEL": ("logging", "level"),
}


class AppConfig(BaseModel):
    url: str = "http://localhost:8080"


class MongoDBConfig(BaseModel):
    uri: str = "mongodb://localhost:27017"
    database: str = "app_db"


class LoggingConfig(BaseModel):
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


class Settings(BaseSettings):
    app: AppConfig = AppConfig()
    mongodb: MongoDBConfig = MongoDBConfig()
    logging: LoggingConfig = LoggingConfig()

    api_title: str = "{{PROJECT_NAME}} API"
    api_prefix: str = "/api"

    # Built SPA served by this process (see app/main.py). Absent in local
    # dev, where Vite serves the frontend and proxies /api here.
    static_dir: Path = BASE_DIR / "static"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @classmethod
    def load(cls, config_path: str | None = None) -> "Settings":
        raw = _read_yaml(config_path)

        for env_var, (section, key) in ENV_OVERRIDES.items():
            value = os.environ.get(env_var)
            if value:
                raw.setdefault(section, {})[key] = value

        return cls(**raw)


def _read_yaml(config_path: str | None) -> dict[str, Any]:
    paths = (Path(config_path),) if config_path else CONFIG_CANDIDATES
    for path in paths:
        if path.is_file():
            return yaml.safe_load(path.read_text()) or {}
    return {}


settings = Settings.load(os.environ.get("CONFIG_PATH"))
