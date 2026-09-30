ALTER TABLE lead_purchase_fulfillment ADD COLUMN has_accessories INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE lead_purchase_fulfillment SET has_accessories=1 WHERE EXISTS(SELECT 1 FROM lead_purchase_lines p WHERE p.lead_id=lead_purchase_fulfillment.lead_id AND p.kind='accessory');
