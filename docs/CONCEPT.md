# Security & Maintenance Hub — Produktkonzept & Implementierungs-Spec

> **Status:** v4 — laufende Spec nach abgeschlossenem MVP, wird bei Bedarf aktualisiert statt neu eingefroren (siehe 2.2)
> **Zielgruppe dieses Dokuments:** Entwicklungs-Agents und Entwickler, die an diesem Projekt arbeiten.
> **Sprache der Anwendung:** Englisch (alle UI-Strings, Logs, Doku, Commit-Messages).
> **Sprache dieses Dokuments:** Deutsch.

---

## 0. Tech-Stack (entschieden)

**Fastify + React, durchgehend TypeScript.**

| Bereich       | Wahl                                                                  | Begründung                                                                         |
| ------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Backend       | Fastify (TypeScript, ESM)                                             | Schlank, gute Plugin-Architektur, schnelles Schema-Validation-Handling             |
| Frontend      | React + Vite (TypeScript)                                             | Build wird vom Fastify-Server statisch ausgeliefert — ein Image, ein Port          |
| Data Fetching | TanStack Query (React Query)                                          | Geteilter Cache über Komponenten, Query-Keys nach Ressource; siehe 8.4             |
| Validierung   | Zod                                                                   | Ein Schema für API-Validierung _und_ abgeleitete Types                             |
| DB-Zugriff    | Drizzle ORM + `better-sqlite3`                                        | Migrations inklusive, SQLite→PostgreSQL ohne Neuschreibung, keine Codegen-Pipeline |
| Queue         | **Eigene Job-Tabelle in SQLite** — kein BullMQ, kein Redis            | siehe unten                                                                        |
| Auth          | `@fastify/session` + `@fastify/cookie`, Passwort-Hashing mit `argon2` |                                                                                    |
| Härtung       | `@fastify/helmet`, `@fastify/rate-limit`                              |                                                                                    |
| Tests         | Vitest                                                                |                                                                                    |
| Repo-Layout   | pnpm-Workspace: `apps/api`, `apps/web`, `packages/shared`             | Typen für API-Responses liegen in `shared` und werden von beiden Seiten importiert |

### 0.1 Warum keine BullMQ/Redis-Queue

BullMQ braucht Redis, Redis braucht einen zweiten Container. Das steht im direkten Widerspruch zum Kernversprechen „ein `docker compose up`, fünf Minuten Setup". Die Last rechtfertigt es auch nicht: Scans laufen mit Concurrency 1, ein Nutzer hat typischerweise unter fünfzig Projekte, und die Queue-Tiefe erreicht selten zweistellige Werte.

Stattdessen eine `jobs`-Tabelle und ein Worker-Prozess, der im Sekundentakt pollt:

```
jobs
  id, type ('scan'), payload (json), status ('pending'|'running'|'done'|'failed'),
  attempts, max_attempts, locked_at, locked_by, created_at, finished_at,
  error_message
```

Beim Worker-Start werden verwaiste `running`-Jobs (Prozess abgestürzt, `locked_at` älter als das Scan-Timeout) auf `pending` zurückgesetzt oder nach Überschreiten von `max_attempts` als `failed` markiert. Das ist bewusst wenig Code und hat null Betriebskosten für den Endnutzer. Wenn später wirklich horizontal skaliert werden muss, ist der Wechsel auf BullMQ ein isoliertes Refactoring hinter demselben Interface.

### 0.2 Prozessmodell

Ein Image, zwei Entrypoints:

```
node dist/api.js      → HTTP-Server, liefert API + React-Build
node dist/worker.js   → Poll-Loop, führt Scans aus
```

In `docker-compose.yml` sind das zwei Services auf demselben Image mit unterschiedlichem `command` und geteiltem Volume für die SQLite-Datei. Für ganz kleine Setups kann optional ein kombinierter Modus (`node dist/main.js --with-worker`) angeboten werden, der beides im selben Prozess startet.

### 0.3 Node-spezifische Fallstricke bei den Scannern

- **Scanner-Output ist unterschiedlich strukturiert.** TruffleHog liefert mit `--json` **NDJSON** — ein JSON-Objekt pro Zeile, gestreamt. OSV-Scanner liefert mit `--format json` **ein** zusammenhängendes JSON-Dokument. Der TruffleHog-Output wird zeilenweise über `readline` auf dem stdout-Stream verarbeitet und **nicht** komplett gepuffert; bei großen Repos wären das sonst hunderte Megabyte im Heap.
- **Niemals `shell: true`.** `spawn('git', ['clone', url, dir])` mit Argument-Array, nie String-Interpolation. Die Clone-URL enthält potenziell einen Token, und Repo-Namen kommen aus einer externen API.
- **Token nicht in die Kommandozeile.** Statt `https://<token>@github.com/...` besser ein `GIT_ASKPASS`-Skript oder `git -c credential.helper=` mit Übergabe per Umgebungsvariable. Argumente eines Prozesses sind auf dem Host für jeden lesbar, der `ps` ausführen kann.
- **Timeouts und Abbruch.** Jeder Subprozess bekommt ein hartes Timeout und wird per `AbortController` bzw. `child.kill('SIGKILL')` beendet. Ein hängender TruffleHog-Prozess darf die Queue nicht dauerhaft blockieren.
- **`process.on('exit')` reicht nicht zum Aufräumen.** Das temporäre Verzeichnis wird in einem `finally`-Block gelöscht, zusätzlich räumt der Worker beim Start verwaiste `/tmp/scan-*` auf.

---

## 1. Vision

Ein vollständig selbsthostbares Security- und Wartungs-Dashboard für einzelne Entwickler und kleine Teams. Ein `docker compose up -d`, ein Browser-Tab, und man sieht für alle eigenen Repositories: welche Abhängigkeiten Sicherheitslücken haben, welche veraltet sind, und ob irgendwo Zugangsdaten im Code oder in der Git-Historie liegen.

**Abgrenzung zum Markt.** Die einzelnen Scanner existieren bereits als exzellente Open-Source-Tools. Aggregations-Plattformen existieren ebenfalls, sind aber auf Enterprise-Teams zugeschnitten und entsprechend schwergewichtig (mehrere Services, Rollenmodelle, SLA-Tracking). Die Lücke, die dieses Projekt füllt: **ein Container, fünf Minuten Setup, für Leute mit fünf bis fünfzig Repositories.** Der Wert liegt nicht in eigenen Scan-Engines, sondern in Orchestrierung, Zustandsverfolgung über die Zeit und einer UI, die man freiwillig öffnet.

**Datenhoheit.** Bislang verlässt kein Quellcode die Infrastruktur des Nutzers. Diese Aussage muss präzisiert werden, sobald KI-Features dazukommen — siehe Abschnitt 9.

