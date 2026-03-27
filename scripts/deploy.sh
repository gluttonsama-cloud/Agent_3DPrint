#!/bin/bash
# ============================================
# 3D 打印多 Agent 系统 - 部署脚本
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi

    log_info "Docker 环境检查通过"
}

# 检查环境变量文件
check_env_file() {
    if [ ! -f .env ]; then
        log_warn ".env 文件不存在，从模板创建..."
        cp .env.example .env
        log_info "已创建 .env 文件，请编辑填写正确的配置"
        exit 1
    fi
    log_info "环境变量文件检查通过"
}

# 构建镜像
build_images() {
    log_info "开始构建 Docker 镜像..."
    docker-compose build --no-cache
    log_info "镜像构建完成"
}

# 启动服务
start_services() {
    log_info "启动服务..."
    docker-compose up -d
    log_info "服务启动完成"
    
    log_info "等待服务就绪..."
    sleep 10
    
    log_info "服务状态："
    docker-compose ps
}

# 停止服务
stop_services() {
    log_info "停止服务..."
    docker-compose down
    log_info "服务已停止"
}

# 查看日志
view_logs() {
    docker-compose logs -f
}

# 清理数据
clean_data() {
    log_warn "这将删除所有数据（数据库、缓存等），确定吗？"
    read -p "输入 'yes' 确认: " confirm
    if [ "$confirm" = "yes" ]; then
        docker-compose down -v
        log_info "数据已清理"
    else
        log_info "操作已取消"
    fi
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    # 检查后端服务
    if curl -s http://localhost:3001/health | grep -q "ok"; then
        log_info "后端服务: 正常"
    else
        log_error "后端服务: 异常"
    fi
    
    # 检查前端服务
    if curl -s http://localhost:3000/health | grep -q "healthy"; then
        log_info "前端服务: 正常"
    else
        log_error "前端服务: 异常"
    fi
    
    # 检查 MongoDB
    if docker exec mongodb-3dprint mongosh --eval "db.adminCommand('ping')" | grep -q "ok"; then
        log_info "MongoDB: 正常"
    else
        log_error "MongoDB: 异常"
    fi
    
    # 检查 Redis
    if docker exec redis-3dprint redis-cli ping | grep -q "PONG"; then
        log_info "Redis: 正常"
    else
        log_error "Redis: 异常"
    fi
}

# 显示帮助
show_help() {
    echo "用法: ./deploy.sh [命令]"
    echo ""
    echo "命令列表:"
    echo "  build     构建 Docker 镜像"
    echo "  start     启动所有服务"
    echo "  stop      停止所有服务"
    echo "  restart   重启所有服务"
    echo "  logs      查看服务日志"
    echo "  status    查看服务状态"
    echo "  health    执行健康检查"
    echo "  clean     清理所有数据"
    echo "  help      显示此帮助信息"
}

# 主入口
main() {
    case "$1" in
        build)
            check_docker
            build_images
            ;;
        start)
            check_docker
            check_env_file
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            stop_services
            start_services
            ;;
        logs)
            view_logs
            ;;
        status)
            docker-compose ps
            ;;
        health)
            health_check
            ;;
        clean)
            clean_data
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_info "执行完整部署流程..."
            check_docker
            check_env_file
            build_images
            start_services
            health_check
            ;;
    esac
}

main "$@"