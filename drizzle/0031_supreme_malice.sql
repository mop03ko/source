ALTER TABLE `inventory_items` ADD `product_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `barcode` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `inventory_items_product` ON `inventory_items` (`product_key`);--> statement-breakpoint
CREATE INDEX `inventory_items_barcode` ON `inventory_items` (`barcode`);