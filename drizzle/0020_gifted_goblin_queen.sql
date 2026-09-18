CREATE TABLE `inventory_count_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`count_id` text NOT NULL,
	`item_id` text NOT NULL,
	`expected_qty` integer DEFAULT 0 NOT NULL,
	`counted_qty` integer,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_count_lines_count` ON `inventory_count_lines` (`count_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_count_lines_unique` ON `inventory_count_lines` (`count_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`variant` text DEFAULT '' NOT NULL,
	`imei` text,
	`sale_price` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_items_code` ON `inventory_items` (`code`);--> statement-breakpoint
CREATE INDEX `inventory_items_name` ON `inventory_items` (`name`);--> statement-breakpoint
CREATE TABLE `inventory_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`qty` integer NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`total_cost` integer DEFAULT 0 NOT NULL,
	`ordered_at` text,
	`received_at` text,
	`payment_status` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_purchases_item` ON `inventory_purchases` (`item_id`);--> statement-breakpoint
CREATE INDEX `inventory_purchases_created` ON `inventory_purchases` (`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`qty` integer NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`total_price` integer DEFAULT 0 NOT NULL,
	`customer_name` text DEFAULT '' NOT NULL,
	`customer_phone` text DEFAULT '' NOT NULL,
	`platform` text DEFAULT '' NOT NULL,
	`sold_at` text,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_sales_item` ON `inventory_sales` (`item_id`);--> statement-breakpoint
CREATE INDEX `inventory_sales_created` ON `inventory_sales` (`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_stock_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`kind` text NOT NULL,
	`qty_delta` integer NOT NULL,
	`unit_cost` integer,
	`ref_id` text,
	`note` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_moves_item` ON `inventory_stock_moves` (`item_id`,`warehouse_id`);--> statement-breakpoint
CREATE INDEX `inventory_moves_created` ON `inventory_stock_moves` (`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_warehouses_name` ON `inventory_warehouses` (`name`);--> statement-breakpoint
ALTER TABLE `inventory_counts` ADD `warehouse_id` text;