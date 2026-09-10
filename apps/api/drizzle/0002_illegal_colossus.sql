CREATE TABLE `git_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`username` text NOT NULL,
	`token_encrypted` text NOT NULL,
	`token_scopes` text,
	`status` text DEFAULT 'valid' NOT NULL,
	`connected_at` integer NOT NULL,
	`last_validated_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_encrypted` text NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
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
	`last_scanned_commit_sha` text,
	FOREIGN KEY (`git_account_id`) REFERENCES `git_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "git_account_id", "provider_repo_id", "name", "full_name", "default_branch", "clone_url", "is_private", "added_at", "scan_secrets_enabled", "verify_secrets_enabled", "last_scan_id", "last_scan_at", "last_scan_status", "count_vuln_critical", "count_vuln_high", "count_vuln_medium", "count_vuln_low", "count_secrets_verified", "count_secrets_unknown", "count_outdated_major", "count_outdated_minor", "count_outdated_patch", "last_scanned_commit_sha") SELECT "id", "git_account_id", "provider_repo_id", "name", "full_name", "default_branch", "clone_url", "is_private", "added_at", "scan_secrets_enabled", "verify_secrets_enabled", "last_scan_id", "last_scan_at", "last_scan_status", "count_vuln_critical", "count_vuln_high", "count_vuln_medium", "count_vuln_low", "count_secrets_verified", "count_secrets_unknown", "count_outdated_major", "count_outdated_minor", "count_outdated_patch", "last_scanned_commit_sha" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_account_repo_unique` ON `projects` (`git_account_id`,`provider_repo_id`);