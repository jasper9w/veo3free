# 更新日志

所有重要的项目更改都将记录在此文件中。

## [1.1.16] - 2026-01-29

### 新增功能

#### 核心功能
- ✨ 全新的桌面应用，基于 PyWebview + React + Tailwind CSS 构建
- 🎬 支持 Veo 3.1/3.0/2.1/2.0 视频生成模型
  - 文生视频（T2V）
  - 首尾帧视频（I2V）
  - 多参考图视频（R2V）
  - 支持横屏和竖屏两种分辨率
- 🖼️ 支持多种图片生成模型
  - Gemini 2.5 Flash Image
  - Gemini 3.0 Pro Image
  - Imagen 4.0
  - 支持横屏和竖屏两种分辨率

#### API 服务
- 🌐 内置 OpenAI 兼容 API 服务器（FastAPI）
- 🔌 支持流式响应
- 📡 RESTful API 接口
- 🔐 API 密钥验证

#### 用户界面
- 💻 现代化的桌面 UI 界面
- 📝 批量任务模板支持
- 📊 实时任务进度显示
- 🔄 自动更新检查
- 📖 内置使用指南和 API 文档

#### 开发特性
- 🛠️ 支持开发模式和生产模式
- 📦 自动打包脚本（macOS 和 Windows）
- 🔧 使用 uv 进行依赖管理
- 📝 完整的 TypeScript 类型定义
- 🎨 Tailwind CSS 样式系统

### 技术栈
- **前端**: React 18 + TypeScript + Vite + Tailwind CSS
- **后端**: Python 3.12 + FastAPI + PyWebview
- **依赖管理**: uv
- **日志**: loguru
- **打包**: PyInstaller

### 平台支持
- ✅ macOS（.dmg 安装包）
- ✅ Windows（.exe 可执行文件）

### 注意事项
1. 需要有 Google Flow 权限的账号
2. Google 账号首选语言需设置为英文
3. 打开 https://labs.google/fx/tools/flow 并登录后使用

### 完整更新
查看完整更新: [v1.1.14...v1.1.16](https://github.com/jasper9w/veo3free/compare/v1.1.14...v1.1.16)
