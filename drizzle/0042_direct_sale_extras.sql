ALTER TABLE inventory_sales ADD COLUMN has_accessories INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_sales ADD COLUMN gifts TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE inventory_sales ADD COLUMN gift_name TEXT NOT NULL DEFAULT '';
