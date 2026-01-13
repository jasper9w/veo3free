# -*- mode: python ; coding: utf-8 -*-

import sys
import tomllib
from pathlib import Path

# 从 pyproject.toml 读取版本号并同步到 version.py
root = Path(SPECPATH)
with open(root / "pyproject.toml", "rb") as f:
    version = tomllib.load(f)["project"]["version"]

version_file = root / "version.py"
content = version_file.read_text()
import re
content = re.sub(r'__version__ = "[^"]+"', f'__version__ = "{version}"', content)
version_file.write_text(content)
print(f"[spec] 版本号已同步: {version}")

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('web', 'web'),
        ('guide', 'guide'),
    ],
    hiddenimports=[
        'PIL._tkinter_finder',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    name='veo3free',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

if sys.platform == 'darwin':
    app = BUNDLE(
        exe,
        name='veo3free.app',
        icon='icons/app_icon.icns',
        bundle_identifier='com.veo3free.app',
    )
