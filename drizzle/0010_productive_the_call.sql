CREATE TABLE `marketing_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`note` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `marketing_activity_task` ON `marketing_activities` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketing_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`channel` text NOT NULL,
	`budget` integer DEFAULT 0 NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`due_at` text,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `marketing_tasks_owner` ON `marketing_tasks` (`owner`,`due_at`);--> statement-breakpoint
CREATE INDEX `marketing_tasks_status` ON `marketing_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `marketing_tasks_created` ON `marketing_tasks` (`created_at`);