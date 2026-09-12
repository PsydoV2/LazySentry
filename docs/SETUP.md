# Setup guide

This walks through getting LazySentry running with Docker Compose — the
supported way to run it — from nothing installed to your first scanned
repository. No git checkout needed.

## Prerequisites

- Docker and Docker Compose v2 (`docker compose version`)
- A GitHub account with at least one repository you want to scan

Nothing else needs to be installed on the host — both scanners and the
runtime are baked into the image.

## 1. Get the two files you need and configure the environment

No repo checkout required — just `docker-compose.yml` and `.env.example`:

```sh
mkdir lazysentry && cd lazysentry
curl -O https://raw.githubusercontent.com/PsydoV2/LazySentry/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/PsydoV2/LazySentry/main/.env.example
cp .env.example .env
```

Open `.env` and generate a master encryption key — this is the one value
that is not optional; the app refuses to start without it, because it's
what protects your stored GitHub token and settings:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as `APP_ENCRYPTION_KEY` in `.env`. **Back this value up
somewhere safe** (a password manager is fine) — if you lose it, the app
cannot decrypt your stored GitHub token or settings, and you'll need to
reconnect from scratch. Losing it does not destroy scan history, packages,
vulnerabilities or secrets findings; only the encrypted account/settings rows
become unreadable.

Leave the rest of `.env` alone unless you know you need it — `HOST`,
`DATABASE_PATH`, `OSV_SCANNER_PATH` and `TRUFFLEHOG_PATH` are pinned to the
correct in-container values by `docker-compose.yml` itself and ignored for
the Docker setup (they matter only for `pnpm dev`, see the main
[README](../README.md)).

## 2. Start it

```sh
docker compose up -d
```

This pulls the published image and starts two containers on one shared
database volume: `api` (the dashboard, on `http://127.0.0.1:3111`) and
`worker` (runs scans, has no exposed port). `docker compose logs -f` shows
both.

## 3. First run: create the admin account

Open **<http://127.0.0.1:3111>**. Since no admin account exists yet, you land
directly in the setup wizard.

**Step 1 — Create admin account.** Pick a username and password. This is the
_only_ way to create an account — there is no default password, no signup
page, and this step locks itself once it's done. Whoever completes this
step first owns the instance, so don't leave a freshly started,
port-exposed instance sitting unclaimed.

## 4. Connect GitHub

**Step 2 — Connect GitHub.** You need a GitHub Personal Access Token.
LazySentry only ever reads repository contents and metadata — it never
pushes, opens PRs, or writes to your repositories — so give it a token
scoped the same way:

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Repository access**: either "All repositories" or "Only select
   repositories" — pick whichever repos you want to be able to import later
   (you can always generate a new token and reconnect to widen this).
3. **Permissions**: under _Repository permissions_, set
   - **Contents: Read-only**
   - **Metadata: Read-only** (usually pre-selected, mandatory)

   Leave everything else at "No access". A classic PAT with the `repo` scope
   also works, but it grants write access LazySentry never uses — prefer a
   fine-grained token.

4. Paste the token into the wizard. LazySentry validates it against
   `GET /user` immediately and shows the detected account name and scopes.
   If it detects write scopes it didn't ask for, it says so — that's your
   cue to go generate a narrower token instead.

Once this succeeds you land on the empty dashboard: _"No projects yet —
import your first repository."_

## 5. Import a repository

**Import project** → pick one or more repositories from the list (it's the
same list your token can see, paginated and searchable) → **Import**. Each
imported repository is queued for its first scan immediately, and its card
appears right away in the `scanning` state.

A first scan clones the full repository history (TruffleHog needs it) and
can take anywhere from a few seconds to several minutes depending on
repository size. The card updates live; no need to refresh the page.

## Reading the results

- **Card color is urgency, not severity**: a verified secret always outranks
  even a critical CVE, because an active leaked credential is exploitable
  _right now_. Red > orange > blue > green.
- A **verified** secret means TruffleHog confirmed the credential still
  works by testing it live against the provider's API. Removing the line
  from the code is not enough — the secret is still in git history and still
  functions until it's rotated. The UI repeats this warning next to every
  verified finding.
- **"No lockfiles found"** on a card is not a clean bill of health — it means
  dependency scanning had nothing to check. It's shown as `completed with
warnings`, not green.

## Turning off verification or secret scanning per project

Live verification makes outbound requests from your server to third-party
APIs (e.g. an AWS key gets tested with `GetCallerIdentity`). If that's not
acceptable in your network, or you want to skip secret scanning on a given
repository entirely, both are per-project toggles under a project's
**Settings** tab.

## Updating

```sh
docker compose pull
docker compose up -d
```

Database migrations run automatically on `api` startup, against the
existing volume — no manual migration step, no data loss.

## Exposing this beyond localhost

The published port is bound to `127.0.0.1` on purpose — put a reverse proxy
(Caddy, nginx, Traefik) in front of it and terminate TLS there. Once you do,
set `HTTPS=true` in `.env` so session cookies get the `Secure` attribute,
and set `APP_ORIGIN` to your public URL if the proxy rewrites the `Host`
header (most don't need this — see the comment in `.env.example`).

## Troubleshooting

- **"LazySentry cannot start" mentioning `APP_ENCRYPTION_KEY`** — it's
  missing or malformed in `.env`. Generate one with the command in step 1.
- **A scan fails immediately with a clone/auth error** — the GitHub token
  was revoked or expired. The project's git account shows as `invalid` in
  Settings; reconnect with a fresh token.
- **Scans of a very large repository fail with what looks like a disk-space
  error** — the worker clones into an in-memory `tmpfs` sized 4 GB by default
  (`docker-compose.yml`); raise that size or bind-mount a host directory at
  `/tmp` in the `worker` service instead.
- **You copied an existing `pnpm dev` `.env` and nothing starts correctly** —
  see the note in step 1: `DATABASE_PATH` / `OSV_SCANNER_PATH` /
  `TRUFFLEHOG_PATH` from a local dev setup often point at host paths (e.g. a
  Windows path to a `.exe`), which `docker-compose.yml` deliberately
  overrides — if it still misbehaves, check `docker compose config` to see
  the environment Compose actually resolved.
