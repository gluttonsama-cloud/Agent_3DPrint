FROM python:3.10-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安装 PyTorch (GPU 版本)
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# 安装 rembg
RUN pip install rembg[gpu]

# 暴露端口
EXPOSE 7000

# 启动命令
CMD ["rembg", "s", "--host", "0.0.0.0", "--port", "7000"]
