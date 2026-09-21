ALTER TABLE inventory_sales ADD COLUMN lead_id TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX inventory_sales_lead ON inventory_sales(lead_id);
