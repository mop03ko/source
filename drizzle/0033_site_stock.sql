CREATE TABLE `site_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`capacity` text NOT NULL,
	`color` text NOT NULL,
	`variant` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_stock_control` (
	`id` integer PRIMARY KEY NOT NULL,
	`automatic` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`lock_until` text
);
--> statement-breakpoint
CREATE TABLE `site_stock_events` (
	`id` text PRIMARY KEY NOT NULL,
	`product_key` text NOT NULL,
	`site_id` text NOT NULL,
	`qty` integer,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_stock_links` (
	`product_key` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`site_code` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`confirmed_by` text NOT NULL,
	`confirmed_at` text NOT NULL,
	`last_qty` integer,
	`last_synced_at` text,
	`last_attempt_at` text,
	`last_error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_stock_links_site` ON `site_stock_links` (`site_id`);