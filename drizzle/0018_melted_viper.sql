CREATE TABLE `group_chat_members` (
	`channel_id` text NOT NULL,
	`email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_chat_members_unique` ON `group_chat_members` (`channel_id`,`email`);--> statement-breakpoint
CREATE INDEX `group_chat_members_email` ON `group_chat_members` (`email`);--> statement-breakpoint
CREATE TABLE `group_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
