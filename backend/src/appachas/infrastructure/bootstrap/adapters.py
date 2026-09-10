import hashlib
import os
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo


def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class SecureTokens:
    def generate(self) -> tuple[str, str]:
        raw = secrets.token_urlsafe(32)
        return raw, token_hash(raw)

    def identifier(self) -> str:
        return str(uuid4())


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)

    def today(self, timezone: str):
        return self.now().astimezone(ZoneInfo(timezone)).date()


@dataclass(frozen=True)
class Settings:
    database_url: str
    cron_secret: str
    cookie_secure: bool
    allowed_origins: tuple[str, ...]
    creation_rate_limit: int = 60

    @classmethod
    def from_env(cls):
        return cls(
            os.environ.get(
                "DATABASE_URL", "postgresql://appachas:appachas@127.0.0.1:54322/appachas"
            ),
            os.environ.get("CRON_SECRET", ""),
            os.environ.get("COOKIE_SECURE", "").lower() in ("true", "1")
            or bool(os.environ.get("VERCEL")),
            tuple(
                origin.rstrip("/")
                for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
                if origin
            ),
            1000 if os.environ.get("APP_ENV") == "test" else 60,
        )
