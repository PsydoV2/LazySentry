CREATE TABLE `secrets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`detector_type` text NOT NULL,
	`file_path` text NOT NULL,
	`commit_sha` text NOT NULL,
	`line` integer,
	`is_verified` integer DEFAULT false NOT NULL,
	`redacted` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`commit_author` text,
	`commit_date` integer,
	`first_seen_scan_id` integer NOT NULL,
	`last_seen_scan_id` integer NOT NULL,
	`resolved_scan_id` integer,
	`resolved_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secrets_project_fingerprint_unique` ON `secrets` (`project_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `secrets_project_status_idx` ON `secrets` (`project_id`,`status`);