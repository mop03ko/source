CREATE TABLE `team_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_messages_created` ON `team_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `team_reads` (
	`email` text PRIMARY KEY NOT NULL,
	`last_read_at` text NOT NULL
);
