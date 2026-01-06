#!/bin/bash
# 开发模式启动脚本

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 清理函数
cleanup() {
    echo -e "\n${RED}正在停止所有进程...${NC}"
    kill 0
    exit
}

# 捕获退出信号
trap cleanup SIGINT SIGTERM

echo -e "${BLUE}=== 启动开发环境 ===${NC}\n"

# 检查依赖
if ! command -v uv &> /dev/null; then
    echo -e "${RED}错误: uv 未安装${NC}"
    echo "请安装 uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}错误: npm 未安装${NC}"
    exit 1
fi

# 检查前端依赖
if [ ! -d "web-src/node_modules" ]; then
    echo -e "${BLUE}安装前端依赖...${NC}"
    cd web-src && npm install && cd ..
fi

# 启动前端开发服务器
echo -e "${GREEN}启动前端开发服务器 (http://localhost:5173)${NC}"
cd web-src && npm run dev &
FRONTEND_PID=$!

# 等待前端服务器启动
sleep 3

# 启动Python后端
echo -e "${GREEN}启动Python后端${NC}"
DEV=1 uv run python main.py &
BACKEND_PID=$!

# 等待进程
wait
