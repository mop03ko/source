CREATE TABLE meetings (
 id TEXT PRIMARY KEY NOT NULL,
 title TEXT NOT NULL,
 organizer TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 location TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 reminder_minutes INTEGER NOT NULL DEFAULT 15,
 status TEXT NOT NULL DEFAULT 'scheduled',
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX meetings_start ON meetings(status,starts_at);
--> statement-breakpoint
CREATE TABLE meeting_attendees (
 meeting_id TEXT NOT NULL,
 email TEXT NOT NULL,
 PRIMARY KEY(meeting_id,email)
);
--> statement-breakpoint
CREATE INDEX meeting_attendees_email ON meeting_attendees(email,meeting_id);
--> statement-breakpoint
CREATE TABLE meeting_reminders (
 meeting_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 recipient TEXT NOT NULL,
 alerted_at TEXT NOT NULL,
 PRIMARY KEY(meeting_id,version,recipient)
);
