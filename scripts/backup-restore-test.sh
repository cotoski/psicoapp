#!/usr/bin/env bash
# Gate 1 — teste real de backup/restore.
#
# Uso:
#   ./scripts/backup-restore-test.sh <container-postgres> <database> [user]
#
# Faz pg_dump do banco, restaura em um banco NOVO (sufixo _restore_test),
# e verifica contagens de tabelas críticas. Não toca no banco de origem.
# Roda dentro de um container postgres:16 contra o host do container alvo
# via rede docker — ou localmente com pg_dump/pg_restore instalados.
set -euo pipefail

CONTAINER="${1:?container postgres de origem}"
DB="${2:?database de origem}"
USER="${3:-psicoapp}"
RESTORE_DB="${DB}_restore_test"

dump() {
  docker exec "$CONTAINER" pg_dump -U "$USER" -Fc "$DB" > /tmp/psicoapp-backup.dump
  ls -lh /tmp/psicoapp-backup.dump
}

restore() {
  docker exec "$CONTAINER" psql -U "$USER" -d postgres \
    -c "DROP DATABASE IF EXISTS $RESTORE_DB" \
    -c "CREATE DATABASE $RESTORE_DB"
  docker exec -i "$CONTAINER" pg_restore -U "$USER" -d "$RESTORE_DB" \
    --no-owner --no-privileges < /tmp/psicoapp-backup.dump
}

verify() {
  for table in tenants users patients appointments session_records audit_events; do
    orig=$(docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -tAc \
      "SELECT count(*) FROM $table")
    rest=$(docker exec "$CONTAINER" psql -U "$USER" -d "$RESTORE_DB" -tAc \
      "SELECT count(*) FROM $table")
    if [ "$orig" != "$rest" ]; then
      echo "FALHA: $table origem=$orig restaurado=$rest" >&2
      exit 1
    fi
    echo "OK  $table: $rest linhas"
  done
}

cleanup() {
  docker exec "$CONTAINER" psql -U "$USER" -d postgres \
    -c "DROP DATABASE IF EXISTS $RESTORE_DB" >/dev/null
  rm -f /tmp/psicoapp-backup.dump
}

trap cleanup EXIT
echo "== dump =="; dump
echo "== restore =="; restore
echo "== verify =="; verify
echo "BACKUP/RESTORE TEST: PASS"
