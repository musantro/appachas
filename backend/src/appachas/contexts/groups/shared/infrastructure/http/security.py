import logging
import threading
import time
from collections import defaultdict, deque
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg import OperationalError
from psycopg_pool import PoolTimeout
from starlette.middleware.base import BaseHTTPMiddleware

from appachas.contexts.groups.shared.domain.errors import (
    BusinessError,
    Conflict,
    Forbidden,
    Unavailable,
)

logger = logging.getLogger("appachas")


def problem(status: int, code: str, detail: str, fields: dict | None = None):
    titles = {
        403: "Forbidden",
        404: "Not Found",
        409: "Conflict",
        413: "Content Too Large",
        422: "Unprocessable Content",
        429: "Too Many Requests",
        500: "Internal Server Error",
        503: "Service Unavailable",
    }
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content={
            "type": f"https://appachas.dev/problems/{code.replace('_', '-')}",
            "title": titles.get(status, "Error"),
            "status": status,
            "code": code,
            "detail": detail,
            "fields": fields or {},
        },
    )


def install_errors(app: FastAPI):
    @app.exception_handler(BusinessError)
    async def business_error(_request: Request, error: BusinessError):
        status = (
            409
            if isinstance(error, Conflict)
            else 403
            if isinstance(error, Forbidden)
            else 404
            if isinstance(error, Unavailable)
            else 422
        )
        return problem(status, error.code, error.detail, error.fields)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, error: RequestValidationError):
        fields = {str(e["loc"][-1]): "Revisa este campo." for e in error.errors()}
        return problem(422, "validation_error", "Revisa los campos indicados.", fields)

    @app.exception_handler(PoolTimeout)
    @app.exception_handler(OperationalError)
    async def database_error(_request: Request, _error: Exception):
        logger.error("database_unavailable")
        return problem(
            503, "service_unavailable", "El servicio no está disponible. Inténtalo de nuevo."
        )

    @app.exception_handler(Exception)
    async def unexpected_error(_request: Request, error: Exception):
        # Exception messages and SQL parameters may contain private data.
        logger.error("unexpected_error exception_type=%s", type(error).__name__)
        return problem(500, "unexpected_error", "Ha ocurrido un error. Inténtalo de nuevo.")


class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings):
        super().__init__(app)
        self.settings = settings
        self.events: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")
        if not origin and request.headers.get("referer"):
            referer = urlsplit(request.headers["referer"])
            origin = f"{referer.scheme}://{referer.netloc}"
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            allowed = set(self.settings.allowed_origins)
            allowed.add(str(request.base_url).rstrip("/"))
            host = request.headers.get("x-forwarded-host")
            if host:
                allowed.add(f"https://{host}")
            if request.url.hostname in ("127.0.0.1", "localhost", "testserver"):
                allowed.update(
                    f"http://{host}:{port}"
                    for host in ("127.0.0.1", "localhost")
                    for port in (5173, 4173, 8000)
                )
            if not origin or origin.rstrip("/") not in allowed:
                return problem(
                    403, "origin_forbidden", "El origen de la petición no está permitido."
                )
            length = request.headers.get("content-length", "0")
            if not length.isdigit() or int(length) > 65536:
                return problem(413, "payload_too_large", "La petición es demasiado grande.")
            # Reject chunked oversized payloads too; Starlette replays the cached body.
            if len(await request.body()) > 65536:
                return problem(413, "payload_too_large", "La petición es demasiado grande.")
        if request.url.path.startswith("/api/") and request.url.path not in (
            "/api/health",
            "/api/internal/expire",
        ):
            address = request.client.host if request.client else "unknown"
            bucket = "create" if request.url.path == "/api/groups" else "api"
            maximum = self.settings.creation_rate_limit if bucket == "create" else 1200
            key = f"{address}:{bucket}"
            now = time.monotonic()
            with self.lock:
                if len(self.events) > 10000:
                    self.events = defaultdict(
                        deque, {k: v for k, v in self.events.items() if v and v[-1] > now - 60}
                    )
                events = self.events[key]
                while events and events[0] <= now - 60:
                    events.popleft()
                if len(events) >= maximum:
                    return problem(429, "rate_limited", "Demasiadas peticiones. Espera un minuto.")
                events.append(now)
        try:
            response = await call_next(request)
        except Exception as error:
            # Contain unexpected failures before Starlette re-raises them to Uvicorn, whose
            # default traceback logging would expose exception messages and SQL parameters.
            logger.error("unexpected_error exception_type=%s", type(error).__name__)
            response = problem(500, "unexpected_error", "Ha ocurrido un error. Inténtalo de nuevo.")
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response
