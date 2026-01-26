#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenAI API 兼容的接口服务器（FastAPI 版本）

提供：
- POST `/v1/chat/completions`（支持 SSE stream=true）
- GET  `/v1/models`
- GET  `/health`
- GET  `/files/{task_id}`：通过 HTTP URL 下载生成结果文件
"""

from __future__ import annotations

import asyncio
import json
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple, Union

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from loguru import logger
from pydantic import BaseModel, Field

from version import __version__ as APP_VERSION
from version import get_version

# 统一给日志 record.extra 注入版本号，避免 main.py 的 `{extra[ver]}` 格式化 KeyError
logger = logger.bind(ver=APP_VERSION)

from server.guide_routes import register_guide_routes
from server.ws_routes import register_ws_routes

API_SERVER_PORT = 12346


class APIServerConfig:
    DEFAULT_PORT: int = API_SERVER_PORT
    DEFAULT_API_KEY: str = "han1234"

    MODEL_MAPPING: Dict[str, Dict[str, Any]] = {
        # Images
        "gemini-2.5-flash-image-landscape": {"task_type": "Create Image", "aspect_ratio": "16:9", "resolution": "1K", "max_images": 8},
        "gemini-2.5-flash-image-portrait": {"task_type": "Create Image", "aspect_ratio": "9:16", "resolution": "1K", "max_images": 8},
        "gemini-3.0-pro-image-landscape": {"task_type": "Create Image", "aspect_ratio": "16:9", "resolution": "1K", "max_images": 8},
        "gemini-3.0-pro-image-portrait": {"task_type": "Create Image", "aspect_ratio": "9:16", "resolution": "1K", "max_images": 8},
        "imagen-4.0-generate-preview-landscape": {"task_type": "Create Image", "aspect_ratio": "16:9", "resolution": "1K", "max_images": 8},
        "imagen-4.0-generate-preview-portrait": {"task_type": "Create Image", "aspect_ratio": "9:16", "resolution": "1K", "max_images": 8},
        # T2V
        "veo_3_1_t2v_fast_portrait": {"task_type": "Text to Video", "aspect_ratio": "9:16", "resolution": "720p", "max_images": 0},
        "veo_3_1_t2v_fast_landscape": {"task_type": "Text to Video", "aspect_ratio": "16:9", "resolution": "720p", "max_images": 0},
        "veo_2_1_fast_d_15_t2v_portrait": {"task_type": "Text to Video", "aspect_ratio": "9:16", "resolution": "720p", "max_images": 0},
        "veo_2_1_fast_d_15_t2v_landscape": {"task_type": "Text to Video", "aspect_ratio": "16:9", "resolution": "720p", "max_images": 0},
        "veo_2_0_t2v_portrait": {"task_type": "Text to Video", "aspect_ratio": "9:16", "resolution": "720p", "max_images": 0},
        "veo_2_0_t2v_landscape": {"task_type": "Text to Video", "aspect_ratio": "16:9", "resolution": "720p", "max_images": 0},
        # I2V
        "veo_3_1_i2v_s_fast_fl_portrait": {"task_type": "Frames to Video", "aspect_ratio": "9:16", "resolution": "720p", "max_images": 2},
        "veo_3_1_i2v_s_fast_fl_landscape": {"task_type": "Frames to Video", "aspect_ratio": "16:9", "resolution": "720p", "max_images": 2},
        "veo_2_1_fast_d_15_i2v_portrait": {"task_type": "Frames to Video", "aspect_ratio": "9:16", "resolution": "720p", "max_images": 2},
        "veo_2_1_fast_d_15_i2v_landscape": {"task_type": "Frames to Video", "aspect_ratio": "16:9", "resolution": "720p", "max_images": 2},
        "veo_2_0_i2v_portrait": {"task_type": "Frames to Video", "aspect_ratio": "9:16", "resolution": "720p", "max_images": 2},
        "veo_2_0_i2v_landscape": {"task_type": "Frames to Video", "aspect_ratio": "16:9", "resolution": "720p", "max_images": 2},
        # R2V
        "veo_3_0_r2v_fast_portrait": {"task_type": "Ingredients to Video", "aspect_ratio": "9:16", "resolution": "720p", "max_images": 3},
        "veo_3_0_r2v_fast_landscape": {"task_type": "Ingredients to Video", "aspect_ratio": "16:9", "resolution": "720p", "max_images": 3},
    }


class OpenAIError(BaseModel):
    message: str = Field(..., description="错误信息")
    type: str = Field(..., description="错误类型")
    param: Optional[str] = Field(None, description="参数名（如适用）")
    code: Optional[str] = Field(None, description="错误码（如适用）")


class OpenAIErrorResponse(BaseModel):
    error: OpenAIError = Field(..., description="OpenAI 风格错误对象")


class ModelsListItemMetadata(BaseModel):
    task_type: str = Field(..., description="内部任务类型")
    aspect_ratio: str = Field(..., description="画面比例")
    max_images: int = Field(..., description="最多支持的参考图片数量")


class ModelsListItem(BaseModel):
    id: str = Field(..., description="模型 ID")
    object: Literal["model"] = Field("model", description="固定值：model")
    created: int = Field(1677610602, description="兼容字段")
    owned_by: str = Field("veo3free", description="兼容字段")
    permission: List[Any] = Field(default_factory=list, description="兼容字段")
    root: str = Field(..., description="兼容字段")
    parent: Optional[str] = Field(None, description="兼容字段")
    metadata: ModelsListItemMetadata = Field(..., description="模型元信息")


class ModelsListResponse(BaseModel):
    object: Literal["list"] = Field("list", description="固定值：list")
    data: List[ModelsListItem] = Field(..., description="模型列表")


class HealthClients(BaseModel):
    total: int = Field(..., description="已连接客户端总数")
    busy: int = Field(..., description="忙碌中的客户端数")
    available: int = Field(..., description="可用客户端数")


class HealthResponse(BaseModel):
    status: Literal["ok"] = Field("ok", description="服务状态")
    version: str = Field(..., description="应用版本号")
    clients: HealthClients = Field(..., description="客户端状态")


class ImageURL(BaseModel):
    url: str = Field(..., description="图片 data URL（base64）")


class ContentText(BaseModel):
    type: Literal["text"] = Field("text", description="内容类型：text")
    text: str = Field(..., description="文本内容")


class ContentImageURL(BaseModel):
    type: Literal["image_url"] = Field("image_url", description="内容类型：image_url")
    image_url: ImageURL = Field(..., description="图片 URL 对象")


ContentItem = Union[ContentText, ContentImageURL]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"] = Field(..., description="消息角色")
    content: Union[str, List[ContentItem]] = Field(..., description="消息内容")


class ChatCompletionsRequest(BaseModel):
    model: str = Field("gemini-2.5-flash-image-landscape", description="模型 ID（GET /v1/models）")
    messages: List[ChatMessage] = Field(..., description="消息列表（取最后一条 user 解析 prompt）")
    stream: bool = Field(False, description="是否启用 SSE 流式响应")


class ChatCompletionMessage(BaseModel):
    role: Literal["assistant"] = Field("assistant", description="返回消息角色")
    content: str = Field(..., description="返回内容：markdown 图片链接或 video 标签（含 HTTP URL）")


class ChatCompletionChoice(BaseModel):
    index: int = Field(0, description="choice 下标")
    message: ChatCompletionMessage = Field(..., description="assistant 消息")
    finish_reason: Literal["stop"] = Field("stop", description="结束原因")


class Usage(BaseModel):
    prompt_tokens: int = Field(..., description="粗略估计")
    completion_tokens: int = Field(0, description="粗略估计")
    total_tokens: int = Field(..., description="粗略估计")


class ChatCompletionsResponse(BaseModel):
    id: str = Field(..., description="响应 ID")
    object: Literal["chat.completion"] = Field("chat.completion", description="固定值")
    created: int = Field(..., description="Unix 时间戳")
    model: str = Field(..., description="模型 ID")
    choices: List[ChatCompletionChoice] = Field(..., description="choices")
    usage: Usage = Field(..., description="usage")


class Delta(BaseModel):
    role: Optional[Literal["assistant"]] = Field(None, description="首包可能带 role")
    content: Optional[str] = Field(None, description="增量内容")


class ChatCompletionChunkChoice(BaseModel):
    index: int = Field(0, description="choice 下标")
    delta: Delta = Field(default_factory=Delta, description="增量对象")
    finish_reason: Optional[str] = Field(None, description="结束原因")


class ChatCompletionsChunk(BaseModel):
    id: str = Field(..., description="响应 ID")
    object: Literal["chat.completion.chunk"] = Field("chat.completion.chunk", description="固定值")
    created: int = Field(..., description="Unix 时间戳")
    model: str = Field(..., description="模型 ID")
    choices: List[ChatCompletionChunkChoice] = Field(..., description="chunk choices")


def _extract_prompt_and_images(messages: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
    prompt = ""
    images: List[str] = []
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            prompt = content
            break
        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                if item.get("type") == "text":
                    prompt = item.get("text", "") or prompt
                elif item.get("type") == "image_url":
                    image_url = item.get("image_url") or {}
                    url = image_url.get("url", "")
                    if isinstance(url, str) and url.startswith("data:"):
                        m = re.match(r"data:image/[^;]+;base64,(.+)", url)
                        if m:
                            images.append(m.group(1))
        break
    return prompt.strip(), images


def _make_file_url(request: Request, task_id: str) -> str:
    base = str(request.base_url).rstrip("/")
    return f"{base}/files/{task_id}"


def _to_openai_error(status_code: int, message: str, error_type: str) -> JSONResponse:
    payload = OpenAIErrorResponse(error=OpenAIError(message=message, type=error_type)).model_dump()
    return JSONResponse(status_code=status_code, content=payload)


async def _wait_for_task_done(task_manager: Any, task_id: str, timeout_seconds: int) -> Optional[Dict[str, Any]]:
    """等待任务完成（非流式用）"""
    start = time.time()
    while time.time() - start < timeout_seconds:
        for t in getattr(task_manager, "tasks", []):
            if t.get("id") == task_id and t.get("status") in ("已完成", "失败", "超时", "下载失败"):
                return t
        await asyncio.sleep(0.5)
    return None


def _get_task_by_id(task_manager: Any, task_id: str) -> Optional[Dict[str, Any]]:
    """根据 ID 获取任务"""
    for t in getattr(task_manager, "tasks", []):
        if t.get("id") == task_id:
            return t
    return None


def _build_markdown_result(request: Request, task: Dict[str, Any]) -> str:
    if task.get("status") != "已完成":
        detail = task.get("status_detail") or task.get("status") or "失败"
        return f"生成失败: {detail}"
    task_id = task.get("id", "")
    file_url = _make_file_url(request, task_id)
    ext = (task.get("file_ext") or ".png").lower()
    if ext in (".mp4", ".webm"):
        return f"<video src='{file_url}' controls></video>"
    return f"![Generated Image]({file_url})"


def create_app(
    task_manager: Any,
    output_dir_base: Path,
    api_key: str,
    api_instance: Any = None,
    task_timeout_seconds: int = 600,
    on_ready: Optional[Callable[[asyncio.AbstractEventLoop], None]] = None,
) -> FastAPI:
    app = FastAPI(
        title="Veo3Free OpenAI-Compatible API",
        description="OpenAI 兼容 API（FastAPI）",
        version=get_version(),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 使用 HTTPBearer 让 Swagger UI 显示 Authorize 按钮
    bearer_scheme = HTTPBearer(auto_error=False)

    def require_api_key(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> None:
        if not credentials or credentials.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid API key")
        if credentials.credentials != api_key:
            raise HTTPException(status_code=401, detail="Invalid API key")

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        if exc.status_code == 401:
            return _to_openai_error(401, "Invalid API key", "authentication_error")
        if exc.status_code == 404:
            return _to_openai_error(404, "Not found", "invalid_request_error")
        return _to_openai_error(exc.status_code, str(exc.detail), "invalid_request_error")

    @app.on_event("startup")
    async def _startup() -> None:
        if on_ready is not None:
            on_ready(asyncio.get_running_loop())

    # 合并原来的 12346 guide 静态服务（/guide, /inject.js）
    register_guide_routes(app)
    # 合并原来的 12343 WebSocket 服务（/ws）
    register_ws_routes(app, task_manager=task_manager, output_dir_base=output_dir_base)

    @app.get("/api-info", include_in_schema=False)
    async def api_info():
        """返回 API 配置信息（供文档页面使用）"""
        return {
            "api_key": api_key,
            "base_url": f"http://localhost:{API_SERVER_PORT}/v1",
            "docs_url": f"http://localhost:{API_SERVER_PORT}/docs",
        }

    @app.get("/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        total, busy = task_manager.get_client_count()
        return HealthResponse(
            status="ok",
            version=get_version(),
            clients=HealthClients(total=total, busy=busy, available=total - busy),
        )

    @app.get("/v1/models", response_model=ModelsListResponse, tags=["openai"], dependencies=[Depends(require_api_key)])
    async def list_models() -> ModelsListResponse:
        items: List[ModelsListItem] = []
        for name, cfg in APIServerConfig.MODEL_MAPPING.items():
            items.append(
                ModelsListItem(
                    id=name,
                    root=name,
                    metadata=ModelsListItemMetadata(
                        task_type=str(cfg["task_type"]),
                        aspect_ratio=str(cfg["aspect_ratio"]),
                        max_images=int(cfg["max_images"]),
                    ),
                )
            )
        return ModelsListResponse(data=items)

    @app.get("/files/{task_id}", tags=["files"])
    async def get_file(task_id: str, response: Response) -> FileResponse:
        task = None
        for t in getattr(task_manager, "tasks", []):
            if t.get("id") == task_id:
                task = t
                break
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

        saved_path = task.get("saved_path") or ""
        path = Path(saved_path)
        if not saved_path or not path.exists():
            raise HTTPException(status_code=404, detail=f"File for task {task_id} not found")

        response.headers["Cache-Control"] = "public, max-age=3600"
        return FileResponse(path=str(path))

    @app.post(
        "/v1/chat/completions",
        tags=["openai"],
        response_model=ChatCompletionsResponse,
        responses={401: {"model": OpenAIErrorResponse}, 400: {"model": OpenAIErrorResponse}, 503: {"model": OpenAIErrorResponse}},
        dependencies=[Depends(require_api_key)],
    )
    async def chat_completions(req: ChatCompletionsRequest, request: Request):
        model = req.model or "gemini-2.5-flash-image-landscape"
        if model not in APIServerConfig.MODEL_MAPPING:
            return _to_openai_error(400, f"Model '{model}' not supported. Use GET /v1/models.", "invalid_request_error")

        cfg = APIServerConfig.MODEL_MAPPING[model]
        prompt, images = _extract_prompt_and_images([m.model_dump() for m in req.messages])
        if not prompt:
            return _to_openai_error(400, "No text content found in messages", "invalid_request_error")

        max_images = int(cfg.get("max_images", 0))
        if max_images == 0 and images:
            return _to_openai_error(400, f"Model '{model}' does not support images", "invalid_request_error")
        if len(images) > max_images:
            return _to_openai_error(400, f"Model '{model}' supports at most {max_images} images, got {len(images)}", "invalid_request_error")

        total, _busy = task_manager.get_client_count()
        if total == 0:
            return _to_openai_error(503, "No browser clients connected.", "server_error")

        task = task_manager.add_task(
            prompt=prompt,
            task_type=cfg["task_type"],
            aspect_ratio=cfg["aspect_ratio"],
            resolution=cfg["resolution"],
            reference_images=images,
            output_dir=None,
        )
        if not task:
            return _to_openai_error(500, "Failed to create task", "server_error")

        task_id = task["id"]
        logger.info(f"[api][fastapi] created task: {task_id} | model={model}")

        # 尝试立即派发（失败则回队列）
        client_id, client_info = task_manager.get_idle_client()
        if client_info:
            task["status"] = "处理中"
            task["start_time"] = datetime.now().isoformat()
            task_manager.mark_client_busy(client_id, task_id)

            task_message = json.dumps(
                {
                    "type": "task",
                    "task_id": task_id,
                    "prompt": prompt,
                    "task_type": cfg["task_type"],
                    "aspect_ratio": cfg["aspect_ratio"],
                    "resolution": cfg["resolution"],
                    "reference_images": images,
                },
                ensure_ascii=False,
            )
            try:
                await client_info["ws"].send(task_message)
            except Exception:
                task["status"] = "等待中"
                task_manager.mark_client_idle(client_id)

        if (not task_manager.is_running) and api_instance is not None:
            api_instance.start_execution()

        if req.stream:
            async def gen():
                # 首包：发送 role
                first = ChatCompletionsChunk(
                    id=f"chatcmpl-{task_id}",
                    created=int(time.time()),
                    model=model,
                    choices=[ChatCompletionChunkChoice(index=0, delta=Delta(role="assistant", content=""), finish_reason=None)],
                )
                yield f"data: {json.dumps(first.model_dump(), ensure_ascii=False)}\n\n"

                # 轮询任务状态，实时推送进度
                start_time = time.time()
                last_progress = ""
                done_statuses = ("已完成", "失败", "超时", "下载失败")

                while time.time() - start_time < task_timeout_seconds:
                    task = _get_task_by_id(task_manager, task_id)
                    if not task:
                        break

                    # 检查是否完成
                    if task.get("status") in done_statuses:
                        # 发送最终结果
                        content_text = _build_markdown_result(request, task)
                        final = ChatCompletionsChunk(
                            id=f"chatcmpl-{task_id}",
                            created=int(time.time()),
                            model=model,
                            choices=[ChatCompletionChunkChoice(index=0, delta=Delta(content=content_text), finish_reason="stop")],
                        )
                        yield f"data: {json.dumps(final.model_dump(), ensure_ascii=False)}\n\n"
                        yield "data: [DONE]\n\n"
                        return

                    # 推送进度更新（仅当进度变化时）
                    current_progress = task.get("status_detail", "") or task.get("status", "")
                    if current_progress and current_progress != last_progress:
                        progress_chunk = ChatCompletionsChunk(
                            id=f"chatcmpl-{task_id}",
                            created=int(time.time()),
                            model=model,
                            choices=[ChatCompletionChunkChoice(index=0, delta=Delta(content=f"[{current_progress}]\n"), finish_reason=None)],
                        )
                        yield f"data: {json.dumps(progress_chunk.model_dump(), ensure_ascii=False)}\n\n"
                        last_progress = current_progress

                    await asyncio.sleep(0.5)

                # 超时
                err = ChatCompletionsChunk(
                    id=f"chatcmpl-{task_id}",
                    created=int(time.time()),
                    model=model,
                    choices=[ChatCompletionChunkChoice(index=0, delta=Delta(content="任务超时"), finish_reason="stop")],
                )
                yield f"data: {json.dumps(err.model_dump(), ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(gen(), media_type="text/event-stream")

        done_task = await _wait_for_task_done(task_manager, task_id, task_timeout_seconds)
        if not done_task:
            return _to_openai_error(504, f"Task timeout after {task_timeout_seconds} seconds", "server_error")

        content_text = _build_markdown_result(request, done_task)
        resp = ChatCompletionsResponse(
            id=f"chatcmpl-{task_id}",
            created=int(time.time()),
            model=model,
            choices=[ChatCompletionChoice(index=0, message=ChatCompletionMessage(role="assistant", content=content_text), finish_reason="stop")],
            usage=Usage(prompt_tokens=len(prompt), completion_tokens=0, total_tokens=len(prompt)),
        )
        return JSONResponse(content=resp.model_dump())

    return app


class OpenAIAPICompatServer:
    """OpenAI API 兼容服务器（FastAPI + Uvicorn）"""

    def __init__(
        self,
        task_manager: Any,
        output_dir: Path,
        port: int = APIServerConfig.DEFAULT_PORT,
        api_key: str = APIServerConfig.DEFAULT_API_KEY,
        api_instance: Any = None,
    ):
        self.task_manager = task_manager
        self.output_dir = output_dir
        self.port = port
        self.api_key = api_key
        self.api_instance = api_instance
        self._thread: Optional[threading.Thread] = None
        self._server: Any = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self._ready = threading.Event()

    def start(self) -> bool:
        try:
            import uvicorn

            def on_ready(loop: asyncio.AbstractEventLoop) -> None:
                self.loop = loop
                self._ready.set()

            app = create_app(
                task_manager=self.task_manager,
                output_dir_base=self.output_dir,
                api_key=self.api_key,
                api_instance=self.api_instance,
                task_timeout_seconds=600,
                on_ready=on_ready,
            )

            config = uvicorn.Config(
                app=app,
                host="0.0.0.0",
                port=self.port,
                log_level="warning",
                access_log=False,
            )
            self._server = uvicorn.Server(config)

            def run():
                self._server.run()

            self._thread = threading.Thread(target=run, daemon=True)
            self._thread.start()
            logger.info(f"[api][fastapi] listening on http://localhost:{self.port} docs=/docs openapi=/openapi.json")
            return True
        except Exception as e:
            logger.error(f"[api][fastapi] start failed: {e}")
            return False

    def wait_ready(self, timeout_seconds: float = 5.0) -> bool:
        return self._ready.wait(timeout=timeout_seconds)

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

