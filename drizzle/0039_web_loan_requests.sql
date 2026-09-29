CREATE TABLE web_loan_requests (
 request_id TEXT PRIMARY KEY NOT NULL,
 payload_hash TEXT NOT NULL,
 lead_id TEXT NOT NULL,
 received_at TEXT NOT NULL
);
CREATE UNIQUE INDEX web_loan_requests_lead ON web_loan_requests(lead_id);
