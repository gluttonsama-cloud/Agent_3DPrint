#!/bin/bash
# 健康检查脚本
# 用于定时监控服务健康状态

HEALTH_URL="${HEALTH_URL:-http://localhost:3001/health}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
LOG_FILE="/var/log/3dprint/health.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

send_alert() {
    local message="$1"
    log "ALERT: $message"
    
    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -s -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"$message\"}" >> "$LOG_FILE" 2>&1
    fi
}

check_backend() {
    local response
    response=$(curl -sf "$HEALTH_URL" 2>/dev/null)
    local status=$?
    
    if [ $status -eq 0 ]; then
        log "Backend: OK"
        return 0
    else
        send_alert "Backend service is DOWN!"
        return 1
    fi
}

check_database() {
    if docker exec mongodb-3dprint mongosh --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        log "MongoDB: OK"
        return 0
    else
        send_alert "MongoDB is DOWN!"
        return 1
    fi
}

check_redis() {
    if docker exec redis-3dprint redis-cli ping 2>/dev/null | grep -q "PONG"; then
        log "Redis: OK"
        return 0
    else
        send_alert "Redis is DOWN!"
        return 1
    fi
}

main() {
    mkdir -p "$(dirname "$LOG_FILE")"
    
    check_backend
    local backend_status=$?
    
    check_database
    local db_status=$?
    
    check_redis
    local redis_status=$?
    
    if [ $backend_status -eq 0 ] && [ $db_status -eq 0 ] && [ $redis_status -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

main "$@"