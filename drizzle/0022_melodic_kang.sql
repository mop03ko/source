CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`delivered_on` text NOT NULL,
	`kind` text DEFAULT '' NOT NULL,
	`item_info` text DEFAULT '' NOT NULL,
	`customer_phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`payment_channel` text DEFAULT '' NOT NULL,
	`contents` text DEFAULT '' NOT NULL,
	`courier_email` text,
	`courier_name` text NOT NULL,
	`entered_by_email` text,
	`entered_by_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`sale_id` text,
	`lead_id` text,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deliveries_day` ON `deliveries` (`delivered_on`);--> statement-breakpoint
CREATE INDEX `deliveries_courier` ON `deliveries` (`courier_name`,`delivered_on`);--> statement-breakpoint
CREATE INDEX `deliveries_status` ON `deliveries` (`status`);--> statement-breakpoint
CREATE INDEX `deliveries_phone` ON `deliveries` (`customer_phone`);