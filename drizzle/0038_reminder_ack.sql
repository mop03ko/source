ALTER TABLE meeting_reminders ADD COLUMN acknowledged_at TEXT;
--> statement-breakpoint
-- Preserve delivery history from before acknowledgement support.
UPDATE meeting_reminders SET acknowledged_at=alerted_at;
