CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`phone` text NOT NULL,
	`kind` text NOT NULL,
	`note` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_lead` ON `activities` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_attempts` ON `activities` (`phone`,`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`product` text NOT NULL,
	`source` text NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`next_at` text,
	`next_action` text NOT NULL,
	`recycle_at` text,
	`connected` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`op` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leads_owner_due` ON `leads` (`owner`,`next_at`);--> statement-breakpoint
CREATE INDEX `leads_phone` ON `leads` (`phone`);--> statement-breakpoint
CREATE INDEX `leads_created` ON `leads` (`created_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppressions` (
	`phone` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
