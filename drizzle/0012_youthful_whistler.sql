CREATE TABLE `message_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`message_kind` text NOT NULL,
	`message_id` text NOT NULL,
	`emoji` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reactions_message` ON `message_reactions` (`message_kind`,`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reactions_unique` ON `message_reactions` (`message_kind`,`message_id`,`emoji`,`actor`);--> statement-breakpoint
ALTER TABLE `messages` ADD `reply_to_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `reply_to_sender` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `reply_to_body` text;--> statement-breakpoint
ALTER TABLE `team_messages` ADD `reply_to_id` text;--> statement-breakpoint
ALTER TABLE `team_messages` ADD `reply_to_sender` text;--> statement-breakpoint
ALTER TABLE `team_messages` ADD `reply_to_body` text;