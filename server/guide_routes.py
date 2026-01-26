from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from loguru import logger as _logger

from version import __version__ as APP_VERSION

logger = _logger.bind(ver=APP_VERSION)


def _get_guide_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "guide"  # type: ignore[attr-defined]
    return Path(__file__).resolve().parents[1] / "guide"


def register_guide_routes(app: FastAPI) -> None:
    guide_dir = _get_guide_dir()
    index_path = guide_dir / "index.html"
    inject_path = guide_dir / "inject.js"

    @app.get("/", include_in_schema=False)
    async def root():
        # 统一入口：优先跳引导页
        return RedirectResponse(url="/guide")

    @app.get("/guide", include_in_schema=False)
    async def guide_index():
        if not index_path.exists():
            logger.warning(f"[guide] missing: {index_path}")
        return FileResponse(str(index_path))

    @app.get("/inject.js", include_in_schema=False)
    async def guide_inject():
        if not inject_path.exists():
            logger.warning(f"[guide] missing: {inject_path}")
        return FileResponse(str(inject_path), media_type="application/javascript")

