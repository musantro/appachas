"""Vercel entrypoint; composition and application code live in the backend package."""

from appachas.main import app

__all__ = ["app"]
