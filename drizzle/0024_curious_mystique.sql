ALTER TABLE `deliveries` ADD `item_id` text;--> statement-breakpoint
CREATE INDEX `deliveries_item` ON `deliveries` (`item_id`);