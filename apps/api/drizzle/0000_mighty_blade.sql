CREATE TABLE `packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer NOT NULL,
	`ecosystem` text NOT NULL,
	`name` text NOT NULL,
	`version_installed` text NOT NULL,
	`version_latest` text,
	`update_type` text DEFAULT 'unknown' NOT NULL,
	`is_direct` integer,
	`source_file` text,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `packages_scan_idx` ON `packages` (`scan_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`git_account_id` integer,
	`provider_repo_id` text,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`default_branch` text,
	`clone_url` text NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`added_at` integer NOT NULL,
	`scan_secrets_enabled` integer DEFAULT true NOT NULL,
	`verify_secrets_enabled` integer DEFAULT true NOT NULL,
	`last_scan_id` integer,
	`last_scan_at` integer,
	`last_scan_status` text,
	`count_vuln_critical` integer DEFAULT 0 NOT NULL,
	`count_vuln_high` integer DEFAULT 0 NOT NULL,
	`count_vuln_medium` integer DEFAULT 0 NOT NULL,
	`count_vuln_low` integer DEFAULT 0 NOT NULL,
	`count_secrets_verified` integer DEFAULT 0 NOT NULL,
	`count_secrets_unknown` integer DEFAULT 0 NOT NULL,
	`count_outdated_major` integer DEFAULT 0 NOT NULL,
	`count_outdated_minor` integer DEFAULT 0 NOT NULL,
	`count_outdated_patch` integer DEFAULT 0 NOT NULL,
	`last_scanned_commit_sha` text
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`status` text NOT NULL,
	`deps_status` text DEFAULT 'pending' NOT NULL,
	`secrets_status` text DEFAULT 'pending' NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`commit_sha` text,
	`trigger` text NOT NULL,
	`scanner_versions` text,
	`error_code` text,
	`error_message` text,
	`duration_ms` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scans_project_idx` ON `scans` (`project_id`);--> statement-breakpoint
CREATE TABLE `vulnerabilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`package_id` integer,
	`osv_id` text NOT NULL,
	`aliases` text,
	`severity` text DEFAULT 'unknown' NOT NULL,
	`cvss_score` real,
	`summary` text,
	`fixed_version` text,
	`published_at` integer,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`first_seen_scan_id` integer NOT NULL,
	`last_seen_scan_id` integer NOT NULL,
	`resolved_scan_id` integer,
	`resolved_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vulns_project_fingerprint_unique` ON `vulnerabilities` (`project_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `vulns_project_status_idx` ON `vulnerabilities` (`project_id`,`status`);