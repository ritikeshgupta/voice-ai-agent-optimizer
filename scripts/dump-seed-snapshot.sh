#!/usr/bin/env bash
# Regenerates src/db/seed-data.sql from the current local DB (default: ./data/optimizer.sqlite,
# or pass a path as $1). Run this after a fresh `npm run seed` + analyze/testgen/recommend pass
# whenever the baked-in demo snapshot needs refreshing -- see README's Team-of-One notes on why
# this is a static file instead of a live re-seed at boot.
set -euo pipefail

DB_PATH="${1:-./data/optimizer.sqlite}"
OUT_PATH="src/db/seed-data.sql"

if [ ! -f "$DB_PATH" ]; then
  echo "No DB found at $DB_PATH" >&2
  exit 1
fi

: > "$OUT_PATH"
for table in agents call_logs issues test_cases test_runs recommendations; do
  sqlite3 "$DB_PATH" ".mode insert $table" "SELECT * FROM $table;" >> "$OUT_PATH"
done

echo "Wrote $(wc -l < "$OUT_PATH" | tr -d ' ') INSERT statement(s) to $OUT_PATH"
