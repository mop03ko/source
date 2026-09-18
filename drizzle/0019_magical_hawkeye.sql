CREATE TABLE `inventory_count_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`count_id` text NOT NULL,
	`note` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_count_activity_count` ON `inventory_count_activities` (`count_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_counts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`due_at` text,
	`expected_amount` integer DEFAULT 0 NOT NULL,
	`actual_amount` integer,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_counts_owner` ON `inventory_counts` (`owner`,`due_at`);--> statement-breakpoint
CREATE INDEX `inventory_counts_status` ON `inventory_counts` (`status`);--> statement-breakpoint
CREATE INDEX `inventory_counts_created` ON `inventory_counts` (`created_at`);--> statement-breakpoint
ALTER TABLE `team_messages` ADD `mentions` text;--> statement-breakpoint
ALTER TABLE `team_messages` ADD `mentions_all` integer DEFAULT 0 NOT NULL;