#!/usr/bin/env bash
set -euo pipefail
umask 077
database="${1:-antmall_crm_production}"
[[ "$database" =~ ^antmall_crm_(production|stage|test)(_[a-z0-9]+)?$ ]] || { echo 'Unexpected database' >&2; exit 1; }
directory=/srv/antmall-crm/backups/mysql
install -d -m 700 "$directory"
file="$directory/$database-$(date -u +%Y%m%dT%H%M%S)-$$.sql.gz"
temporary="$file.partial"
trap 'rm -f -- "$temporary"' EXIT
mysqldump --protocol=socket --user=root --single-transaction --quick --routines --triggers --events --hex-blob --no-tablespaces --set-gtid-purged=OFF "$database" | gzip > "$temporary"
gzip -t "$temporary"
mv -- "$temporary" "$file"
sha256sum "$file" > "$file.sha256"
printf '%s\n' "$file"
