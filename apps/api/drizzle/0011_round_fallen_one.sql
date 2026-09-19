CREATE TABLE `notification_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`label` text,
	`url_encrypted` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
-- Carry over a Discord webhook configured before notification channels
-- existed as their own table (docs/CONCEPT.md 2.3). The encrypted blob is
-- moved as-is — same cipher, same master key — no decrypt/recrypt needed.
INSERT INTO `notification_channels` (`platform`, `label`, `url_encrypted`, `created_at`)
SELECT 'discord', NULL, `value_encrypted`, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `settings` WHERE `key` = 'discord_webhook_url';
--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'discord_webhook_url';
