CREATE TABLE `inventory_bulk_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`changes` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `image_url` text DEFAULT '' NOT NULL;