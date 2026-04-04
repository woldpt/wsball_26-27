#!/bin/sh
set -e

DB_PATH="/app/db/base.db"

# Run seed if base.db doesn't exist or is empty/tiny
if [ ! -f "$DB_PATH" ] || [ "$(wc -c < "$DB_PATH")" -lt 1024 ]; then
  echo "[entrypoint] base.db not found or empty — seeding..."
  node db/seed.js
  echo "[entrypoint] Seed complete."
else
  echo "[entrypoint] base.db already exists ($(wc -c < "$DB_PATH") bytes) — skipping seed."
fi

npm run build
exec node dist/index.js
