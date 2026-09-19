# CLAUDE.md

Diese Datei gilt für jeden Agent-Lauf in diesem Repo. Sie ist bewusst kurz — die vollständige Spec steht in `docs/CONCEPT.md` und wird bei Bedarf gezielt nachgeschlagen, nicht bei jedem Task neu gelesen.

## Projekt in einem Satz

Selbstgehostetes Security- & Maintenance-Dashboard: Dependency/CVE-Tracking, Version Auditing, Secret Detection (TruffleHog) für GitHub-/GitLab-Repos, ein Docker-Container, mehrere Nutzer möglich.

## Stack

Fastify + React (Vite), durchgehend TypeScript. Drizzle ORM + `better-sqlite3`. Zod für Validierung. TanStack Query im Frontend. pnpm-Workspace: `apps/api`, `apps/web`, `packages/shared`. Kein Redis, keine BullMQ — Queue ist eine eigene `jobs`-Tabelle in SQLite mit Poll-Loop im `worker`-Prozess. Details: `docs/CONCEPT.md` Abschnitt 0.

## Nicht verhandelbare Regeln

Diese Regeln gelten unabhängig vom aktuellen Task und werden nicht "aus Zeitgründen" oder "für einen schnellen Prototyp" übergangen:

1. **Rohe Secrets werden nie persistiert, geloggt oder in Exceptions weitergereicht.** Aus jedem TruffleHog-Fund wird sofort Fingerprint + Redaction (erste 4 + letzte 4 Zeichen) berechnet, der Klartext verlässt den Worker-Prozess nie. Siehe `docs/CONCEPT.md` 4.3.
2. **Exit-Codes sind semantisch, kein Fehler-Indikator im üblichen Sinn.** `osv-scanner` Code 1 = Vulnerabilities gefunden = Erfolg. `trufflehog` Code 183 = verifizierte Credentials gefunden = Erfolg. `osv-scanner` Code 128 = keine Lockfiles = eigener Zustand, nicht "sauber". Siehe 5.6.
3. **Subprozesse: immer `spawn` mit Argument-Array, nie `shell: true`, nie Token in der Kommandozeile.** Clone-Token über `GIT_ASKPASS`/Credential-Helper, nicht in der URL — Prozessargumente sind für jeden mit Host-Zugriff sichtbar.
4. **Temporäre Scan-Verzeichnisse werden im `finally`-Block gelöscht**, zusätzlich räumt der Worker beim Start verwaiste `/tmp/scan-*` auf. Kein Cleanup nur im Erfolgsfall.
5. **Nicht-Ziele in `docs/CONCEPT.md` 2.2 nicht anfangen, auch nicht "schon mal vorbereiten", solange sie dort nicht als umgesetzt stehen.** Multi-Provider, Mehrbenutzerbetrieb, Notifications, Cron-Scheduling, Suppression und License-Anzeige sind inzwischen umgesetzt — daran normal weiterbauen. Weiterhin nicht anfangen: KI-Features, SBOM-Export, PostgreSQL, incoming Webhooks/Event-getriebene Scans, EPSS/CISA-KEV, Sustainability-Score, echte Teams. Aktueller Stand: `docs/CONCEPT.md` 2.2.
6. **Worker-Container läuft als Non-Root mit `cap_drop: [ALL]`.** Der Worker verarbeitet nicht vertrauenswürdigen Repo-Inhalt (fremde Dependencies, fremde Git-Historie) — siehe Threat Model in 6.1.
7. **Nie `dangerouslySetInnerHTML` auf Feldern, die aus Scan-Ergebnissen stammen** (Dateipfade, Commit-Messages, Paketnamen, Autorennamen). Diese Daten kommen aus fremdem Repo-Inhalt und sind nicht vertrauenswürdig.
8. **Findings werden pro Projekt eindeutig gehalten** (`UNIQUE(project_id, fingerprint)`), nicht pro Scan neu angelegt. Reconciliation-Logik (Upsert + Resolved-Markierung) siehe 4.1 — nicht selbst neu erfinden.
9. **API-Fehler immer als `{ error: { code, message } }`**, passender HTTP-Status. Kein Envelope bei Erfolgs-Responses. Siehe 3.4.

## Bei Unsicherheit

Erst `docs/CONCEPT.md` nach dem passenden Abschnitt durchsuchen, bevor eine Konvention neu erfunden wird — besonders bei Datenmodell (Abschnitt 4), Scan-Pipeline (5) und API-Form (3.4). Wenn die Spec eine Frage wirklich offen lässt: kurz nachfragen statt anzunehmen, vor allem bei sicherheitsrelevanten Stellen.

## Implementierungsreihenfolge

Nicht mit der UI anfangen. Die Reihenfolge steht in `docs/CONCEPT.md` Abschnitt 10 — jeder Schritt hat ein konkretes "fertig, wenn"-Kriterium. Schritte nicht überspringen, auch wenn ein späterer Schritt einfach erscheint. Regelmäßig committen für die Versionierung
