CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`lead_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	`due_at` text,
	`alerted_at` text
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_time` ON `notifications` (`recipient`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_read` ON `notifications` (`recipient`,`read_at`);