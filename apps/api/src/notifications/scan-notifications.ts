// Decides whether a finished scan is worth a Discord notification, and
// builds the message (roadmap Phase 3, docs/CONCEPT.md 2.3). Fires on newly
// discovered open findings and on a failed scan — never on an unchanged,
// successful re-scan, so an idle project does not spam the channel.

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { secrets, vulnerabilities } from '../db/schema.js';
import { sendDiscordNotification } from './discord.js';

export async function notifyScanResult(
  project: { id: number; fullName: string },
  scanId: number,
  status: string,
): Promise<void> {
  // A deliberate stop is not a failure and not news (docs/CONCEPT.md rule 2).
  if (status === 'cancelled') return;

  if (status === 'failed') {
    await sendDiscordNotification(
      `⚠️ Scan failed for **${project.fullName}** — check the dashboard for details.`,
    );
    return;
  }

  const newVulns = db
    .select()
    .from(vulnerabilities)
    .where(
      and(
        eq(vulnerabilities.projectId, project.id),
        eq(vulnerabilities.firstSeenScanId, scanId),
        eq(vulnerabilities.status, 'open'),
        isNull(vulnerabilities.suppressedAt),
      ),
    )
    .all();
  const newSecrets = db
    .select()
    .from(secrets)
    .where(
      and(
        eq(secrets.projectId, project.id),
        eq(secrets.firstSeenScanId, scanId),
        eq(secrets.status, 'open'),
        isNull(secrets.suppressedAt),
      ),
    )
    .all();

  if (newVulns.length === 0 && newSecrets.length === 0) return;

  const lines = [`🔍 New findings in **${project.fullName}**`];

  const verifiedSecrets = newSecrets.filter((s) => s.isVerified).length;
  const unknownSecrets = newSecrets.length - verifiedSecrets;
  if (verifiedSecrets > 0) {
    lines.push(`🔴 ${verifiedSecrets} verified secret${verifiedSecrets === 1 ? '' : 's'}`);
  }
  if (unknownSecrets > 0) {
    lines.push(`🟡 ${unknownSecrets} unverified secret${unknownSecrets === 1 ? '' : 's'}`);
  }

  const criticalVulns = newVulns.filter((v) => v.severity === 'critical').length;
  const otherVulns = newVulns.length - criticalVulns;
  if (criticalVulns > 0) {
    lines.push(`🟠 ${criticalVulns} critical vulnerabilit${criticalVulns === 1 ? 'y' : 'ies'}`);
  }
  if (otherVulns > 0) {
    lines.push(`🔵 ${otherVulns} other vulnerabilit${otherVulns === 1 ? 'y' : 'ies'}`);
  }

  await sendDiscordNotification(lines.join('\n'));
}
