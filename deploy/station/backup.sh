#!/bin/sh
# Backs up a station: the database and the photos, into ./backups/<date>.
# Run from the repository folder, e.g. every night from cron:
#   30 21 * * * cd /opt/ai-grain && sh deploy/station/backup.sh >> backups/backup.log 2>&1
set -eu
stamp=$(date +%Y-%m-%d_%H%M)
dir="backups/$stamp"
mkdir -p "$dir"
docker compose exec -T db pg_dump -U aigrain -Fc aigrain > "$dir/database.dump"
docker compose run --rm --no-deps -v "$(pwd)/$dir:/backup" --entrypoint sh app \
  -c 'tar -czf /backup/files.tar.gz -C /data .'
# Keep the last 14 backups.
ls -1d backups/*/ | head -n -14 | xargs -r rm -rf
echo "Backup written to $dir"
