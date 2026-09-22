CREATE TABLE `fleet_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	`count_vuln_critical` integer DEFAULT 0 NOT NULL,
	`count_vuln_high` integer DEFAULT 0 NOT NULL,
	`count_vuln_medium` integer DEFAULT 0 NOT NULL,
	`count_vuln_low` integer DEFAULT 0 NOT NULL,
	`count_sustain_active` integer DEFAULT 0 NOT NULL,
	`count_sustain_aging` integer DEFAULT 0 NOT NULL,
	`count_sustain_stale` integer DEFAULT 0 NOT NULL,
	`count_sustain_dead` integer DEFAULT 0 NOT NULL,
	`count_sustain_unknown` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fleet_snapshots_date_unique` ON `fleet_snapshots` (`date`);