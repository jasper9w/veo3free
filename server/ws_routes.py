from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from loguru import logger as _logger
from PIL import Image

from version import __version__ as APP_VERSION

logger = _logger.bind(ver=APP_VERSION)


class _ClientWS:
    """适配 TaskManager 期望的 `ws.send(str)` 接口。"""

    def __init__(self, websocket: WebSocket):
        self._ws = websocket

    async def send(self, message: str) -> None:
        await self._ws.send_text(message)


def _generate_thumbnail_base64(image_path: Path, size: Tuple[int, int] = (200, 200)) -> str:
    import base64
    import io

    img = Image.open(str(image_path))
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    img.thumbnail(size, Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=85, optimize=True)
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


async def _save_base64_file(base64_data: str, filename: str, output_dir: Path) -> Optional[Path]:
    import base64

    output_dir.mkdir(parents=True, exist_ok=True)
    filepath = output_dir / filename
    try:
        raw = base64.b64decode(base64_data)
        filepath.write_bytes(raw)
        return filepath.absolute()
    except Exception as e:
        logger.error(f"[ws] save file failed: {e}")
        return None


async def _handle_image_result(task_manager: Any, output_dir_base: Path, client_id: str, task_id: str, base64_data: str) -> None:
    for task in getattr(task_manager, "tasks", []):
        if task.get("id") != task_id:
            continue

        output_dir = task.get("output_dir")
        if output_dir:
            p = Path(output_dir)
            if not p.is_absolute():
                p = output_dir_base / output_dir
        else:
            p = output_dir_base
        p.mkdir(parents=True, exist_ok=True)

        file_ext = task.get("file_ext", ".png")

        if task.get("import_row_number"):
            filename = f"{task['import_row_number']}{file_ext}"
            filepath = p / filename
        else:
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            filename = f"{timestamp}{file_ext}"
            filepath = p / filename
            counter = 1
            while filepath.exists():
                filename = f"{timestamp}_{counter}{file_ext}"
                filepath = p / filename
                counter += 1

        saved = await _save_base64_file(base64_data, filename, p)
        if saved:
            task["status"] = "已完成"
            task["end_time"] = datetime.now().isoformat()
            task["saved_path"] = str(saved)
            task["output_dir_path"] = str(p)
            if (task.get("file_ext") or "").lower() in (".png", ".jpg"):
                try:
                    task["preview_base64"] = _generate_thumbnail_base64(saved, size=(200, 200))
                except Exception:
                    task["preview_base64"] = ""
            logger.info(f"[ws] task done: {task_id} -> {saved}")
        else:
            task["status"] = "下载失败"
            task["end_time"] = datetime.now().isoformat()
            logger.error(f"[ws] task save failed: {task_id}")

        task_manager.mark_client_idle(client_id)
        return

    # 未找到任务也要释放客户端
    task_manager.mark_client_idle(client_id)


def register_ws_routes(app: FastAPI, task_manager: Any, output_dir_base: Path) -> None:
    chunk_buffer: Dict[str, Dict[int, str]] = {}

    @app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket):
        client_id: Optional[str] = None
        page_number: Optional[int] = None

        await websocket.accept()
        ws_adapter = _ClientWS(websocket)

        try:
            first_msg = await websocket.receive_text()
            data = json.loads(first_msg)
            if data.get("type") != "register":
                logger.warning("[ws] first message is not register, closing")
                return

            page_url = data.get("page_url", "unknown")
            client_id, page_number = task_manager.register_client(ws_adapter, page_url)
            total, _busy = task_manager.get_client_count()
            logger.info(f"[ws] client registered: {client_id} (page#{page_number}) total={total}")

            await websocket.send_text(json.dumps({"type": "register_success", "client_id": client_id}, ensure_ascii=False))

            while True:
                message = await websocket.receive_text()
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "image_chunk":
                    task_id = data.get("task_id")
                    chunk_index = int(data.get("chunk_index", 0))
                    total_chunks = int(data.get("total_chunks", 0))
                    chunk_data = data.get("data") or ""

                    if not task_id:
                        continue
                    if task_id not in chunk_buffer:
                        chunk_buffer[task_id] = {}
                    chunk_buffer[task_id][chunk_index] = chunk_data
                    logger.info(f"[ws] [#{page_number}] chunk {chunk_index + 1}/{total_chunks}")

                    if total_chunks > 0 and len(chunk_buffer[task_id]) == total_chunks:
                        full_base64 = "".join(chunk_buffer[task_id][i] for i in range(total_chunks))
                        del chunk_buffer[task_id]
                        logger.info(f"[ws] [#{page_number}] chunk merge done, size={len(full_base64) // 1024}KB")
                        await _handle_image_result(task_manager, output_dir_base, client_id, task_id, full_base64)  # type: ignore[arg-type]

                elif msg_type == "image_data":
                    task_id = data.get("task_id")
                    image_data = data.get("data") or ""
                    if not task_id:
                        continue
                    logger.info(f"[ws] [#{page_number}] image size={len(image_data) // 1024}KB")
                    await _handle_image_result(task_manager, output_dir_base, client_id, task_id, image_data)  # type: ignore[arg-type]

                elif msg_type == "result":
                    task_id = data.get("task_id")
                    error = data.get("error")
                    if error and task_id:
                        logger.info(f"[ws] [#{page_number}] task failed: {error}")
                        for task in getattr(task_manager, "tasks", []):
                            if task.get("id") == task_id:
                                task["status"] = "失败"
                                task["status_detail"] = error
                                task["end_time"] = datetime.now().isoformat()
                                break
                    if client_id:
                        task_manager.mark_client_idle(client_id)

                elif msg_type == "status":
                    status_msg = data.get("message", "") or ""
                    logger.info(f"[ws] [#{page_number}] status: {status_msg}")
                    if client_id:
                        task_id = task_manager.clients.get(client_id, {}).get("task_id")
                        if task_id:
                            task_manager.update_task_status_detail(task_id, status_msg)

        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"[ws] connection error: {e}")
        finally:
            if client_id:
                task_manager.remove_client(client_id)
                total, _busy = task_manager.get_client_count()
                logger.info(f"[ws] client disconnected: {client_id} (page#{page_number}) total={total}")

