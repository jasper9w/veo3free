"""版本管理模块"""

import sys
from pathlib import Path

APP_NAME = "veo3free"
GITHUB_REPO = "jasper9w/veo3free"
__version__ = "1.0.9"


def get_version() -> str:
    """获取当前应用版本号"""
    if getattr(sys, 'frozen', False):
        return __version__

    # 开发环境从 pyproject.toml 读取
    import tomllib
    pyproject_path = Path(__file__).parent / "pyproject.toml"
    with open(pyproject_path, 'rb') as f:
        return tomllib.load(f)["project"]["version"]


def compare_versions(current: str, latest: str) -> int:
    """
    比较两个版本号
    返回: -1 (当前版本较旧), 0 (相同), 1 (当前版本较新)
    """
    def parse_version(v: str) -> tuple:
        v = v.lstrip('v')
        parts = v.split('.')
        # 补齐至少3位，不足的补0
        while len(parts) < 3:
            parts.append('0')
        return tuple(int(p) for p in parts[:3])

    try:
        current_tuple = parse_version(current)
        latest_tuple = parse_version(latest)

        if current_tuple < latest_tuple:
            return -1
        elif current_tuple > latest_tuple:
            return 1
        return 0
    except (ValueError, IndexError):
        return 0
