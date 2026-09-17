CREATE TABLE `it_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`note` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `it_activity_task` ON `it_activities` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `it_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`system_area` text NOT NULL,
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
CREATE INDEX `it_tasks_owner` ON `it_tasks` (`owner`,`due_at`);--> statement-breakpoint
CREATE INDEX `it_tasks_status` ON `it_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `it_tasks_created` ON `it_tasks` (`created_at`);