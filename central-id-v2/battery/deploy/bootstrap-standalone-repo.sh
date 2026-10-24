#!/usr/bin/env bash
# Extract Starry Battery into yukidu/starry-battery while preserving its subtree commit lineage.
# Run only AFTER a new PRIVATE EMPTY GitHub repository named "starry-battery" exists.
# This script never deletes/moves old GitHub content and never touches Cloudflare.
set -euo pipefail

SOURCE_URL="https://github.com/yukidu/hglobal-id.git"
SOURCE_BRANCH="feat/starry-battery-independent-release-20261024"
DEST_URL="https://github.com/yukidu/starry-battery.git"
SUBTREE="central-id-v2/battery"

for command in git node python3; do
  command -v "$command" >/dev/null || { echo "Missing $command"; exit 1; }
done
if ! git config user.name >/dev/null || ! git config user.email >/dev/null; then
  echo "Please configure your Git commit identity (git config --global user.name / user.email)."
  exit 1
fi

# No implicit creation of a repo and no force pushes.
if ! git ls-remote "$DEST_URL" HEAD refs/heads/main >/dev/null 2>&1; then
  echo "Destination repo inaccessible or missing: $DEST_URL"
  echo "Create it as an empty private repo first, then grant the GitHub app access."
  exit 1
fi
if [[ -n "$(git ls-remote "$DEST_URL" HEAD refs/heads/main)" ]]; then
  echo "ABORT: target repository is not empty; refusing to overwrite existing history."
  exit 1
fi

temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
git clone -q "$SOURCE_URL" "$temporary/source"
cd "$temporary/source"
git fetch -q origin "$SOURCE_BRANCH"
SOURCE_SHA="$(git rev-parse FETCH_HEAD)"
if ! git cat-file -e "$SOURCE_SHA:$SUBTREE/schema.sql"; then
  echo "ABORT: source commit does not contain an isolated Battery schema."
  exit 1
fi

# git subtree split rewrites just the Battery subtree with traceable commit messages/history.
BATTERY_SHA="$(git subtree split --prefix="$SUBTREE" "$SOURCE_SHA")"
git checkout -q -B battery-standalone-main "$BATTERY_SHA"
mkdir -p .github/workflows

# Restore only Battery-owned workflow definitions; they lived outside the extracted subtree.
git show "$SOURCE_SHA":.github/workflows/starry-battery-deploy.yml |
  sed 's|central-id-v2/battery/||g' > .github/workflows/starry-battery-deploy.yml
git show "$SOURCE_SHA":.github/workflows/starry-battery-production-preflight.yml |
  sed 's|central-id-v2/battery/||g' > .github/workflows/starry-battery-production-preflight.yml

