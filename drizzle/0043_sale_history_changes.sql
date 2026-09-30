ALTER TABLE inventory_sales ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE direct_sale_requests ADD COLUMN deleted_at TEXT;
--> statement-breakpoint
CREATE TABLE inventory_sale_changes (
 id TEXT PRIMARY KEY NOT NULL,
 sale_id TEXT NOT NULL,
 action TEXT NOT NULL,
 before_data TEXT NOT NULL,
 after_data TEXT NOT NULL,
 note TEXT NOT NULL,
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX inventory_sale_changes_sale ON inventory_sale_changes(sale_id,created_at);
