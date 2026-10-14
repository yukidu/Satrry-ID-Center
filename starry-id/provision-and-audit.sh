#!/usr/bin/env bash
set -euo pipefail

DB_NAME="starry_id_db"
SOURCE_DB="echoes_db"

npx wrangler d1 list --json > /tmp/starry-d1.json
D1_ID=$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync('/tmp/starry-d1.json','utf8'));const a=Array.isArray(x)?x:(x.result||[]);const r=a.find(v=>v.name==='starry_id_db');process.stdout.write(r?.uuid||r?.id||'')")
if [ -z "$D1_ID" ]; then
  npx wrangler d1 create "$DB_NAME" --location apac
  npx wrangler d1 list --json > /tmp/starry-d1.json
  D1_ID=$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync('/tmp/starry-d1.json','utf8'));const a=Array.isArray(x)?x:(x.result||[]);const r=a.find(v=>v.name==='starry_id_db');process.stdout.write(r?.uuid||r?.id||'')")
fi
test -n "$D1_ID"
echo "Starry ID D1 exists: $D1_ID"

npx wrangler d1 execute "$DB_NAME" --remote --file=starry-id/schema.sql --yes
npx wrangler d1 execute "$DB_NAME" --remote --file=starry-id/migrations/20261014_profile_options.sql --yes
npx wrangler d1 execute "$DB_NAME" --remote --file=starry-id/migrations/20261014_profile_schema.sql --yes
npx wrangler d1 execute "$DB_NAME" --remote --file=starry-id/migrations/20261014_notifications.sql --yes
npx wrangler d1 execute "$DB_NAME" --remote --command "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE '_cf_%' ORDER BY name" --json > /tmp/starry-schema.json
node starry-id/verify-schema.mjs /tmp/starry-schema.json

query_count() {
  local sql="$1"
  npx wrangler d1 execute "$SOURCE_DB" --remote --command "$sql" --json > /tmp/starry-query.json
  node starry-id/read-count.mjs /tmp/starry-query.json
}

TOTAL=$(query_count "SELECT COUNT(*) AS value FROM users")
MISSING_ID=$(query_count "SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(id,'')) = ''")
MISSING_NAME=$(query_count "SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(name,'')) = ''")
MISSING_EMAIL=$(query_count "SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(email,'')) = ''")
MISSING_GOOGLE_SUBJECT=$(query_count "SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(googleSubject,'')) = ''")
DUP_EMAIL_GROUPS=$(query_count "SELECT COUNT(*) AS value FROM (SELECT LOWER(TRIM(email)) k FROM users WHERE TRIM(COALESCE(email,'')) <> '' GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1)")
DUP_SUBJECT_GROUPS=$(query_count "SELECT COUNT(*) AS value FROM (SELECT googleSubject k FROM users WHERE TRIM(COALESCE(googleSubject,'')) <> '' GROUP BY googleSubject HAVING COUNT(*) > 1)")
HAS_SPONSOR=$(query_count "SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(sponsor,'')) <> ''")
HAS_PLATINUM=$(query_count "SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(platinumUpline,'')) <> ''")
HAS_DIAMOND=$(query_count "SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(diamondUpline,'')) <> ''")

npx wrangler d1 execute "$DB_NAME" --remote --command "SELECT COUNT(*) AS value FROM users" --json > /tmp/starry-target.json
TARGET_USERS=$(node starry-id/read-count.mjs /tmp/starry-target.json)

mkdir -p starry-id/audit-output
node starry-id/write-audit-report.mjs \
  "$TOTAL" "$MISSING_ID" "$MISSING_NAME" "$MISSING_EMAIL" "$MISSING_GOOGLE_SUBJECT" \
  "$DUP_EMAIL_GROUPS" "$DUP_SUBJECT_GROUPS" "$HAS_SPONSOR" "$HAS_PLATINUM" "$HAS_DIAMOND" "$TARGET_USERS" \
  > starry-id/audit-output/member-audit.json

cat starry-id/audit-output/member-audit.json
