CREATE TABLE `inventory_units` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`serial` text DEFAULT '' NOT NULL,
	`barcode` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`ref_id` text NOT NULL,
	`lead_id` text,
	`customer_phone` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_units_serial` ON `inventory_units` (`serial`);--> statement-breakpoint
CREATE INDEX `inventory_units_barcode` ON `inventory_units` (`barcode`);--> statement-breakpoint
CREATE INDEX `inventory_units_item` ON `inventory_units` (`item_id`);--> statement-breakpoint
CREATE INDEX `inventory_units_ref` ON `inventory_units` (`source`,`ref_id`);--> statement-breakpoint
CREATE INDEX `inventory_units_lead` ON `inventory_units` (`lead_id`);