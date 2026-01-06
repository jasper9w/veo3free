#!/bin/bash
# 构建二进制程序脚本

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== 开始构建应用 ===${NC}\n"

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

# 1. 构建前端
echo -e "${BLUE}[1/3] 构建前端...${NC}"
cd web-src

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}安装前端依赖...${NC}"
    npm install
fi

npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}前端构建失败${NC}"
    exit 1
fi

cd ..
echo -e "${GREEN}✓ 前端构建完成${NC}\n"

# 2. 安装Python依赖
echo -e "${BLUE}[2/3] 同步Python依赖...${NC}"
uv sync
if [ $? -ne 0 ]; then
    echo -e "${RED}依赖同步失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 依赖同步完成${NC}\n"

# 3. 打包应用
echo -e "${BLUE}[3/3] 打包应用...${NC}"
rm -rf dist/veo3free dist/veo3free.app
uv run pyinstaller veo3free.spec --clean
if [ $? -ne 0 ]; then
    echo -e "${RED}打包失败${NC}"
    exit 1
fi

echo -e "\n${GREEN}=== 构建成功 ===${NC}"
echo -e "${GREEN}应用位置: ${YELLOW}dist/veo3free.app${NC}"
echo -e "${BLUE}提示: 可以将 veo3free.app 拖到应用程序文件夹${NC}"
