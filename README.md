# DIW Advanced — Digital Investigation Workbench

A Cloudflare Workers-first workspace for authorized digital forensics and public-source OSINT. It is designed for case tracking, evidence integrity, IOC notes, timelines, and traceable reports—not covert tracking or unauthorized access.

## Architecture

- **Cloudflare Workers**: API and static asset delivery.
- **D1**: cases, evidence metadata, observations, timeline events, and audit records.
- **GitHub Private Repository** (`hehebacon/diw-evidence-vault`): evidence file storage through the GitHub Contents API. Downloads are proxied through the authenticated Worker.
- **Cloudflare Access**: required identity gate in front of the app. Configure an Access application for the deployed hostname and allow only intended users. The Worker also expects a verified Access JWT and validates its signature/audience.

## Initial features

- Overview dashboard and case list/create.
- Case-scoped evidence upload (10 MiB limit), SHA-256 digest, metadata, and audit events.
- D1 schema and parameterized queries.
- Minimal responsive dark UI.
- Security-first deployment notes and explicit scope limits.

## Requirements

Node.js 20+, npm, a Cloudflare account with Workers and D1, and a fine-grained GitHub token scoped to the private `diw-evidence-vault` repository with Contents read/write permission.

## Setup

1. Install dependencies: `npm install`.
2. Configure the existing D1 database in `wrangler.toml`; the evidence repository is configured as `hehebacon/diw-evidence-vault`.
3. Apply schema: `npx wrangler d1 execute diw-db --remote --file=./migrations/0001_init.sql`.
4. Configure Worker secrets/vars: `ACCESS_TEAM_DOMAIN` (e.g. `https://team-name.cloudflareaccess.com`), `ACCESS_AUD` (Access application's AUD tag), and `ADMIN_EMAILS` (comma-separated allowlist). Set these using `wrangler secret put` where appropriate; do not commit real values.
5. Create a Cloudflare Access self-hosted application for the Worker hostname. Require identity authentication and restrict access to the intended users. The API rejects requests without a valid Access JWT.
6. Add a GitHub Actions secret named `DIW_EVIDENCE_GH_TOKEN` containing a fine-grained token limited to `diw-evidence-vault` with Contents read/write access. The deploy workflow copies it to the Worker secret.
7. `npm run build` then `npm run deploy`.

## Security notes

- Do not put secrets or real evidence in GitHub.
- Keep `diw-evidence-vault` private and use a fine-grained token scoped only to that repository. Git history may retain prior versions; consider evidence sensitivity and retention before uploading.
- Limit access through Cloudflare Access and use a strong account MFA policy.
- Uploads are capped at 10 MiB in this starter; large PCAP processing should use a dedicated, isolated processing pipeline rather than a request handler.
- SHA-256 detects byte changes relative to a recorded digest; by itself it does not prove who collected a file or that its contents are truthful.
- The starter stores evidence metadata and raw objects, not parsed PCAP contents. Analyze only data you are authorized to handle.
- Do not use this project to access accounts, devices, or private data without permission.

## Status

Starter implementation. Run tests and review Cloudflare bindings/secrets before using real case data.

## One-command build and automatic Cloudflare deploy

Run locally from the repository:

```bash
bash build.sh
```

The script installs dependencies, checks Cloudflare authentication, verifies the configured D1 ID, verifies the configured private GitHub evidence repository, applies the idempotent SQL schema to remote D1, builds/type-checks the frontend, and deploys the Worker and static assets.

Configured D1 ID: `46a1869b-82e5-49d4-9be2-1783eb663691`.

### GitHub Actions auto-deploy

Add these repository secrets under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN` — token with appropriate Workers and D1 permissions.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `ACCESS_TEAM_DOMAIN` — e.g. `https://your-team.cloudflareaccess.com`.
- `ACCESS_AUD` — Cloudflare Access application AUD tag.
- `ADMIN_EMAILS` — comma-separated allowed admin email addresses.
- `DIW_EVIDENCE_GH_TOKEN` — fine-grained GitHub token restricted to `hehebacon/diw-evidence-vault`, Contents read/write only.

After secrets are configured, changes to `build.sh`, app/Worker code, migrations, or deployment configuration on `main` trigger the workflow, which runs `bash build.sh`. You can also run it manually from **Actions → Build and deploy DIW Advanced → Run workflow**.

A change to `build.sh` runs on GitHub's hosted runner; it does not execute a shell on your personal computer. Keep the evidence repository private and never commit API tokens. Add future schema changes as new migration files rather than modifying an already-applied migration.
