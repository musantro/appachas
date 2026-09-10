import hashlib
import os
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlsplit
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
    migration_source_origin: str = "https://appachas.vercel.app"
    migration_target_origin: str = "https://appachas.es"
    app_env: str = "production"

    def __post_init__(self):
        origins = (self.migration_source_origin, self.migration_target_origin)
        parsed = [urlsplit(origin) for origin in origins]
        for origin, parts in zip(origins, parsed, strict=True):
            allowed_scheme = parts.scheme == "https" or (
                parts.scheme == "http"
                and parts.hostname in ("localhost", "127.0.0.1")
                and self.app_env in ("test", "development")
            )
            if (
                not allowed_scheme
                or not parts.hostname
                or parts.username is not None
                or parts.password is not None
                or parts.path
                or parts.query
                or parts.fragment
                or origin != f"{parts.scheme}://{parts.netloc}"
            ):
                raise ValueError("Invalid session migration origin configuration")
        if parsed[0].hostname == parsed[1].hostname:
            raise ValueError("Session migration requires distinct cookie hosts")

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
            os.environ.get("MIGRATION_SOURCE_ORIGIN", "https://appachas.vercel.app"),
            os.environ.get("MIGRATION_TARGET_ORIGIN", "https://appachas.es"),
            os.environ.get("APP_ENV", "production" if os.environ.get("VERCEL") else "development"),
        )
