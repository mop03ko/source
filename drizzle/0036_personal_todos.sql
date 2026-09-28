CREATE TABLE personal_todos (
 id TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 title TEXT NOT NULL,
 done INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX personal_todos_owner ON personal_todos(owner,done,created_at);