---

## 2. Scope

### 2.1 MVP (Phase 1–2, das hier wird gebaut)

1. **Dependency Tracking & CVE Checking** — Abgleich aller direkten und transitiven Abhängigkeiten gegen die OSV-Datenbank.
2. **Version Auditing** — Gegenüberstellung installierte Version ↔ aktuellste Version aus der jeweiligen Package-Registry, klassifiziert nach patch / minor / major.
3. **Secret Detection** — Scan von Arbeitsverzeichnis und vollständiger Git-Historie mit TruffleHog, inklusive Live-Verifikation gefundener Credentials.
4. **GitHub-Integration** — Verbinden eines Accounts per Personal Access Token, Import einzelner Repositories.
5. **Dashboard** — Projekt-Cards im Grid mit Kurzüberblick, Detailansicht pro Projekt.

### 2.2 Stand nach dem MVP

Das MVP (2.1) ist abgeschlossen. Bis 2026-09-18 wurde jede Erweiterung darüber hinaus einzeln in diesem Dokument freigegeben, bevor ein Agent damit anfangen durfte — sinnvoll, solange unklar war, wie viel über das MVP hinaus überhaupt gewünscht ist. Diese Unsicherheit besteht nicht mehr: der Großteil der ursprünglichen Nicht-Ziele ist inzwischen umgesetzt. Ab jetzt gilt normale iterative Weiterentwicklung — ein neues Feature braucht keinen eigenen, dokumentierten Freigabe-Abschnitt mehr, bevor daran gearbeitet werden darf. Diese Liste wird bei Bedarf aktualisiert, aber nicht mehr pro Feature neu eröffnet.

**Umgesetzt:**

