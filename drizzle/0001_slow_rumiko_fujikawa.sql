CREATE TABLE `sheet_connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`credential` text,
	`email` text,
	`enabled` integer DEFAULT 0 NOT NULL,
	`last_at` text,
	`last_error` text,
	`last_result` text,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sheet_links` (
	`external_key` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`row_number` integer NOT NULL,
	`owner_label` text NOT NULL,
	`owner_email` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sheet_link_lead` ON `sheet_links` (`lead_id`);