CREATE INDEX `activity_actor` ON `activities` (`actor`,`created_at`);--> statement-breakpoint
CREATE INDEX `leads_status` ON `leads` (`status`);--> statement-breakpoint
CREATE INDEX `leads_owner_created` ON `leads` (`owner`,`created_at`);