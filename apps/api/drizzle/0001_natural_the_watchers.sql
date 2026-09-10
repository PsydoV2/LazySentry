CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`locked_at` integer,
	`locked_by` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);