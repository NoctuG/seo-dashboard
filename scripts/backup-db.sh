#!/usr/bin/env bash
# ------------------------------------------------------------------
# SEO Dashboard – SQLite 数据库定时备份脚本
#
# 用法:
#   ./scripts/backup-db.sh                 # 使用默认配置
#   BACKUP_RETAIN_DAYS=14 ./scripts/backup-db.sh  # 保留 14 天
#
# 该脚本会：
#   1. 通过 docker compose cp 从容器卷中安全导出数据库文件
#   2. 使用 sqlite3 ".backup" 命令保证一致性（若可用）
#   3. 使用 gzip 压缩备份并附带时间戳
#   4. 自动清理超过 BACKUP_RETAIN_DAYS 天的旧备份
#
# 建议配合 cron 定时执行，例如每天凌晨 2:00 备份：
#   0 2 * * * /path/to/seo-dashboard/scripts/backup-db.sh >> /var/log/seo-backup.log 2>&1
# ------------------------------------------------------------------

set -euo pipefail

# ---------- 可配置变量 ----------
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/backups}"
CONTAINER_DB_PATH="${CONTAINER_DB_PATH:-/data/seo_tool.db}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-backend}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"

# ---------- 准备 ----------
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/seo-backup-${TIMESTAMP}.db"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] 开始数据库备份..."

# ---------- 导出数据库 ----------
# 优先使用 sqlite3 .backup 以获得热备份一致性；
# 若容器中未安装 sqlite3，则回退到直接复制文件。
if docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T "${COMPOSE_SERVICE}" \
    sh -c "command -v sqlite3 >/dev/null 2>&1"; then
    echo "  使用 sqlite3 .backup 进行一致性备份"
    docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T "${COMPOSE_SERVICE}" \
        sqlite3 "${CONTAINER_DB_PATH}" ".backup /tmp/_seo_backup.db"
    docker compose -f "${PROJECT_DIR}/docker-compose.yml" cp \
        "${COMPOSE_SERVICE}:/tmp/_seo_backup.db" "${BACKUP_FILE}"
    docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T "${COMPOSE_SERVICE}" \
        rm -f /tmp/_seo_backup.db
else
    echo "  sqlite3 不可用，使用文件复制方式备份"
    docker compose -f "${PROJECT_DIR}/docker-compose.yml" cp \
        "${COMPOSE_SERVICE}:${CONTAINER_DB_PATH}" "${BACKUP_FILE}"
fi

# ---------- 压缩 ----------
gzip "${BACKUP_FILE}"
BACKUP_FILE="${BACKUP_FILE}.gz"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "  备份完成: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ---------- 清理旧备份 ----------
DELETED_COUNT=0
while IFS= read -r old_file; do
    rm -f "${old_file}"
    DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -name "seo-backup-*.db.gz" -mtime +"${BACKUP_RETAIN_DAYS}" -type f 2>/dev/null)

if [ "${DELETED_COUNT}" -gt 0 ]; then
    echo "  已清理 ${DELETED_COUNT} 个超过 ${BACKUP_RETAIN_DAYS} 天的旧备份"
fi

echo "[$(date -Iseconds)] 备份完成"
