CREATE TABLE loan_request_receipts(request_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,lead_id TEXT NOT NULL,created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE lead_purchase_lines(id TEXT PRIMARY KEY,lead_id TEXT NOT NULL,sale_id TEXT NOT NULL,item_id TEXT NOT NULL,warehouse_id TEXT NOT NULL,kind TEXT NOT NULL,qty INTEGER NOT NULL,unit_price REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX lead_purchase_lines_lead ON lead_purchase_lines(lead_id);
--> statement-breakpoint
CREATE TABLE lead_purchase_fulfillment(lead_id TEXT PRIMARY KEY,method TEXT NOT NULL,delivery_id TEXT,created_at TEXT NOT NULL);
