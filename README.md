<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo/wordmark-dark.svg">
    <img src="docs/brand/logo/wordmark-light.svg" alt="LazySentry" width="360">
  </picture>
</p>

<p align="center"><strong>Self-hosted security & maintenance dashboard for your repositories.</strong></p>

<p align="center">
  <a href="https://github.com/PsydoV2/LazySentry/actions/workflows/docker-publish.yml"><img src="https://github.com/PsydoV2/LazySentry/actions/workflows/docker-publish.yml/badge.svg" alt="Build"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/PsydoV2/LazySentry" alt="License: MIT"></a>
  <a href="https://github.com/PsydoV2/LazySentry/pkgs/container/lazysentry"><img src="https://img.shields.io/badge/ghcr.io-psydov2%2Flazysentry-blue?logo=docker" alt="Docker Image"></a>
</p>

One `docker compose up -d`, one browser tab — and for every repository you care about you can see:

- 🛡️ **Vulnerabilities** — all direct and transitive dependencies checked against the [OSV database](https://osv.dev)
- 📦 **Outdated packages** — installed vs. latest registry version, classified as patch / minor / major
- 🔑 **Leaked secrets** — working tree _and_ full git history scanned with [TruffleHog](https://github.com/trufflesecurity/trufflehog), including live verification of found credentials
- 🌱 **Project health** — declared package licenses and a commit-activity-based sustainability signal (`active` → `dead`)
- 🔍 **Fleet-wide search** — find every project with a given package/version installed (e.g. `lodash < 4.17.21`) via ⌘K, answered straight from each project's last scan — no new scan triggered, with a one-click rescan right from the result
- 📈 **Fleet trends** — two focused charts, not a KPI dashboard: severity burndown and sustainability status across every project over time
- 🔔 **Notifications & scheduling** — Discord, Slack and generic webhook channels, plus a shared cron window for automatic scans
- 👥 **Multiple accounts, multiple users** — GitHub, GitLab and Gitea (including self-hosted instances), several accounts side by side; multiple named users per instance with `admin`/`member` roles
- 📜 **Audit log** — every security-relevant action (logins, account changes, imports, scans) recorded and admin-viewable

## Contents

- [Who is this for?](#who-is-this-for)
- [Design principles](#design-principles)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Installation](#installation)
  - [Docker Compose (recommended)](#docker-compose-recommended)
  - [Configuration](#configuration)
  - [Local development](#local-development)
- [Reading the dashboard](#reading-the-dashboard)
- [Updating](#updating)
- [Contributing](#contributing)
- [License](#license)

## Who is this for?

Individual developers and small teams with **5–50 repositories**. The individual scanners already exist as excellent open-source tools, and enterprise aggregation platforms exist too — but they come with multiple services, role models, and heavyweight setup. LazySentry fills the gap in between: **one container, five minutes of setup**, and a dashboard you actually want to open.

The value is not in custom scan engines — it's in orchestration, tracking findings over time, and a UI that answers three questions for every finding without a click: _What is this? How bad is it? What do I do now?_

## Design principles

- **Your code stays on your infrastructure.** Repositories are cloned to a temporary directory inside the worker container, scanned, and deleted. No source code leaves your server.
- **Raw secrets are never stored.** TruffleHog findings are immediately reduced to a fingerprint and a masked preview (`AKIA…IFXG`). The plaintext never touches the database, logs, or error messages.
- **No false green.** A state where nothing was scanned (e.g. no lockfiles found) always looks different from a state where nothing was found.
- **Findings are tracked over time.** A vulnerability or secret is one record per project — you see when it first appeared, when it was resolved, and if it comes back.

> ⚠️ **Note on secret verification:** TruffleHog verifies found credentials by testing them live against the respective provider's API (e.g. an AWS key via `GetCallerIdentity`). This means your server makes **outbound network requests to third parties** during scans. Verification can be disabled per project if that is not acceptable in your environment.

## Architecture

A single Docker image with two processes and a SQLite database on a shared volume:

```text
┌──────────────────────┐    ┌─────────────────────┐
│  api                  │    │  worker             │
│  Fastify + React UI   │    │  scan queue loop    │
│                       │    │  + scanner binaries │
└──────────┬────────────┘    └──────────┬──────────┘
           └───────────┬─────────────────┘
                ┌───────▼──────┐
                │   SQLite     │  (volume)
                └──────────────┘
```

- **No Redis, no external queue** — jobs live in a SQLite table, polled by the worker. Zero operational overhead.
- **Scanner binaries** (osv-scanner, TruffleHog) are pinned to exact versions and baked into the image; every scan records the versions that produced it.
- **Hardened worker** — the worker processes untrusted repository content (foreign dependencies, foreign git history) and therefore runs as non-root with all capabilities dropped.
- Scan status updates reach the browser via Server-Sent Events — no client-side polling.

## Tech stack

TypeScript end to end: [Fastify](https://fastify.dev) backend, [React](https://react.dev) + [Vite](https://vite.dev) frontend, [Drizzle ORM](https://orm.drizzle.team) on SQLite, [Zod](https://zod.dev) for validation, [TanStack Query](https://tanstack.com/query) for data fetching.

```text
apps/api          Fastify server (serves API + built frontend) and the scan worker
apps/web          React frontend
packages/shared   Zod schemas & types shared between API and frontend
docs/SETUP.md     Step-by-step setup guide (Docker, GitHub token, first scan)
Dockerfile                Image build (pushed to GHCR by CI)
docker-compose.yml        Two-service setup, pulls the published image
docker-compose.build.yml  Override to build from source instead
```

## Installation

### Docker Compose (recommended)

Requires Docker and Docker Compose v2 — **no git clone needed**, just two files:

```sh
mkdir lazysentry && cd lazysentry
curl -O https://raw.githubusercontent.com/PsydoV2/LazySentry/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/PsydoV2/LazySentry/main/.env.example
cp .env.example .env
# generate a key and paste it into .env as APP_ENCRYPTION_KEY:
openssl rand -hex 32

docker compose up -d
```

This pulls the prebuilt image from GHCR (`ghcr.io/psydov2/lazysentry`) — no
local build step. Open **`http://127.0.0.1:3111`** — you land in the setup
wizard (create the admin account, then connect GitHub with a personal
access token scoped to `Contents: read` + `Metadata: read`). Additional
accounts — more GitHub accounts, GitLab (gitlab.com or self-hosted), or
Gitea (self-hosted) — can be connected afterwards from Settings, and
`admin` can add further named users. Full walkthrough, including exactly
which token permissions to grant and how to read the dashboard once it's
populated: **[docs/SETUP.md](docs/SETUP.md)**.

`docker-compose.yml` runs two containers on one image and one shared SQLite
volume — `api` (the dashboard) and `worker` (runs scans), both non-root with
all capabilities dropped and a read-only root filesystem. The published
port is bound to `127.0.0.1`; put a reverse proxy in front to expose it
beyond the host.

Prefer building from source instead of pulling the image? Clone the repo
and run `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`.

### Configuration

Everything is configured through `.env`. For the Docker Compose setup, only
the first row below is required — the rest already have sane defaults, and
`HOST`, `DATABASE_PATH`, `OSV_SCANNER_PATH` and `TRUFFLEHOG_PATH` are pinned
to the correct in-container values by `docker-compose.yml` itself.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `APP_ENCRYPTION_KEY` | **Yes** | — | 64-character hex string (32 random bytes, AES-256-GCM) that encrypts stored tokens and settings. Generate with the command above. |
| `HTTPS` | No | `false` | Set to `true` once the dashboard is served over HTTPS, so the session cookie gets the `Secure` attribute. |
| `APP_ORIGIN` | No | — | Public URL to check state-changing requests against — only needed if your reverse proxy rewrites `Host`. |
| `HOST` / `PORT` | No | `127.0.0.1` / `3111` | Bind address and port. Only relevant outside Docker; Compose sets these internally. |
| `DATABASE_PATH` | No | `./data/lazysentry.db` | SQLite file location. Only relevant outside Docker. |

See [`.env.example`](.env.example) for the full, commented list, and
[docs/SETUP.md](docs/SETUP.md) for exposing LazySentry beyond localhost.

### Local development

Requires Node.js ≥ 22 and [pnpm](https://pnpm.io).

```sh
pnpm install
cp .env.example .env        # then fill in APP_ENCRYPTION_KEY (see comments in the file)
pnpm dev                    # starts the API (127.0.0.1:3111), the scan worker and the web dev server
```

Scans are executed by the **worker**, not by the API — a queued scan stays
queued until a worker is running. In development both run in one process
(`node dist/main.js --with-worker`), which is what `pnpm dev` starts. To run
them separately, use `dev:api` and `dev:worker` in `apps/api`; production
runs `node dist/api.js` and `node dist/worker.js` as two services on the
same image.

For local development the worker needs both scanner binaries. Download a
pinned release of [osv-scanner](https://github.com/google/osv-scanner/releases)
and [TruffleHog](https://github.com/trufflesecurity/trufflehog/releases) and
point `OSV_SCANNER_PATH` / `TRUFFLEHOG_PATH` in `.env` at them (the Docker
image bakes both in). The worker warns at startup about a binary it cannot
execute; scans then record that scanner as failed instead of pretending the
repository is clean.

Other commands: `pnpm build` (all packages), `pnpm test`, `pnpm typecheck`.

## Reading the dashboard

- **Card color is urgency, not severity**: a verified secret always outranks
  even a critical CVE, because an active leaked credential is exploitable
  _right now_. Red > orange > blue > green.
- A **verified** secret means TruffleHog confirmed the credential still
  works by testing it live against the provider's API. Removing the line
  from the code is not enough — the secret is still in git history and still
  functions until it's rotated.
- **"No lockfiles found"** on a card is not a clean bill of health — it means
  dependency scanning had nothing to check. It's shown as `completed with
warnings`, not green.

See [docs/SETUP.md](docs/SETUP.md#reading-the-results) for the full breakdown of card and scan states.

## Updating

```sh
docker compose pull
docker compose up -d
```

Database migrations run automatically on `api` startup, against the
existing volume — no manual migration step, no data loss.

## Contributing

This is a young, single-maintainer project — issues and pull requests are
welcome, but for anything larger than a small fix, please open an issue
first to discuss the approach before investing time in a PR.

## License

[MIT](LICENSE)
