CREATE TABLE inventory_channels(name TEXT PRIMARY KEY NOT NULL,commission_rate REAL NOT NULL DEFAULT 0,account TEXT NOT NULL DEFAULT '');
--> statement-breakpoint
CREATE TABLE inventory_requests(id TEXT PRIMARY KEY NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL);
--> statement-breakpoint
ALTER TABLE inventory_items ADD capacity TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE inventory_items ADD color TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE inventory_items ADD supplier TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE inventory_items ADD min_stock INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_purchases ADD order_number TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE inventory_purchases ADD status TEXT NOT NULL DEFAULT 'received';
--> statement-breakpoint
ALTER TABLE inventory_purchases ADD base_unit_cost REAL NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_purchases ADD additional_cost REAL NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_purchases ADD returned_qty INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_sales ADD bill_number TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE inventory_sales ADD account TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE inventory_sales ADD commission_rate REAL NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_sales ADD commission_cents INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_sales ADD tax_cents INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_sales ADD cost_cents INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_sales ADD cost_estimated INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_sales ADD vat_issued INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_stock_moves ADD value_cents INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_stock_moves ADD cost_estimated INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE inventory_stock_moves ADD occurred_at TEXT;
--> statement-breakpoint
ALTER TABLE inventory_counts ADD stock_revision INTEGER NOT NULL DEFAULT -1;
--> statement-breakpoint
UPDATE inventory_purchases SET base_unit_cost=unit_cost;
--> statement-breakpoint
UPDATE inventory_stock_moves SET occurred_at=created_at,value_cents=ROUND(qty_delta*COALESCE(unit_cost,(SELECT SUM(p.total_cost)*1.0/NULLIF(SUM(p.qty),0) FROM inventory_purchases p WHERE p.item_id=inventory_stock_moves.item_id AND p.warehouse_id=inventory_stock_moves.warehouse_id),0)*100),cost_estimated=CASE WHEN unit_cost IS NULL THEN 1 ELSE 0 END;
--> statement-breakpoint
UPDATE inventory_sales SET cost_cents=COALESCE((SELECT -SUM(value_cents) FROM inventory_stock_moves m WHERE m.kind='sale' AND m.ref_id=inventory_sales.id),0),cost_estimated=1;
--> statement-breakpoint
INSERT INTO inventory_channels(name,commission_rate,account) VALUES ('BEE',0,'HD'),('GI',0,'HD'),('KHANBANK',2,''),('BELEN',0,'HD'),('STOREPAY',8,'BHD'),('BELEN POS',1,'BHD'),('QPAY',1,'BHD'),('PAY ON',3,'BHD'),('LENDPAY',8,''),('POCKET',6.5,'BHD'),('SHOPPY.MN',13,''),('BANANA',10,''),('NETPAY',4,''),('ONLINE',0,''),('POCKETLEASING',3.5,''),('DARAA TOOTSOO',0,''),('BARTER',0,''),('TRADEIN',0,''),('MALL DANS',0,'BHD'),('AVLAGA',0,''),('BELEG',0,''),('SONO',6,''),('TOKI',13,''),('HUVI DANS',0,'');
