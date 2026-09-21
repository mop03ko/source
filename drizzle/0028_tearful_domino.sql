ALTER TABLE `inventory_sales` ADD `seller` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `inventory_sales_seller` ON `inventory_sales` (`seller`);