CREATE TABLE `inventory_product_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_product_codes_key` ON `inventory_product_codes` (`product_key`);
--> statement-breakpoint
INSERT INTO inventory_product_codes(product_key)
SELECT DISTINCT COALESCE(NULLIF(product_key,''),id) FROM inventory_items ORDER BY 1;
--> statement-breakpoint
CREATE TRIGGER inventory_product_code_insert AFTER INSERT ON inventory_items
BEGIN
 INSERT INTO inventory_product_codes(product_key)
 SELECT COALESCE(NULLIF(NEW.product_key,''),NEW.id)
 WHERE NOT EXISTS(SELECT 1 FROM inventory_product_codes WHERE product_key=COALESCE(NULLIF(NEW.product_key,''),NEW.id));
END;
--> statement-breakpoint
CREATE TRIGGER inventory_product_code_update AFTER UPDATE OF product_key ON inventory_items
BEGIN
 INSERT INTO inventory_product_codes(product_key)
 SELECT COALESCE(NULLIF(NEW.product_key,''),NEW.id)
 WHERE NOT EXISTS(SELECT 1 FROM inventory_product_codes WHERE product_key=COALESCE(NULLIF(NEW.product_key,''),NEW.id));
END;