- **Multi-Provider & Mehrfach-Accounts.** GitHub, GitLab und Gitea (inkl. selbst gehosteter Instanzen, `git_accounts.base_url`, `null` = gitlab.com; bei Gitea ist die Basis-URL immer Pflicht, da es kein öffentliches SaaS-Default gibt — `provider.baseUrlRequired`), mehrere Accounts gleichzeitig verbunden, auch mehrere desselben Providers. Jedes Projekt hängt über `git_account_id` an genau einem Account; Scans nutzen ausschließlich dessen Token. Provider-Interface (`apps/api/src/providers/types.ts`): `validateToken`/`listRepositories` nehmen optional eine Basis-URL, jeder Provider deklariert `cloneAuth(token)` für die HTTP-Basic-Auth-Credentials beim Clone — meist ein fixer Platzhalter als Username und der Token als Passwort (GitHub: `x-access-token`, GitLab: `oauth2`), Gitea kehrt das dokumentiert um (Token als Username, `x-oauth-basic` als festes Passwort, siehe docs.gitea.com/development/api-usage). Clone-Auth ist Host-basiert (`git config http.<origin>/.extraheader`), nicht hartcodiert auf `github.com`. Löschen eines Git-Accounts ist blockiert (409), solange noch Projekte daran hängen. Bitbucket ist weiterhin nicht implementiert — die Registry in `apps/api/src/providers/index.ts` macht das Hinzufügen zu einer neuen Datei, aber niemand hat danach gefragt.
- **Mehrbenutzerbetrieb, zwei Rollen.** Mehrere benannte Nutzer-Accounts auf derselben Instanz statt genau einem Admin, kein Self-Signup — neue Nutzer werden ausschließlich von einem `admin` in den Settings angelegt (Username + initiales Passwort). `admin` darf zusätzlich zu allem, was `member` darf: Git-Accounts verbinden/reconnecten/löschen, Nutzer anlegen/deaktivieren/Rolle ändern. `member` darf: Projekte importieren/ansehen/löschen, Scans auslösen/ansehen, Findings einsehen/suppressen, Projekt-Settings ändern, Notification-/Schedule-Settings ändern. Kein Team-Konzept: alle Nutzer einer Instanz teilen sich dieselben Projekte und Git-Accounts, keine projektbezogene Zugriffs-Isolation.
- **Notifications.** Mehrere Kanäle gleichzeitig, auch mehrere desselben Typs — Discord, Slack und ein generischer Webhook (`apps/api/src/notifications/`, Tabelle `notification_channels`). Plattform-Interface analog zum Git-Provider-Muster; ein weiterer Kanal ist eine neue Datei, keine Änderung an bestehenden.
- **Cron-Scheduling.** Ein global geteiltes Zeitfenster für alle Projekte, verankert an einer Uhrzeit (und für „wöchentlich" zusätzlich einem Wochentag) statt nur „alle N Stunden seit dem letzten Scan pro Projekt" (`apps/api/src/scan/schedule.ts`).
- **Suppression-Workflow.** Eigenes `suppressed_at`-Feld pro Finding, unabhängig vom Reconciliation-Status (4.1) — ein stummgeschaltetes Finding bleibt stummgeschaltet, auch über künftige Scans hinweg, bis es explizit wieder aktiviert wird.
- **License-Anzeige pro Paket.** Deklarierte Lizenz aus der jeweiligen Registry (npm `license`-Feld, Packagist `composer.json`-Metadaten, PyPI Klassifiers/Metadata, crates.io `license`-Feld), wie die Versions-Daten (5.3) 24h gecacht, als zusätzliche Spalte in der Dependencies-Tabelle (8.2). Feld `packages.license`: Rohwert bzw. `unknown`, wenn die Registry nichts liefert oder der Ausdruck nicht geparst werden kann — nicht raten. Rein informativ, **kein** Allow-/Denylist-Policy-Engine, keine automatische Copyleft/Permissive-Klassifizierung.
- **Sustainability-/Dead-Project-Score.** Rein aktivitätsbasiert, keine Bewertung von Codequalität oder "Wichtigkeit". Signal ist das tatsächliche letzte Commit-Datum des geklonten `HEAD` (`git log -1 --format=%cI`, direkt nach dem Clone gelesen — kostet keinen zusätzlichen Provider-API-Call und ist genauer als das Provider-`updated_at`, das auch bei Issues/Stars springt), gespeichert als `projects.last_commit_at`. Daraus wird serverseitig (`packages/shared`, `sustainabilityStatusFor`) ein Status abgeleitet: `active` (≤180 Tage), `aging` (≤365), `stale` (≤730), `dead` (>730), `unknown` (noch kein erfolgreicher Clone). Rein informativ und **nicht** Teil der Card-Farbe/Dringlichkeits-Sortierung (8.1 bleibt ausschließlich Severity-getrieben) — im Grid nur als neutrales Pill-Badge ab `stale`, in der Detailansicht (Overview) immer als Fakt "Last commit vor X" neben "Last scan". Details: 4 (Datenmodell), 5.1.
- **Audit-Log.** Tabelle `audit_log` protokolliert sicherheitsrelevante, zustandsändernde Aktionen (Login/Login-Fehlschlag, Nutzer anlegen/Rolle ändern/löschen, Git-Account verbinden/reconnecten/löschen, Projekt importieren/löschen, Scan auslösen/abbrechen, Settings- und Notification-Channel-Änderungen) mit Akteur (`user_id` + Username-Snapshot, da der User später gelöscht sein kann), IP, Ressource und einem kleinen `meta`-JSON. Bewusst **nicht** protokolliert: Findings suppressen/unsuppressen (zu hochfrequent, kein Sicherheitswert) und reine GET-Requests. Kein automatisches Pruning in v1 — bei den in 1. beschriebenen Repo-Zahlen (5–50) bleibt die Tabelle klein; falls das je zum Problem wird, ist das ein neues, eigenes Ticket. Admin-only einsehbar unter `GET /api/audit-log`, paginiert. Details: 4, 6.2.
- **Checksum-Verifikation der Scanner-Binaries.** Der Worker hasht `osv-scanner` und `trufflehog` beim Start (SHA-256, PATH-Auflösung in reinem JS, kein Subprozess) und vergleicht gegen in `apps/api/src/scanner/versions.ts` gepinnte Werte (`SCANNER_CHECKSUMS`, neben `SCANNER_VERSIONS`). Eine Abweichung vom gepinnten Wert lässt den Worker mit einer klaren Fehlermeldung beenden (fail-closed — dieselbe Härte wie der fehlende `APP_ENCRYPTION_KEY` in `config.ts`), da eine Abweichung ein Kompromittierungs-Indikator ist, kein normaler Betriebszustand (Bedrohungsmodell 6.1). Ist für eine Version (noch) kein Checksum gepinnt, läuft der Worker weiter, aber mit einer sichtbaren `WARNING`-Zeile im Log — **kein falsches Grün** (11.), das stille Fehlen einer Prüfung sieht anders aus als eine bestandene. `apps/api/src/scripts/print-scanner-checksums.ts` berechnet die aktuellen Hashes (z. B. per `docker run --rm --entrypoint node <image> api/dist/scripts/print-scanner-checksums.js`) im fertig gebauten Image, fertig zum Einfügen in `versions.ts` — dieser Schritt gehört in den Release-Prozess, sobald `SCANNER_VERSIONS`/das Dockerfile-Pinning sich ändert. Details: 6.2.

**Weiterhin offen** (kein Punkt hier braucht eine Einzelfreigabe mehr, aber auch keiner gilt als angefangen, bis tatsächlich daran gearbeitet wird):

- PostgreSQL (SQLite reicht weiterhin; die Abstraktion erlaubt den späteren Wechsel)
- SBOM-Export (CycloneDX)
- Echte Teams/Projekt-Gruppen, feingranulare Permissions über `admin`/`member` hinaus, Invite-per-E-Mail
- Incoming Webhooks / Event-getriebene Scan-Trigger, Tunneling
- EPSS- und CISA-KEV-Anreicherung zur Priorisierung
- KI-Layer: Triage-Assistent, Reachability-Einschätzung, Upgrade-Assistent — Leitplanken gelten bereits verbindlich, siehe Abschnitt 9

---

## 3. Architektur

### 3.1 Container

```
┌──────────────────────┐    ┌─────────────────────┐
│   api                │    │   worker            │
│   Fastify            │    │   Poll-Loop         │
│   + React-Build      │    │   + Scanner-Binaries│
└──────────┬───────────┘    └──────────┬──────────┘
           │                           │
           └───────────┬───────────────┘
                       │
                ┌──────▼───────┐
                │  SQLite      │  (Volume)
                └──────────────┘
```

Zwei Prozesse, ein Image (siehe Abschnitt 0.2). Der Worker arbeitet Scans **sequenziell** ab (Concurrency 1), weil Scans CPU-, RAM- und plattenintensiv sind und die Host-Infrastruktur des Nutzers nicht in die Knie gehen darf.

Kein separater Frontend-Container: Der Vite-Build landet im Image und wird von Fastify über `@fastify/static` ausgeliefert, mit SPA-Fallback auf `index.html`. Ein Port, ein Reverse-Proxy-Eintrag.

### 3.2 Scanner-Binaries

Beide Scanner sind statische Binaries und werden per Multi-Stage-Build ins Image kopiert. **Versionen auf konkrete Tags pinnen**, niemals `latest` — der JSON-Output ändert sich sonst unangekündigt zwischen Builds.

```dockerfile
COPY --from=ghcr.io/trufflesecurity/trufflehog:3.x.y /usr/bin/trufflehog /usr/local/bin/
COPY --from=ghcr.io/google/osv-scanner:v2.x.y /osv-scanner /usr/local/bin/
```

Die konkreten Versionen gehören in eine zentrale Konstante im Code, damit sie in der UI („Scanned with TruffleHog 3.x.y") angezeigt und in `scans.scanner_versions` protokolliert werden können. Ein Finding ohne die Scanner-Version, die es erzeugt hat, ist nicht reproduzierbar.

### 3.3 Persistenz

SQLite als Default. Sämtlicher Datenbankzugriff läuft über eine ORM-/Query-Builder-Schicht, damit der spätere Wechsel auf PostgreSQL keine Neuschreibung wird. Migrations ab dem ersten Commit — Self-Hosted-Nutzer aktualisieren Container, und ein Update, das die DB zerstört, kostet das Projekt seine Nutzer.

### 3.4 API-Konventionen

**Fehler.** Jede Fehler-Response hat dieselbe Form:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

HTTP-Status passend zum Fehlertyp: `400` Validierung, `401` nicht eingeloggt, `403` fehlende Berechtigung, `404` nicht gefunden, `409` Konflikt (z. B. Repo bereits importiert), `500` Serverfehler. Ein zentraler `setErrorHandler` in Fastify fängt alles ab und mappt auch Zod-Validierungsfehler in dieses Format — Fastifys Default-Ajv-Fehlerform wird nirgends direkt durchgereicht.

**Erfolg.** Reines Datenobjekt oder Array, keine Envelope wie `{ "data": ... }`. Das hält die aus Zod abgeleiteten Types in `packages/shared` direkt als Response-Type nutzbar, ohne Unwrap auf der Frontend-Seite.

**Routen.** `/api/<resource>` im Plural, Verschachtelung wo inhaltlich sinnvoll: `/api/projects/:id/scans`, `/api/projects/:id/vulnerabilities`, `/api/projects/:id/secrets`.

### 3.5 Live-Updates für Scan-Status (SSE)

Client-seitiges Polling würde bedeuten: jeder offene Browser-Tab fragt eigenständig die API, unabhängig davon, wie viele Nutzer gleichzeitig zuschauen. Da `api` und `worker` getrennte Prozesse sind, kann der Worker nicht direkt an offene HTTP-Verbindungen pushen — die Lösung liegt auf der API-Seite:

1. Der `api`-Prozess pollt intern **die eigene SQLite-Datei** jede Sekunde auf Änderungen an `scans.status` und `jobs.status` (embedded DB, kein Netzwerk-Overhead, vernachlässigbare Last).
2. Erkannte Änderungen werden über einen Endpoint `GET /api/events` als Server-Sent Events an alle verbundenen Clients gepusht.
3. Nachrichtentypen: `scan.started`, `scan.completed`, `scan.failed`, jeweils mit `{ projectId, scanId, status }` als Payload.
4. Frontend: ein `EventSource` auf `/api/events`, das bei relevanten Events gezielt `queryClient.invalidateQueries(['project', projectId])` auslöst statt eines globalen Refetch.

`EventSource` reconnected im Browser automatisch bei Verbindungsabbruch; ein zusätzlicher Fallback ist für das MVP nicht nötig. Damit bleibt der Client dumm (nur ein `invalidateQueries` pro Event) und die gesamte Polling-Logik sitzt an einer einzigen Stelle im `api`-Prozess statt in jedem Browser-Tab.

---

## 4. Datenmodell

```
users
  id, username, password_hash, role ('admin'|'member'), created_at, last_login_at
  -- mehrere Accounts, keine Team-Zuordnung (2.2): admin verwaltet Git-Accounts
  -- und Nutzer, member alles andere

settings
  key, value_encrypted, is_secret

git_accounts
  id, provider ('github'|'gitlab'), base_url (null = provider's public SaaS),
  username, token_encrypted, token_scopes, status ('valid'|'invalid'),
  connected_at, last_validated_at
  -- mehrere Accounts gleichzeitig, auch mehrere desselben Providers (2.2)

projects
  id, git_account_id, provider_repo_id, name, full_name,
  default_branch, clone_url, is_private, added_at,
  scan_secrets_enabled (bool, default true),
  verify_secrets_enabled (bool, default true),
  -- denormalisierte Zähler für das Dashboard-Grid:
  last_scan_id, last_scan_at, last_scan_status,
  count_vuln_critical, count_vuln_high, count_vuln_medium, count_vuln_low,
  count_secrets_verified, count_secrets_unknown,
  count_outdated_major, count_outdated_minor, count_outdated_patch,
  last_scanned_commit_sha,
  last_commit_at  -- committer date of the cloned HEAD, read straight out of
                  -- the clone (git log -1 --format=%cI), not a provider API
                  -- call; feeds sustainabilityStatusFor() (2.2)

scans
  id, project_id, status, started_at, finished_at,
  commit_sha, trigger ('manual'|'scheduled'),
  scanner_versions (json), error_code, error_message,
  duration_ms

packages
  id, scan_id, ecosystem, name, version_installed,
  version_latest, update_type ('none'|'patch'|'minor'|'major'|'unknown'),
  is_direct (bool), source_file

vulnerabilities
  id, project_id, package_id, osv_id, aliases (json, z.B. CVE-IDs),
  severity, cvss_score, summary, fixed_version, published_at,
  fingerprint, status ('open'|'resolved'),
  first_seen_scan_id, last_seen_scan_id, resolved_scan_id, resolved_at
  -- UNIQUE(project_id, fingerprint)

secrets
  id, project_id, detector_type, file_path, commit_sha, line,
  is_verified (bool), redacted, fingerprint,
  status ('open'|'resolved'), commit_author, commit_date,
  first_seen_scan_id, last_seen_scan_id, resolved_scan_id, resolved_at
  -- UNIQUE(project_id, fingerprint)
```

```
audit_log
  id, user_id (nullable, ON DELETE SET NULL), username (Snapshot zur Aktionszeit,
  überlebt eine spätere User-Löschung), ip (nullable),
  action (z.B. 'auth.login', 'user.role_change', 'project.delete', 'scan.trigger' — siehe 2.2),
  resource_type (nullable), resource_id (nullable),
  meta (json, nullable — kleiner Kontext wie {fullName} oder {from, to}, nie Secrets/Tokens),
  created_at
```

### 4.1 Fingerprints und Reconciliation

Jedes Finding bekommt einen Fingerprint, der über die Projektlaufzeit stabil bleibt:

- **Vulnerability:** `sha256(ecosystem + package_name + osv_id)`
- **Secret:** `sha256(detector_type + file_path + commit_sha + raw_secret)`

**Findings werden pro Projekt eindeutig gehalten, nicht pro Scan neu angelegt.** `vulnerabilities` und `secrets` haben `UNIQUE(project_id, fingerprint)`. Am Ende jedes Scans läuft eine Reconciliation in einer Transaktion:

1. Für jeden Fund aus dem aktuellen Scan: Upsert über `(project_id, fingerprint)`. Existiert die Zeile bereits → `last_seen_scan_id` aktualisieren, `status` bleibt bzw. wird auf `open` zurückgesetzt, falls sie zwischenzeitlich `resolved` war (das Secret ist wieder da). Existiert sie nicht → neue Zeile, `first_seen_scan_id = last_seen_scan_id = aktueller Scan`.
2. Danach: alle Zeilen dieses Projekts mit `status='open'` und `last_seen_scan_id ≠ aktueller Scan` → `status='resolved'`, `resolved_scan_id`, `resolved_at` setzen.

Das verhindert unbegrenzt wachsende Duplikate über viele Scans hinweg und liefert nebenbei die Grundlage für „offen seit X Tagen" in der UI sowie für die spätere Notification-Logik („nur bei neu aufgetauchten Findings alarmieren").

### 4.2 Verschlüsselung

`token_encrypted` und `value_encrypted` werden mit AES-256-GCM verschlüsselt. Der Master-Key kommt aus einer Umgebungsvariable (`APP_ENCRYPTION_KEY`), niemals aus der Datenbank. Fehlt die Variable beim Start, verweigert die Anwendung den Start mit einer klaren Fehlermeldung und einem Hinweis, wie man einen Key generiert.

### 4.3 Die wichtigste Regel im gesamten Projekt

**Das rohe Secret wird niemals persistiert.** TruffleHog liefert im JSON-Output den Klartext-Fund. Der Worker berechnet daraus Fingerprint und Redaction und verwirft den Rest sofort. In die DB kommt ausschließlich:

```
redacted  →  "AKIA…IFXG"   (erste 4 + letzte 4 Zeichen, Rest maskiert)
```

Bei Secrets kürzer als 12 Zeichen wird vollständig maskiert. Der Klartext darf außerdem in keinem Log, keiner Exception-Message und keinem Debug-Output landen. Eine Datenbank, die alle Secrets aller überwachten Repos im Klartext hält, ist ein wesentlich lohnenderes Angriffsziel als die Repos selbst.

---

## 5. Scan-Pipeline

### 5.1 Ablauf

```
1. Scan-Job aus Queue holen, status = 'running'
2. Clone:      git clone https://<token>@github.com/<full_name> /tmp/scan-<uuid>
               → volle Historie, KEIN --depth 1 (TruffleHog braucht sie)
               → direkt danach: git log -1 --format=%cI HEAD liest das Committer-
                 Datum von HEAD für projects.last_commit_at (2.2, Sustainability-
                 Score) — kein zusätzlicher Netzwerk-Call, die Historie liegt schon da
3. Secrets:    trufflehog git file:///tmp/scan-<uuid> \
                 --json --results=verified,unknown
4. Deps+CVEs:  osv-scanner scan source -r /tmp/scan-<uuid> \
                 --format json --all-packages
5. Versionen:  Registry-Lookup für jedes Paket aus Schritt 4
6. Ergebnisse persistieren, Reconciliation gegen bestehende Findings (siehe 4.1), Zähler auf projects aktualisieren
7. rm -rf /tmp/scan-<uuid>   (auch im Fehlerfall — finally-Block!)
8. status = 'completed' | 'failed'
```

### 5.2 Warum `--all-packages`

OSV-Scanner liefert mit diesem Flag nicht nur die verwundbaren Pakete, sondern das vollständige Inventar inklusive transitiver Abhängigkeiten. Ein einziger Aufruf deckt damit sowohl Feature 1 (CVE-Checking) als auch die Datengrundlage für Feature 2 (Version Auditing) ab.

### 5.3 Version Auditing

CVE-Status und Veraltet-Status sind zwei verschiedene Dinge. OSV sagt „verwundbar", nicht „veraltet". Die aktuellste Version kommt direkt aus den Registries:

| Ecosystem | Endpoint                                                |
| --------- | ------------------------------------------------------- |
| npm       | `https://registry.npmjs.org/<package>/latest`           |
| Packagist | `https://repo.packagist.org/p2/<vendor>/<package>.json` |
| PyPI      | `https://pypi.org/pypi/<package>/json`                  |
| crates.io | `https://crates.io/api/v1/crates/<package>`             |
| Go        | `https://proxy.golang.org/<module>/@latest`             |

Für das MVP genügen npm und Packagist; die übrigen werden über dasselbe Interface nachgerüstet.

**Caching ist Pflicht.** Registry-Antworten pro `ecosystem + package` für 24 Stunden cachen, sonst erzeugt jeder Scan hunderte identischer HTTP-Requests. Die Klassifizierung in patch / minor / major erfolgt über Semver-Vergleich; nicht-semver-konforme Versionen werden als `unknown` markiert statt zu raten.

### 5.4 Inkrementelles Secret-Scanning

Beim ersten Scan wird die vollständige Historie geprüft. Ab dem zweiten Scan wird `--since-commit=<last_scanned_commit_sha>` gesetzt, sodass nur neue Commits verarbeitet werden. Ohne das skaliert der Nightly-Scan über mehrere Repos nicht.

Wichtig: Findings aus früheren Scans bleiben dabei erhalten und werden nicht als „resolved" markiert, nur weil der aktuelle inkrementelle Scan sie nicht erneut gemeldet hat. Ein Secret in der Historie verschwindet nicht durch neue Commits. Ein „full rescan"-Button in den Projekt-Settings setzt `last_scanned_commit_sha` zurück.

### 5.5 Verifikation von Secrets

TruffleHog verifiziert gefundene Credentials, indem es sie live gegen die API des jeweiligen Anbieters testet — ein AWS-Key etwa per `GetCallerIdentity`. Ein verifiziertes Ergebnis bedeutet: dieser Schlüssel funktioniert **jetzt gerade**.

Das erzeugt drei UI-Zustände, nicht zwei:

| Zustand    | Bedeutung                                                                   | UI                     |
| ---------- | --------------------------------------------------------------------------- | ---------------------- |
| `verified` | Credential ist aktiv und nutzbar                                            | Rot, höchste Priorität |
| `unknown`  | Fund erkannt, aber kein Verifier verfügbar oder Verifikation fehlgeschlagen | Gelb, manuelle Prüfung |
| —          | `--only-verified` würde die gelbe Kategorie verwerfen                       | **nicht verwenden**    |

Deshalb `--results=verified,unknown`.

**Zu dokumentierende Konsequenz:** Verifikation erzeugt ausgehende Netzwerk-Requests vom Server des Nutzers zu Drittanbietern. Das gehört in die README und muss pro Projekt abschaltbar sein (`verify_secrets_enabled` → `--no-verification`). In manchen Netzen ist das nicht erwünscht oder nicht erlaubt.

### 5.6 Exit-Codes

Beide Tools nutzen Exit-Codes semantisch. Ein Wrapper, der pauschal „alles außer 0 ist ein Fehler" oder „alles außer 1 ist Erfolg" annimmt, produziert falsche grüne Haken:

| Tool        | Code | Bedeutung                         | Behandlung                                          |
| ----------- | ---- | --------------------------------- | --------------------------------------------------- |
| osv-scanner | 0    | keine Vulnerabilities             | `completed`                                         |
| osv-scanner | 1    | Vulnerabilities gefunden          | `completed` (Normalfall!)                           |
| osv-scanner | 128  | keine Pakete/Lockfiles gefunden   | `completed_empty` — **nicht** als „sauber" anzeigen |
| trufflehog  | 0    | nichts gefunden                   | `completed`                                         |
| trufflehog  | 183  | verifizierte Credentials gefunden | `completed` (Normalfall!)                           |

Alle übrigen Codes gelten als Scan-Fehler mit gespeichertem `error_message`.

### 5.7 Fehlerzustände

Ein Repository ohne erkennbare Lockfiles ist der häufigste Fall und kein Fehler. Die UI muss ihn eigenständig darstellen: _„No supported lockfiles found — dependency scanning skipped. Secret scanning completed."_ Ein Scan kann also teilweise erfolgreich sein, und das Datenmodell bildet das über getrennte Status pro Scanner ab.

Weitere zu behandelnde Fälle: Clone-Fehler (Token abgelaufen, Repo gelöscht, Rechte entzogen), Timeout bei sehr großen Repos, kein Plattenplatz mehr. Jeder erzeugt eine verständliche Meldung auf der Card, nicht einen generischen roten Punkt.

---

## 6. Sicherheit der Anwendung selbst

### 6.1 Threat Model

**Was kein Thema ist:** Jede Instanz läuft auf dem eigenen Server des Nutzers, mehrere Nutzer-Accounts einer Organisation statt eines einzelnen (2.2), Import nur von Repos, auf die ein verbundener Git-Account Zugriff hat. Es gibt keine Multi-Tenant-Isolation zu bauen — die Nutzer einer Instanz vertrauen sich gegenseitig (zwei Rollen, `admin`/`member`, regeln nur Git-Account- und Nutzerverwaltung, keine Datentrennung), und ein Nutzer einer Instanz kann über dieses Tool nicht den Server einer anderen Instanz angreifen, weil es keine geteilte Infrastruktur gibt.

**Was sehr wohl ein Thema ist:** „eigenes Repo" heißt nicht „nur eigener Code". Jedes gescannte Repository zieht über seine Lockfiles hunderte fremde Dependencies, und dessen Git-Historie kann Inhalte von Kollegen, Pull Requests oder Forks enthalten. Kompromittierte npm- oder Packagist-Pakete sind real vorgekommen (`event-stream`, `ua-parser-js`, u. a.), und es gab reale CVEs, bei denen ein präpariertes Repo beim reinen `git clone` Code auf dem klonenden Rechner ausführen konnte.

Die eigentliche Trust-Boundary liegt deshalb nicht zwischen Nutzern, sondern zwischen dem **Worker-Prozess** (der fremden, nicht vertrauenswürdigen Repo-Inhalt verarbeitet) und allem, was dieser Prozess erreichen kann — allen voran der Git-Provider-Token, der typischerweise Lesezugriff auf _alle_ Repos des Nutzers hat, nicht nur das gerade gescannte. Jede Härtungsmaßnahme in diesem Abschnitt zielt darauf, diesen Blast Radius zu begrenzen, falls kompromittierter Repo-Inhalt den Worker einmal dazu bringt, sich anders zu verhalten als erwartet.

### 6.2 Maßnahmen

- **Token-Scopes:** Die Setup-Dokumentation empfiehlt einen Fine-grained PAT mit ausschließlich `Contents: read` und `Metadata: read`. Die App validiert beim Verbinden die tatsächlich vorhandenen Scopes und warnt sichtbar, wenn Schreibrechte vorhanden sind.
- **Authentifizierung:** Admin-Account mit Passwort-Hash (Argon2id), Rate-Limiting am Login, Session-Cookies mit `HttpOnly`, `SameSite=Strict`, `Secure` sofern HTTPS.
- **Kein Default-Passwort.** Der Setup-Wizard ist der einzige Weg zum ersten Account, und er ist nach Abschluss dauerhaft gesperrt.
- **Bind-Adresse:** Default `127.0.0.1`, nicht `0.0.0.0`. Wer das Dashboard exponieren will, tut es bewusst über einen Reverse Proxy.
- **Logging:** Tokens, Secret-Klartexte und Clone-URLs mit eingebettetem Token werden vor dem Logging redigiert. Das betrifft auch Fehlerausgaben der Scanner-Subprozesse — die Clone-URL steht dort im Klartext in der Kommandozeile.
- **Clone-Token:** Statt des Tokens in der URL besser `GIT_ASKPASS` oder ein Credential-Helper, damit der Token nicht in der Prozessliste des Hosts sichtbar ist.
- **Container-Härtung (Worker).** Der Worker führt Scanner über fremden Repo-Inhalt aus — das ist der Prozess mit der größten Angriffsfläche im System. `USER node` statt Root im Dockerfile, `cap_drop: [ALL]` und `read_only: true` (mit explizit gemounteten beschreibbaren Pfaden für `/tmp` und die SQLite-Datei) in der Compose-Konfiguration. Begrenzt, was eine Kompromittierung über eine bösartige Dependency oder ein präpariertes Repo auf dem Host anrichten kann.
- **XSS-Regel für scan-abgeleitete Daten.** Dateipfade, Commit-Messages, Paketnamen und Autorennamen stammen aus fremdem Repo-Inhalt und sind nicht vertrauenswürdig, auch wenn sie nur zur Anzeige gedacht sind. React escaped standardmäßig — die verbindliche Regel ist: **niemals `dangerouslySetInnerHTML` auf einem Feld, das aus Scan-Ergebnissen stammt.** Ein bösartiger Commit-Message-String in einem gescannten Repo ist sonst ein Stored-XSS-Vektor gegen die eigene Admin-Session.
- **CSRF.** `SameSite=Strict` deckt den Normalfall ab, weil App und API same-origin sind (ein Container). Zusätzlich prüfen state-changende Endpoints (Scan auslösen, Projekt löschen/importieren, Token ändern) den `Origin`-Header gegen die erwartete Herkunft, statt sich allein auf das Cookie-Attribut zu verlassen.
- **Token-Widerruf sichtbar machen.** Schlägt ein Clone mit 401/403 fehl, wird der zugehörige `git_account` als `invalid` markiert statt nur der einzelne Scan als `failed`. Die UI zeigt dann eine Reconnect-Aufforderung statt einer generischen Fehlermeldung — sonst merkt der Nutzer einen abgelaufenen Token erst, wenn er zufällig in die Scan-Historie schaut.
- **Rate-Limiting nicht nur am Login.** Import- und manueller Scan-Trigger-Endpoint bekommen ebenfalls ein Limit (`@fastify/rate-limit`), damit ein Bug im eigenen Frontend oder eine kompromittierte Session den Worker nicht mit Jobs fluten kann.
- **`.env` niemals committen.** `.env.example` mit Platzhaltern im Repo, `.env` in `.gitignore`. Kein Agent darf einen echten `APP_ENCRYPTION_KEY`-Wert als Beispiel eintragen.

### 6.3 Audit-Log und Checksum-Verifikation

Beides ist umgesetzt (2.2). Das Audit-Log deckt die in 2.2 gelistete Menge zustandsändernder Aktionen ab — bewusst kein Log jedes GET-Requests oder jeder Suppression, das wäre Rauschen ohne Sicherheitswert. Die Checksum-Verifikation schließt eine reale Lücke aus dem Bedrohungsmodell (6.1): ein manipuliertes `osv-scanner`- oder `trufflehog`-Binary im Image hätte denselben Blast Radius wie ein kompromittiertes Repo, nur eine Ebene tiefer. Sie ist bewusst kein Ersatz für Image-Signaturen/Provenance (z. B. Sigstore/cosign) — das wäre ein Schritt weiter (Verifikation der Lieferkette bis zum Hersteller) und bleibt Backlog, falls der manuelle Pin-Prozess (2.2) sich als zu wartungsintensiv erweist.

---

## 7. Onboarding

Der Setup-Wizard beim ersten Aufruf ist auf das Nötigste reduziert:

1. **Create admin account** — Username, Passwort, Passwortbestätigung.
2. **Connect GitHub** — PAT eingeben, Validierung gegen `/user`, Anzeige des erkannten Accounts und der Scopes.

Der erste angelegte Account bekommt automatisch die Rolle `admin`. Weitere Nutzer (2.2) werden nicht über den Wizard angelegt, sondern von einem `admin` unter Settings → Users (Username + initiales Passwort, Rolle `admin` oder `member`).

Alles andere (Notifications, KI, weitere Provider) wandert in die Settings und ist optional. Ein Setup-Wizard mit sieben Abschnitten führt dazu, dass Leute das Tool wieder löschen, bevor sie es gesehen haben.

Nach Abschluss landet der Nutzer auf dem leeren Dashboard mit einem prominenten Empty State: _„No projects yet — import your first repository."_

---

## 8. UI-Spezifikation

### 8.0 Design-Richtung

Ziel ist ein cleanes, Notion-artiges Erscheinungsbild — kein dichtes Enterprise-Security-Dashboard mit vollgestopften Tabellen und Signalfarben überall. Konkret heißt das:

- **Farbe fast ausschließlich neutral.** Weiß/sehr helles Grau als Grund, dunkles Grau für Text (kein reines Schwarz), ein einzelner dezenter Akzentton für interaktive Elemente (Buttons, Links). Gesättigte Farben (Rot/Orange/Gelb/Grün) sind ausschließlich für Severity- und Status-Indikatoren reserviert — dieselbe Logik wie in 8.1 „Card-Farbe = Dringlichkeit". Wenn Farbe überall vorkommt, verliert sie als Signal ihre Bedeutung.
- **Weißraum statt Dichte.** Großzügiges Padding, klare Abstände zwischen Sektionen, Inhalte dürfen atmen. Nicht versuchen, möglichst viel Information pro Bildschirm unterzubringen.
- **Dünne Trennlinien statt Schatten.** 1px-Borders in hellem Grau zur Abgrenzung von Cards/Sektionen, keine schweren `box-shadow`-Elevationen. Wenn überhaupt Schatten, dann sehr subtil (z. B. bei Dropdowns/Modals).
- **Typografie.** Ein Sans-Serif-Font (System-UI-Stack oder Inter), klare Größenhierarchie, aber wenige Stufen. Großzügige Zeilenhöhe bei Fließtext.
- **Reduziertes Chrome.** Keine unnötigen Icons, Badges oder Deko-Elemente. Jedes UI-Element muss eine Funktion haben — Content und Daten stehen im Vordergrund, nicht die Oberfläche selbst.
- **Moderate, konsistente Eckenradien** auf Cards, Buttons und Inputs — weder scharfkantig noch stark abgerundet.

Diese Richtlinien gelten für alle Ansichten (Dashboard, Detailseite, Setup-Wizard), nicht nur für die Startseite. Bei Rückfragen zur konkreten Umsetzung gilt: eher an Notion, Linear oder Vercel-Dashboard orientieren als an klassischen Security-Tools wie DefectDojo oder Dependency-Track.

### 8.1 Dashboard (Startseite)

- Header mit **Import project**-Button und globalem Zustand (`X projects · last scan 3 minutes ago`)
- Projekt-Cards in einem responsiven Grid
- Import-Dialog: listet die Repos des verbundenen Accounts (paginiert, durchsuchbar, GitHub-API `/user/repos`), Mehrfachauswahl möglich, bereits importierte Repos werden aus der Liste ausgeblendet
- Beim Import wird sofort ein erster Scan eingereiht; die Card erscheint direkt im Zustand `scanning`

**Card-Inhalt:**

```
┌──────────────────────────────────────┐
│ ● my-project                    ⋯    │
│   sebastian/my-project · PHP         │
│                                      │
│   🔴 2 verified secrets              │
│   🔴 5 vulnerabilities (1 critical)  │
│   🔵 12 outdated (3 major)           │
│                                      │
│   Last scan 2 hours ago              │
└──────────────────────────────────────┘
```

**Card-Zustände:** `never scanned` · `scanning` (mit Spinner) · `completed` · `completed with warnings` (z. B. keine Lockfiles) · `failed` (mit Grund im Tooltip).

**Card-Farbe = Dringlichkeit, nicht Severity.** Die Priorität lautet:

1. Verifiziertes Secret → rot, unabhängig von allem anderen
2. Kritische Vulnerability → ebenfalls rot (sofortiger Handlungsbedarf), aber niedriger sortiert als ein verifiziertes Secret
3. Sonstige Vulnerabilities / veraltete Pakete → blau
4. Nichts gefunden → grün

Ein aktiver AWS-Key im Repository ist dringender als drei kritische CVEs in einer Dev-Dependency — deshalb sortiert er vor ihnen, auch wenn beide Zustände als rot signalisiert werden. Die Sortierung des Grids folgt derselben Logik: das Dringendste oben links.

### 8.2 Projekt-Detailansicht

Tabs: **Overview** · **Dependencies** · **Secrets** · **Settings**

- **Overview** — Zusammenfassung, Scan-Historie als Liste (Zeitpunkt, Dauer, Ergebnis, Commit), Button _Run scan now_
- **Dependencies** — Tabelle: Paket, Ecosystem, installierte Version, neueste Version, Update-Typ, CVEs. Filter- und sortierbar. Trennung zwischen direkten und transitiven Abhängigkeiten sichtbar. Pro Vulnerability aufklappbar: OSV-ID, CVE-Aliase, Severity, Summary, Fixed-Version, Link zu osv.dev.
- **Secrets** — Liste mit Detector-Typ, Verifikationsstatus, Datei, Zeile, Commit, Autor, Datum, maskiertem Wert. Prominenter Hinweis bei verifizierten Funden: _„This credential is currently active. Rotate it immediately — removing it from the code is not enough."_ Denn genau das ist der häufigste Fehler: Leute löschen die Zeile und denken, das Problem sei behoben, während der Key in der Historie steht und weiterhin funktioniert.
- **Settings** — Secret-Scanning an/aus, Verifikation an/aus, Full rescan, Projekt entfernen.

### 8.3 Grundhaltung der UI

Jedes Finding beantwortet drei Fragen ohne Klick: **Was ist das? Wie schlimm ist es? Was mache ich jetzt?** Eine Liste von CVE-IDs ohne Handlungsempfehlung ist genau das Dashboard, das nach drei Wochen niemand mehr öffnet.

### 8.4 Caching-Strategie (React Query)

Query-Keys folgen der Ressourcen-Hierarchie: `['projects']` für die Grid-Ansicht, `['project', projectId]` für die Detailansicht samt Dependencies/Secrets. Import, Löschen und manuelles Anstoßen eines Scans invalidieren `['projects']`; ein SSE-Event (siehe 3.5) invalidiert gezielt nur `['project', projectId]` des betroffenen Projekts — kein globaler Refetch bei jeder Statusänderung. `staleTime` für die Grid-Ansicht großzügig (z. B. 30s), da sich die Zähler ohnehin über SSE aktualisieren und nicht bei jedem Tab-Fokus neu geladen werden müssen.

---

## 9. KI-Layer — Vorbereitung und Leitplanken

Die KI-Features bleiben Teil der Produktvision. Sie werden nicht im MVP gebaut, aber die Architektur darf sie nicht verbauen. Konkret heißt das für Phase 1–2: Findings werden mit genug Kontext gespeichert (Dateipfad, Paketname, betroffene Version, Fixed-Version), dass ein späterer KI-Aufruf daraus einen Prompt bauen kann, ohne erneut klonen zu müssen.

Wenn die KI-Phase beginnt, gelten diese Regeln verbindlich:

**1. Die KI darf niemals eine Severity herabstufen.**
Kein grüner Haken, kein „Safe", kein „Not exploitable". Zulässig ist ausschließlich ein zusätzliches, klar als unsicher gekennzeichnetes Signal: `No call path found (unverified)`. Selbst kommerzielle Anbieter mit echter Call-Graph-Analyse weisen ausdrücklich darauf hin, dass ein nicht als erreichbar markiertes Element trotzdem erreichbar sein kann — über dynamisches Verhalten, unvollständige Informationen oder nicht betrachtete Pfade. Ein LLM ohne Call-Graph rät stellenweise. Die KI sortiert und erklärt, sie entscheidet nicht.

**2. Cloud-KI bricht das Datenhoheits-Versprechen — das muss explizit gesagt werden.**
Sobald ein Nutzer einen OpenAI- oder Anthropic-Key hinterlegt, verlässt Quellcode seine Infrastruktur. Das ist eine legitime Option, aber sie gehört unmissverständlich in die README und als sichtbarer Hinweis direkt neben das API-Key-Feld im Setup. Nur der lokale Ollama-Pfad ist vollständige Souveränität. Die Marketing-Aussage im Projekt lautet ab dann: _„Your code stays on your infrastructure — unless you explicitly enable a cloud AI provider."_

**3. Kein direkter Schreibzugriff auf Repositories.**
Der Upgrade-Assistent erzeugt einen Branch und einen Pull Request, niemals einen Commit auf den Default-Branch. „Das Tool schreibt den Code im Repository um" ist ein Satz, bei dem jeder Administrator die Tür zumacht. Der Nutzer sieht ein Diff und entscheidet.

**4. Kostenkontrolle von Anfang an.**
KI-Ergebnisse werden am Finding-Fingerprint gecacht. Ein Nightly-Scan über zehn Repos darf nicht jede Nacht dieselben unveränderten Findings erneut analysieren.

**5. Vor der Implementierung: Machbarkeit prüfen.**
Bevor die KI-Phase überhaupt beginnt, wird an einem echten Repository getestet, ob ein lokal betreibbares Modell brauchbare Reachability-Einschätzungen liefert. Fällt dieser Test negativ aus, wird das Feature auf Cloud-Modelle beschränkt oder gestrichen — nicht halbgar ausgeliefert.

**Realistische erste KI-Ausbaustufe.** Nicht Reachability, sondern Triage und Erklärung: „Was bedeutet diese CVE in einfachen Worten, welche Breaking Changes bringt das empfohlene Upgrade mit sich, in welcher Reihenfolge sollte ich diese 40 Findings abarbeiten?" Das ist ehrlich machbar, sofort nützlich und trägt kein Fehlsicherheits-Risiko.

---

## 10. Implementierungsreihenfolge

Nicht mit der UI anfangen. Erst wenn ein Scan end-to-end läuft, sind die Datenformen bekannt und das Schema kann sinnvoll entworfen werden.

| Schritt | Ziel                                                                                                                      | Fertig, wenn …                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **1**   | Ein hardcodiertes Repo klonen, `osv-scanner` ausführen, JSON parsen, in DB schreiben, als ungestylte HTML-Liste ausgeben  | … eine echte CVE aus einem echten Repo im Browser steht                                          |
| **2**   | Worker-Prozess, `jobs`-Tabelle mit Poll-Loop, Scan-Records, Statusverwaltung, Exit-Code-Behandlung, Cleanup im Fehlerfall | … ein hart abgeschossener Worker beim Neustart aufräumt und keine Leichen in `/tmp` hinterlässt  |
| **3**   | Admin-Account, Setup-Wizard, GitHub-Connect mit verschlüsseltem Token, Repo-Liste, Import                                 | … ein Repo per UI importiert und gescannt werden kann                                            |
| **4**   | TruffleHog integrieren, Redaction, Fingerprints, inkrementelles Scannen                                                   | … ein bewusst platzierter Test-Key gefunden, als verified markiert und maskiert gespeichert wird |
| **5**   | Version Auditing mit Registry-Lookups und Cache                                                                           | … eine veraltete Dependency korrekt als `major` klassifiziert wird                               |
| **6**   | Dashboard-Grid, Card-Zustände, Detailansicht, Empty States                                                                | … das Tool ohne Erklärung benutzbar ist                                                          |
| **7**   | Docker Compose, README, Setup-Dokumentation, Screenshots                                                                  | … ein Fremder es in fünf Minuten zum Laufen bringt                                               |

Für Schritt 4 eignet sich das offizielle Test-Repository von Truffle Security mit absichtlich geleakten Keys als Testfixture.

---

## 11. Qualitätskriterien

- **Kein falsches Grün.** Jeder Zustand, in dem das Tool nichts geprüft hat, sieht anders aus als ein Zustand, in dem es nichts gefunden hat.
- **Reproduzierbarkeit.** Zu jedem Scan sind Scanner-Versionen, Commit-SHA und Zeitpunkt gespeichert.
- **Idempotenz.** Zwei aufeinanderfolgende Scans desselben unveränderten Commits erzeugen identische Findings, keine Duplikate.
- **Aufräumen.** Kein temporäres Verzeichnis überlebt einen Scan, auch nicht bei Absturz oder Neustart des Workers. Beim Start räumt der Worker verwaiste `/tmp/scan-*` auf.
- **Upgrade-Sicherheit.** Ein Container-Update mit bestehender Datenbank läuft ohne Datenverlust durch.
