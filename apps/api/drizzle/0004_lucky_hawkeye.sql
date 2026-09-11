CREATE TABLE `registry_cache` (
	`ecosystem` text NOT NULL,
	`package_name` text NOT NULL,
	`latest_version` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registry_cache_ecosystem_package_unique` ON `registry_cache` (`ecosystem`,`package_name`);