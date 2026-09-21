ALTER TABLE `inventory_sales` ADD `lead_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_sales_lead` ON `inventory_sales` (`lead_id`);