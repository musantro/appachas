from contextlib import asynccontextmanager

from fastapi import FastAPI

from appachas.contexts.groups.shared.infrastructure.http import dependencies
from appachas.contexts.groups.shared.infrastructure.http.router import router
from appachas.contexts.groups.shared.infrastructure.http.security import (
    SecurityMiddleware,
    install_errors,
)
from appachas.infrastructure.bootstrap.container import Container


def create_app(container=None) -> FastAPI:
    container = container or Container()
    container.wire(modules=[dependencies])

    @asynccontextmanager
    async def lifespan(_app):
        pool = container.pool()
        pool.open()
        try:
            yield
        finally:
            pool.close()
            container.unwire()

    app = FastAPI(
        title="Appachas",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.container = container
    app.add_middleware(SecurityMiddleware, settings=container.settings())
    install_errors(app)
    app.include_router(router)
    return app


app = create_app()
