#!/bin/bash
# MongoDB 数据库备份脚本

BACKUP_DIR="${BACKUP_DIR:-/backup/mongodb}"
MONGODB_URI="${MONGODB_URI:-mongodb://admin:admin123@localhost:27017}"
DATABASE="${DATABASE:-3dprint_db}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${DATE}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting MongoDB backup..."

mkdir -p "$BACKUP_DIR"

mongodump --uri="$MONGODB_URI/$DATABASE" --out="$BACKUP_PATH" 2>&1

if [ $? -eq 0 ]; then
    log "Backup completed: $BACKUP_PATH"
    
    cd "$BACKUP_DIR"
    tar -czf "${DATABASE}_${DATE}.tar.gz" "$DATE"
    rm -rf "$BACKUP_PATH"
    
    find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete
    log "Old backups cleaned (retention: $RETENTION_DAYS days)"
else
    log "ERROR: Backup failed!"
    exit 1
fi