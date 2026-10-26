#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

APP_NAME="diw-advanced"
D1_NAME="osint-me"
D1_ID="46a1869b-82e5-49d4-9be2-1783eb663691"
R2_NAME="diw-evidence"
MIGRATION="migrations/0001_init.sql"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '\n[DIW BUILD] %s\n' "$*"; }

command -v node >/dev/null || fail "Node.js is required (Node 20+ recommended)."
command -v npm >/dev/null || fail "npm is required."
[[ -f package.json && -f "$MIGRATION" ]] || fail "Run this script from the project repository."

if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then export CLOUDFLARE_API_TOKEN; fi
if [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then export CLOUDFLARE_ACCOUNT_ID; fi

info "Install dependencies"
npm install

info "Check Cloudflare authentication"
npx wrangler whoami || fail "Cloudflare login failed. Locally run 'npx wrangler login', or configure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."

info "Confirm configured D1 database ID"
grep -Fq "$D1_ID" wrangler.toml || fail "wrangler.toml does not point at expected D1 ID $D1_ID."
npx wrangler d1 list

info "Ensure R2 bucket exists"
if ! npx wrangler r2 bucket list 2>/dev/null | grep -Fq "$R2_NAME"; then
  npx wrangler r2 bucket create "$R2_NAME"
else
  info "R2 bucket already exists"
fi

info "Apply idempotent D1 schema to remote database"
npx wrangler d1 execute "$D1_NAME" --remote --file="./$MIGRATION"

info "Build and type-check frontend"
npm run build

info "Deploy Worker and frontend assets"
npx wrangler deploy
info "Done"
