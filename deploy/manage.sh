#!/usr/bin/env bash
# Runs maintenance with Gunicorn's environment and OS user, without printing secrets.
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo bash deploy/manage.sh check-db (or init-db after a backup)." >&2
  exit 1
fi
case "${1:-check-db}" in
  check-db|init-db) task_command="${1:-check-db}" ;;
  *) echo "Usage: sudo bash deploy/manage.sh {check-db|init-db}" >&2; exit 2 ;;
esac
if [[ ! -f /etc/sarvathaa.env || ! -x /var/www/sarvathaa/venv/bin/flask ]]; then
  echo "Missing /etc/sarvathaa.env or the VPS Python environment. Follow the deployment guide." >&2
  exit 1
fi
if [[ "$task_command" == "init-db" ]]; then
  echo "Running setup/migrations. A recent backup is required for an existing database."
fi
exec systemd-run --wait --pipe --collect \
  --property=User=www-data \
  --property=Group=www-data \
  --property=WorkingDirectory=/var/www/sarvathaa \
  --property=EnvironmentFile=/etc/sarvathaa.env \
  /var/www/sarvathaa/venv/bin/flask --app wsgi "$task_command"
