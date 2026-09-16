CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`pair_key` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE INDEX `messages_pair` ON `messages` (`pair_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_recipient_read` ON `messages` (`recipient`,`read_at`);