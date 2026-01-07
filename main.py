#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Veo3Free - AI生成工具 PyWebview + React 版本
"""

import asyncio
import json
import os
import sys
import base64
import io
import subprocess
import platform
import threading
from datetime import datetime
from pathlib import Path

# Windows 下设置输出编码为 UTF-8
if sys.platform == 'win32':
    if sys.stdout is not None and hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    if sys.stderr is not None and hasattr(sys.stderr, 'buffer'):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from PIL import Image

try:
    from loguru import logger
except ImportError:
    print("请安装 loguru: pip install loguru")
    sys.exit(1)

try:
    from openpyxl import Workbook, load_workbook
except ImportError:
    print("请安装 openpyxl: pip install openpyxl")
    Workbook = None
    load_workbook = None

try:
    from websockets.server import serve
except ImportError:
    print("请安装 websockets: pip install websockets")
    sys.exit(1)

try:
    import webview
except ImportError:
    print("请安装 pywebview: pip install pywebview")
    sys.exit(1)

# 确定输出目录位置
if getattr(sys, 'frozen', False):
    # 打包后，使用用户文档目录
    OUTPUT_DIR = Path.home() / "Documents" / "veo3free" / "output"
else:
    # 开发模式，使用项目目录
    OUTPUT_DIR = Path("output")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 配置loguru日志
LOGS_DIR = OUTPUT_DIR.parent / "logs" if getattr(sys, 'frozen', False) else Path("logs")
LOGS_DIR.mkdir(parents=True, exist_ok=True)

logger.remove()
logger.add(
    lambda msg: print(msg, end=""),
    format="{time:HH:mm:ss} | {message}",
    level="INFO"
)
log_file = LOGS_DIR / "veo3free.log"
logger.add(
    log_file,
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}",
    rotation="10 MB",
    retention="7 days"
)


class TaskManager:
    """任务管理器"""

    TASK_TIMEOUT_SECONDS = 600  # 任务超时时间：10分钟
    CLIENT_COOLDOWN_SECONDS = 3  # 客户端冷却时间：3秒

    def __init__(self):
        self.tasks = []
        self.current_index = 0
        self.is_running = False
        self.clients = {}
        self.next_page_number = 1

    def register_client(self, websocket, page_url):
        import time
        for cid, info in list(self.clients.items()):
            if info['url'] == page_url:
                del self.clients[cid]

        client_id = f"c{len(self.clients)}_{int(time.time()) % 10000}"
        page_number = self.next_page_number
        self.next_page_number += 1
        self.clients[client_id] = {
            'ws': websocket,
            'url': page_url,
            'busy': False,
            'task_id': None,
            'page_number': page_number,
            'last_task_end': None
        }
        return client_id, page_number

    def remove_client(self, client_id):
        if client_id in self.clients:
            task_id = self.clients[client_id]['task_id']
            if task_id:
                for task in self.tasks:
                    if task['id'] == task_id and task['status'] == '处理中':
                        task['status'] = '等待中'
            del self.clients[client_id]

    def get_idle_client(self):
        now = datetime.now()
        for cid, info in self.clients.items():
            if not info['busy']:
                # 检查冷却时间
                last_end = info.get('last_task_end')
                if last_end:
                    elapsed = (now - datetime.fromisoformat(last_end)).total_seconds()
                    if elapsed < self.CLIENT_COOLDOWN_SECONDS:
                        continue  # 还在冷却中，跳过这个客户端
                return cid, info
        return None, None

    def mark_client_busy(self, client_id, task_id):
        if client_id in self.clients:
            self.clients[client_id]['busy'] = True
            self.clients[client_id]['task_id'] = task_id
            for task in self.tasks:
                if task['id'] == task_id:
                    task['client_id'] = client_id
                    break

    def mark_client_idle(self, client_id):
        if client_id in self.clients:
            self.clients[client_id]['busy'] = False
            self.clients[client_id]['task_id'] = None
            self.clients[client_id]['last_task_end'] = datetime.now().isoformat()

    def get_client_count(self):
        total = len(self.clients)
        busy = sum(1 for c in self.clients.values() if c['busy'])
        return total, busy

    def update_task_status_detail(self, task_id, status_detail):
        for task in self.tasks:
            if task['id'] == task_id:
                task['status_detail'] = status_detail
                return True
        return False

    def add_task(self, prompt, task_type, aspect_ratio, resolution,
                 reference_images=None, output_dir=None):
        prompt = prompt.strip()
        if not prompt:
            return None

        if task_type == "Text to Video":
            reference_images = []

        task_id = f"task_{len(self.tasks)}_{datetime.now().strftime('%H%M%S%f')}"
        file_ext = ".mp4" if "Video" in task_type else ".png"

        task = {
            'id': task_id,
            'prompt': prompt,
            'status': '等待中',
            'status_detail': '',
            'file_ext': file_ext,
            'output_dir': output_dir,
            'client_id': None,
            'task_type': task_type,
            'aspect_ratio': aspect_ratio,
            'resolution': resolution,
            'reference_images': reference_images or [],
            'start_time': None,
            'end_time': None
        }
        self.tasks.append(task)
        return task

    def get_next_task(self):
        while self.current_index < len(self.tasks):
            task = self.tasks[self.current_index]
            if task['status'] == '等待中':
                return task
            self.current_index += 1
        return None

    def check_timeout_tasks(self):
        """检查并处理超时任务，返回超时的任务列表"""
        timeout_tasks = []
        now = datetime.now()
        for task in self.tasks:
            if task['status'] == '处理中' and task.get('start_time'):
                start = datetime.fromisoformat(task['start_time'])
                elapsed = (now - start).total_seconds()
                if elapsed > self.TASK_TIMEOUT_SECONDS:
                    task['status'] = '超时'
                    task['end_time'] = now.isoformat()
                    task['status_detail'] = f'任务超时（超过{self.TASK_TIMEOUT_SECONDS // 60}分钟）'
                    # 释放对应客户端
                    client_id = task.get('client_id')
                    if client_id and client_id in self.clients:
                        self.clients[client_id]['busy'] = False
                        self.clients[client_id]['task_id'] = None
                    timeout_tasks.append(task)
        return timeout_tasks


class ImageProcessor:
    @staticmethod
    def compress_image_to_base64(image_path, max_size_bytes=1024 * 1024):
        try:
            img = Image.open(image_path)
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            quality = 95
            while quality > 5:
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=quality, optimize=True)
                size = buffer.tell()
                if size <= max_size_bytes:
                    buffer.seek(0)
                    return base64.b64encode(buffer.getvalue()).decode('utf-8')
                quality -= 5

            scale = 0.9
            while scale > 0.1:
                new_size = (int(img.size[0] * scale), int(img.size[1] * scale))
                resized_img = img.resize(new_size, Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                resized_img.save(buffer, format='JPEG', quality=85, optimize=True)
                size = buffer.tell()
                if size <= max_size_bytes:
                    buffer.seek(0)
                    return base64.b64encode(buffer.getvalue()).decode('utf-8')
                scale -= 0.1

            buffer.seek(0)
            return base64.b64encode(buffer.getvalue()).decode('utf-8')
        except Exception as e:
            logger.error(f"压缩图片失败: {e}")
            return None

    @staticmethod
    def generate_thumbnail(image_path, size=(200, 200)):
        """生成缩略图，返回 base64"""
        try:
            img = Image.open(image_path)
            # 转换为 RGB（处理 RGBA 等）
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # 生成缩略图
            img.thumbnail(size, Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85, optimize=True)
            buffer.seek(0)
            return base64.b64encode(buffer.read()).decode('utf-8')
        except Exception as e:
            logger.error(f"生成缩略图失败: {e}")
            return None


class ImageDownloader:
    @staticmethod
    async def save_base64_image(base64_data, filename, output_dir=None):
        if output_dir is None:
            output_dir = OUTPUT_DIR
        filepath = Path(output_dir) / filename
        try:
            image_data = base64.b64decode(base64_data)
            with open(filepath, 'wb') as f:
                f.write(image_data)
            # 返回绝对路径
            return filepath.absolute()
        except Exception as e:
            logger.error(f"保存图片失败: {e}")
            return None


class WebSocketServer:
    def __init__(self, task_manager):
        self.task_manager = task_manager
        self.server = None
        self.chunk_buffer = {}

    def log(self, message):
        logger.info(message)

    async def handler(self, websocket):
        client_id = None
        page_number = None
        try:
            first_msg = await websocket.recv()
            data = json.loads(first_msg)

            if data.get('type') != 'register':
                self.log(f"⚠️ 首条消息不是注册消息，断开连接")
                return

            page_url = data.get('page_url', 'unknown')
            client_id, page_number = self.task_manager.register_client(websocket, page_url)
            total, busy = self.task_manager.get_client_count()
            self.log(f"✅ 客户端注册: {client_id} (页面#{page_number})，当前连接数: {total}")

            await websocket.send(json.dumps({
                'type': 'register_success',
                'client_id': client_id
            }))

            async for message in websocket:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "image_chunk":
                    task_id = data.get("task_id")
                    chunk_index = data.get("chunk_index")
                    total_chunks = data.get("total_chunks")
                    chunk_data = data.get("data")

                    if task_id not in self.chunk_buffer:
                        self.chunk_buffer[task_id] = {}

                    self.chunk_buffer[task_id][chunk_index] = chunk_data
                    self.log(f"📥 [#{page_number}] 收到分块 {chunk_index + 1}/{total_chunks}")

                    if len(self.chunk_buffer[task_id]) == total_chunks:
                        full_base64 = ''.join(
                            self.chunk_buffer[task_id][i]
                            for i in range(total_chunks)
                        )
                        del self.chunk_buffer[task_id]
                        self.log(f"✅ [#{page_number}] 分块合并完成，总大小: {len(full_base64) // 1024} KB")
                        await self.handle_image_result(client_id, task_id, full_base64)

                elif msg_type == "image_data":
                    task_id = data.get("task_id")
                    image_data = data.get("data")
                    self.log(f"📥 [#{page_number}] 收到图片数据，大小: {len(image_data) // 1024} KB")
                    await self.handle_image_result(client_id, task_id, image_data)

                elif msg_type == "result":
                    task_id = data.get("task_id")
                    error = data.get("error")
                    if error:
                        self.log(f"❌ [#{page_number}] 任务失败: {error}")
                        for task in self.task_manager.tasks:
                            if task['id'] == task_id:
                                task['status'] = '失败'
                                task['status_detail'] = error
                                task['end_time'] = datetime.now().isoformat()
                                break
                    self.task_manager.mark_client_idle(client_id)

                elif msg_type == "status":
                    status_msg = data.get('message', '')
                    self.log(f"📌 [#{page_number}] {status_msg}")
                    task_id = self.task_manager.clients.get(client_id, {}).get('task_id')
                    if task_id:
                        self.task_manager.update_task_status_detail(task_id, status_msg)

        except Exception as e:
            self.log(f"连接异常: {e}")
        finally:
            if client_id:
                self.task_manager.remove_client(client_id)
                total, busy = self.task_manager.get_client_count()
                self.log(f"❌ 客户端断开: {client_id} (页面#{page_number})，当前连接数: {total}")

    async def handle_image_result(self, client_id, task_id, base64_data):
        for task in self.task_manager.tasks:
            if task['id'] == task_id:
                output_dir = task.get('output_dir')
                if output_dir:
                    if not Path(output_dir).is_absolute():
                        output_dir = OUTPUT_DIR / output_dir
                    else:
                        output_dir = Path(output_dir)
                else:
                    output_dir = OUTPUT_DIR
                output_dir.mkdir(parents=True, exist_ok=True)

                timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                file_ext = task.get('file_ext', '.png')
                filename = f"{timestamp}{file_ext}"
                filepath = output_dir / filename

                counter = 1
                while filepath.exists():
                    filename = f"{timestamp}_{counter}{file_ext}"
                    filepath = output_dir / filename
                    counter += 1

                saved = await ImageDownloader.save_base64_image(base64_data, filename, output_dir)
                if saved:
                    task['status'] = '已完成'
                    task['end_time'] = datetime.now().isoformat()
                    task['saved_path'] = str(saved)
                    task['output_dir_path'] = str(output_dir)
                    self.log(f"💾 已保存: {saved}")
                else:
                    task['status'] = '下载失败'
                    task['end_time'] = datetime.now().isoformat()
                    self.log(f"❌ 下载失败")
                break
        self.task_manager.mark_client_idle(client_id)

    async def start(self):
        try:
            self.server = await serve(
                self.handler,
                "localhost",
                12345,
                max_size=50 * 1024 * 1024
            )
            self.log("🚀 WebSocket服务器已启动: ws://localhost:12345")
        except OSError as e:
            # 端口被占用
            self.log(f"❌ 无法启动 WebSocket 服务器: {e}")
            raise

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()


class Api:
    """暴露给前端的 API"""

    def __init__(self, task_manager, loop):
        self.task_manager = task_manager
        self.loop = loop
        self.window = None

    def add_task(self, prompt, task_type, aspect_ratio, resolution, reference_images, output_dir):
        task = self.task_manager.add_task(
            prompt=prompt,
            task_type=task_type,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_images=reference_images or [],
            output_dir=output_dir or None
        )
        if task:
            logger.info(f"已添加任务，当前共 {len(self.task_manager.tasks)} 个")
            return {'success': True}
        return {'success': False, 'error': '添加失败'}

    def get_status(self):
        total, busy = self.task_manager.get_client_count()
        tasks_data = []
        for t in self.task_manager.tasks:
            # 如果任务完成且有保存路径，生成缩略图
            preview_base64 = None
            if t['status'] == '已完成' and t.get('saved_path'):
                try:
                    # 只为图片生成缩略图（视频显示 icon 就可以）
                    if t.get('file_ext') == '.png' or t.get('file_ext') == '.jpg':
                        preview_base64 = ImageProcessor.generate_thumbnail(t['saved_path'], size=(200, 200))
                except Exception:
                    pass

            tasks_data.append({
                'id': t['id'],
                'prompt': t['prompt'],
                'status': t['status'],
                'status_detail': t.get('status_detail', ''),
                'task_type': t['task_type'],
                'aspect_ratio': t['aspect_ratio'],
                'resolution': t['resolution'],
                'saved_path': t.get('saved_path', ''),
                'output_dir': t.get('output_dir', ''),
                'start_time': t.get('start_time'),
                'end_time': t.get('end_time'),
                'file_ext': t.get('file_ext', ''),
                'preview_base64': preview_base64
            })
        return {
            'client_count': total,
            'busy_count': busy,
            'is_running': self.task_manager.is_running,
            'tasks': tasks_data
        }

    def start_execution(self):
        total, _ = self.task_manager.get_client_count()
        if total == 0:
            logger.warning("没有连接的客户端")
            return
        if not self.task_manager.tasks:
            logger.warning("任务列表为空")
            return
        self.task_manager.is_running = True
        asyncio.run_coroutine_threadsafe(self._execute_tasks(), self.loop)

    def stop_execution(self):
        self.task_manager.is_running = False
        logger.info("⏹ 已停止执行")

    async def _execute_tasks(self):
        logger.info("▶ 开始执行任务队列")

        while self.task_manager.is_running:
            # 检查超时任务
            timeout_tasks = self.task_manager.check_timeout_tasks()
            for t in timeout_tasks:
                logger.warning(f"⏰ 任务超时: {t['id']} - {t['prompt'][:30]}...")

            task = self.task_manager.get_next_task()
            if not task:
                has_busy = any(c['busy'] for c in self.task_manager.clients.values())
                if not has_busy:
                    logger.info("✅ 所有任务已完成")
                    break
                await asyncio.sleep(1)
                continue

            client_id, client_info = self.task_manager.get_idle_client()
            if not client_info:
                await asyncio.sleep(1)
                continue

            task['status'] = '处理中'
            task['start_time'] = datetime.now().isoformat()
            self.task_manager.mark_client_busy(client_id, task['id'])
            self.task_manager.current_index += 1

            logger.info(f"📤 [{client_id}] 分配任务: {task['prompt'][:40]}...")

            message = json.dumps({
                'type': 'task',
                'task_id': task['id'],
                'prompt': task['prompt'],
                'task_type': task['task_type'],
                'aspect_ratio': task['aspect_ratio'],
                'resolution': task['resolution'],
                'reference_images': task['reference_images']
            })

            try:
                await client_info['ws'].send(message)
            except Exception as e:
                logger.error(f"❌ [{client_id}] 发送失败: {e}")
                task['status'] = '等待中'
                self.task_manager.mark_client_idle(client_id)

            await asyncio.sleep(0.5)

        self.task_manager.is_running = False
        logger.info("任务队列执行结束")

    def select_images(self):
        """打开文件对话框选择图片"""
        file_types = ('图片文件 (*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp)',)
        result = self.window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=True,
            file_types=file_types
        )
        if not result:
            return []

        images = []
        for filepath in result:
            logger.info(f"正在处理: {Path(filepath).name}")
            base64_data = ImageProcessor.compress_image_to_base64(filepath)
            if base64_data:
                images.append(base64_data)
                size_kb = len(base64_data) * 3 / 4 / 1024
                logger.info(f"✅ 已添加: {Path(filepath).name} (压缩后 ~{size_kb:.1f}KB)")
        return images

    def import_excel(self):
        """导入 Excel 文件"""
        if load_workbook is None:
            return {'success': False, 'count': 0, 'errors': ['请安装 openpyxl']}

        file_types = ('Excel文件 (*.xlsx)',)
        result = self.window.create_file_dialog(
            webview.OPEN_DIALOG,
            file_types=file_types
        )
        if not result:
            return {'success': False, 'count': 0, 'errors': []}

        filepath = result[0]

        # 验证分辨率和任务类型是否匹配
        def validate_resolution(task_type, resolution):
            """检查分辨率是否与任务类型兼容"""
            valid_resolutions = {
                "Create Image": ["4K", "2K", "1K"],
                "Text to Video": ["1080p", "720p"],
                "Frames to Video": ["1080p", "720p"],
                "Ingredients to Video": ["1080p", "720p"]
            }
            if task_type not in valid_resolutions:
                return False, f"未知任务类型: {task_type}"

            allowed = valid_resolutions[task_type]
            if resolution not in allowed:
                return False, f"{task_type} 不支持分辨率 {resolution}，请使用: {', '.join(allowed)}"
            return True, ""

        task_type_map = {
            "图片": "Create Image",
            "文生视频": "Text to Video",
            "首尾帧视频": "Frames to Video",
            "多图视频": "Ingredients to Video"
        }
        orientation_map = {
            "横屏": "16:9",
            "竖屏": "9:16"
        }

        errors = []
        count = 0

        try:
            wb = load_workbook(filepath)
            ws = wb.active

            for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                if not row or not row[1]:
                    continue

                try:
                    prompt = str(row[1]).strip() if row[1] else ""
                    if not prompt:
                        continue

                    task_type_cn = str(row[2]).strip() if len(row) > 2 and row[2] else "图片"
                    orientation_cn = str(row[3]).strip() if len(row) > 3 and row[3] else "横屏"
                    resolution = str(row[4]).strip() if len(row) > 4 and row[4] else ""
                    output_dir = str(row[5]).strip() if len(row) > 5 and row[5] else None

                    task_type = task_type_map.get(task_type_cn, "Create Image")
                    aspect_ratio = orientation_map.get(orientation_cn, "16:9")

                    if not resolution:
                        resolution = "1080p" if "Video" in task_type else "4K"

                    # 验证分辨率
                    is_valid, error_msg = validate_resolution(task_type, resolution)
                    if not is_valid:
                        errors.append(f"行{row_idx}: {error_msg}")
                        continue

                    reference_images = []
                    max_images = {
                        "Create Image": 8,
                        "Frames to Video": 2,
                        "Ingredients to Video": 3,
                        "Text to Video": 0
                    }.get(task_type, 8)

                    for i in range(max_images):
                        col_idx = 6 + i
                        if len(row) > col_idx and row[col_idx]:
                            img_path = str(row[col_idx]).strip()
                            if img_path and Path(img_path).exists():
                                base64_data = ImageProcessor.compress_image_to_base64(img_path)
                                if base64_data:
                                    reference_images.append(base64_data)

                    task = self.task_manager.add_task(
                        prompt=prompt,
                        task_type=task_type,
                        aspect_ratio=aspect_ratio,
                        resolution=resolution,
                        reference_images=reference_images,
                        output_dir=output_dir
                    )
                    if task:
                        count += 1

                except Exception as e:
                    errors.append(f"行{row_idx}: {str(e)}")

            wb.close()
            logger.info(f"从Excel导入 {count} 个任务")
            return {'success': True, 'count': count, 'errors': errors}

        except Exception as e:
            return {'success': False, 'count': 0, 'errors': [str(e)]}

    def export_template(self):
        """导出 Excel 模板"""
        if Workbook is None:
            return

        result = self.window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename='任务模板.xlsx'
        )
        if not result:
            return

        filepath = result if isinstance(result, str) else result[0]

        try:
            wb = Workbook()
            ws = wb.active
            ws.title = "任务列表"

            headers = ["编号", "提示词", "任务类型", "屏幕方向", "分辨率", "输出文件夹",
                       "图1", "图2", "图3", "图4", "图5", "图6", "图7", "图8"]
            for col, header in enumerate(headers, start=1):
                ws.cell(row=1, column=col, value=header)

            examples = [
                [1, "A beautiful sunset over the ocean", "图片", "横屏", "4K", "sunset"],
                [2, "A cute cat playing", "文生视频", "横屏", "1080p", "cats"],
            ]

            for row_idx, example in enumerate(examples, start=2):
                for col_idx, value in enumerate(example, start=1):
                    ws.cell(row=row_idx, column=col_idx, value=value)

            wb.save(filepath)
            logger.info(f"已导出模板: {filepath}")

        except Exception as e:
            logger.error(f"导出模板失败: {e}")

    def open_output_dir(self):
        """打开输出目录"""
        self._open_directory(OUTPUT_DIR)

    def open_task_file(self, task_index):
        """打开任务的文件（不是文件夹）"""
        if 0 <= task_index < len(self.task_manager.tasks):
            task = self.task_manager.tasks[task_index]
            saved_path = task.get('saved_path')
            if saved_path and Path(saved_path).exists():
                path = Path(saved_path)
                # 直接打开文件
                path_str = str(path.absolute())
                system = platform.system()

                if system == 'Windows':
                    os.startfile(path_str)
                elif system == 'Darwin':
                    subprocess.run(['open', path_str])
                else:
                    subprocess.run(['xdg-open', path_str])
            else:
                # 文件不存在，打开所在目录
                self.open_task_dir(task_index)
        else:
            self.open_output_dir()

    def open_task_dir(self, task_index):
        """打开任务的输出目录"""
        if 0 <= task_index < len(self.task_manager.tasks):
            task = self.task_manager.tasks[task_index]
            output_dir = task.get('output_dir_path', str(OUTPUT_DIR))
            self._open_directory(Path(output_dir))
        else:
            self._open_directory(OUTPUT_DIR)

    def _open_directory(self, path):
        path = Path(path)
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)

        path_str = str(path.absolute())
        system = platform.system()

        if system == 'Windows':
            os.startfile(path_str)
        elif system == 'Darwin':
            subprocess.run(['open', path_str])
        else:
            subprocess.run(['xdg-open', path_str])


def run_async_loop(loop):
    asyncio.set_event_loop(loop)
    loop.run_forever()


def main():
    # 创建事件循环
    loop = asyncio.new_event_loop()
    thread = threading.Thread(target=run_async_loop, args=(loop,), daemon=True)
    thread.start()

    # 创建任务管理器和 API
    task_manager = TaskManager()
    api = Api(task_manager, loop)

    # 启动 WebSocket 服务器，捕获端口占用错误
    ws_server = WebSocketServer(task_manager)
    ws_start_future = asyncio.run_coroutine_threadsafe(ws_server.start(), loop)

    try:
        # 等待 WebSocket 启动完成（超时 5 秒）
        ws_start_future.result(timeout=5)
    except OSError as e:
        # 端口被占用，弹框提示用户
        error_msg = f"无法启动应用！\n\nWebSocket 端口 12345 被占用\n\n{str(e)}\n\n请检查是否有其他程序占用该端口，或稍后重试。"
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()  # 隐藏主窗口
        messagebox.showerror("启动失败", error_msg)
        root.destroy()
        return
    except Exception as e:
        # 其他错误
        error_msg = f"无法启动 WebSocket 服务器：\n\n{str(e)}"
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("启动失败", error_msg)
        root.destroy()
        return

    # 确定 web 目录和 URL
    if getattr(sys, 'frozen', False):
        # 打包后，使用打包的web目录
        web_dir = Path(sys._MEIPASS) / 'web'
        url = str(web_dir / 'index.html')
    else:
        # 开发模式
        web_dir = Path(__file__).parent / 'web'
        # 检查是否使用开发服务器
        if os.environ.get('DEV') == '1' or not web_dir.exists():
            url = 'http://localhost:5173'
            logger.info("使用开发服务器: http://localhost:5173")
        else:
            url = str(web_dir / 'index.html')
            logger.info(f"使用本地文件: {url}")

    # 创建窗口
    window = webview.create_window(
        'Veo3Free - AI生成工具',
        url,
        width=1000,
        height=700,
        min_size=(800, 600),
        js_api=api
    )
    api.window = window

    # 启动 webview
    webview.start()

    # 清理
    asyncio.run_coroutine_threadsafe(ws_server.stop(), loop)
    loop.call_soon_threadsafe(loop.stop)


if __name__ == "__main__":
    main()