# A standalone repo should test ALL changed Battery files, not an old central-id-v2 prefix.
cat > .github/workflows/starry-battery-ci.yml <<'YAML'
name: Starry Battery standalone CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  battery-checks:
    runs-on: ubuntu-latest
    timeout-minutes: 12
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Node Engine/Gateway/R2 unit tests
        run: node --test test/*.test.mjs
      - name: SQLite schema/migration tests
        run: |
          python3 test/battery_schema_test.py
          python3 test/battery_migration_test.py
      - name: JavaScript module syntax
        run: |
          for f in engine.mjs worker.mjs archive.mjs deploy/*.mjs; do
            node --check "$f"
          done
      - name: Generate safe Preview Wrangler config
        env:
          BATTERY_TARGET: preview
          BATTERY_D1_ID: "00000000-0000-4000-8000-000000000000"
          BATTERY_D1_NAME: "battery-ci-fixture"
          BATTERY_R2_BUCKET: "starry-battery-ledger-ci-fixture"
        run: |
          node deploy/generate-config.mjs
          node --input-type=module -e "import fs from 'node:fs';const e=JSON.parse(fs.readFileSync('.wrangler.engine.generated.json'));const g=JSON.parse(fs.readFileSync('.wrangler.gateway.generated.json'));if(e.name!=='starry-battery-engine-preview'||g.name!=='starry-battery-gateway-preview'||e.vars.BATTERY_OPERATIONS_ENABLED!=='false')process.exit(1)"
          rm -f .wrangler.*.generated.json
YAML

cat > .gitignore <<'TXT'
node_modules/
.wrangler/
.wrangler.*.generated.json
.dev.vars
.dev.vars.*
.env
.env.*
*.pem
*.key
.DS_Store
TXT

cat > STANDALONE_MIGRATION.md <<EOF
# Starry Battery — standalone repository

Canonical GitHub home: https://github.com/yukidu/starry-battery

Extracted from: https://github.com/yukidu/hglobal-id
Source branch: $SOURCE_BRANCH
Exact source SHA: $SOURCE_SHA
Subtree SHA: $BATTERY_SHA

The source repo and Draft PR #37 are preserved as historical references.
The original \`central-id-v2/battery/\` subtree is now this repo's root.
The workflow paths have been updated for the standalone layout.

**Migration of GitHub source code is not a Cloudflare data migration.**
The isolated Cloudflare Battery Preview/Production Workers, D1, R2, and secrets
remain where they are. Do not delete, duplicate, reset or remigrate production D1.

## Cutover safety gates
1. GitHub Actions CI green in this new repo.
2. Reconnect GitHub connector/installations and review least-privilege access.
3. Set repo environments \`battery-preview\` and \`battery-production\` with required reviewers for Production.
4. Re-provision scoped Github Secrets/Vars via trusted channels; DO NOT copy secret values into git.
5. Verify new CI and standalone Preview deployments; keep \`production_ready=false\`.
6. Coordinate Central Auth private Service Binding across repos (same Cloudflare account initially).
7. Update all app/client refs and protected deployment workflows.
8. Only after acceptance archive/close old PR #37 and remove old Battery source through a reviewed Central-owned cleanup PR.
EOF

# Keep legacy specifications for audit, but make new code ownership unmistakable.
python3 - <<'PY'
from pathlib import Path
p = Path("README.md")
legacy = p.read_text(encoding="utf-8")
header = """# Starry Battery｜獨立 GitHub 儲存庫

**此 Repository 為 Starry Battery 程式碼新權威來源**：
https://github.com/yukidu/starry-battery

中央會員系統請至：https://github.com/yukidu/hglobal-id

此代碼由原 \`central-id-v2/battery/\` 安全抽出。以下舊 PR #37、
原路徑或正式上線說明保留為歷史資料，不代表本 Repo 的目前 PR 狀態。
**正式 Battery 交易目前未啟用；Cloudflare D1/R2/Workers 完全不因 GitHub 拆分而重建。**

參考本 Repo 的 \`STANDALONE_MIGRATION.md\` 及 \`deploy/battery-targets.json\`
核對 CI、Cloudflare 與正式啟用關卡。

---

"""
p.write_text(header + legacy, encoding="utf-8")
PY

git add .github .gitignore README.md STANDALONE_MIGRATION.md
git commit -q -m "chore: bootstrap standalone Starry Battery CI and independent release workflows"

echo "Running isolated Battery tests and migration checks..."
node --test test/*.test.mjs
python3 test/battery_schema_test.py
python3 test/battery_migration_test.py
node --check engine.mjs
node --check worker.mjs
node --check archive.mjs
node --check deploy/generate-config.mjs

echo "Pushing historical Battery subtree plus standalone workflows to empty private repo..."
git push --porcelain "$DEST_URL" HEAD:refs/heads/main
echo "VERIFY: https://github.com/yukidu/starry-battery"
echo "Source commit (historical reference): $SOURCE_SHA"
echo "New standalone HEAD: $(git rev-parse HEAD)"
echo "NO Cloudflare/Production resources were modified."
