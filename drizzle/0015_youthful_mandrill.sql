DROP INDEX `team_messages_created`;--> statement-breakpoint
ALTER TABLE `team_messages` ADD `channel` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
CREATE INDEX `team_messages_created` ON `team_messages` (`channel`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_team_reads` (
	`email` text NOT NULL,
	`channel` text DEFAULT 'all' NOT NULL,
	`last_read_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_team_reads`("email", "channel", "last_read_at") SELECT "email", 'all', "last_read_at" FROM `team_reads`;--> statement-breakpoint
DROP TABLE `team_reads`;--> statement-breakpoint
ALTER TABLE `__new_team_reads` RENAME TO `team_reads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `team_reads_email_channel` ON `team_reads` (`email`,`channel`);