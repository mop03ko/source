CREATE TABLE direct_sale_requests (
 id TEXT PRIMARY KEY NOT NULL,
 requester TEXT NOT NULL,
 payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 sale_id TEXT,
 reviewed_by TEXT,
 reviewed_at TEXT,
 review_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX direct_sale_requests_status ON direct_sale_requests(status,created_at);
--> statement-breakpoint
CREATE INDEX direct_sale_requests_requester ON direct_sale_requests(requester,created_at);
