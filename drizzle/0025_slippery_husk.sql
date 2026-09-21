CREATE TABLE `shift_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`person_name` text NOT NULL,
	`member_email` text,
	`from_day` text NOT NULL,
	`to_day` text,
	`assignment` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`decision_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_requests_status` ON `shift_requests` (`status`,`from_day`);--> statement-breakpoint
CREATE INDEX `shift_requests_person` ON `shift_requests` (`person_name`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`member_email` text,
	`person_name` text NOT NULL,
	`assignment` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_shifts_day_person` ON `work_shifts` (`day`,`person_name`);--> statement-breakpoint
CREATE INDEX `work_shifts_day` ON `work_shifts` (`day`,`assignment`);--> statement-breakpoint
CREATE INDEX `work_shifts_person` ON `work_shifts` (`person_name`,`day`);