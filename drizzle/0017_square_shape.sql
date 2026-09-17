CREATE TABLE `sms_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_rules_status` ON `sms_rules` (`status`);
--> statement-breakpoint
INSERT INTO `sms_rules` (`id`,`status`,`message`,`enabled`,`created_at`,`updated_at`)
SELECT 'won-default-rule','won','Таны хүсэлт амжилттай баталгаажлаа.',
CASE WHEN (SELECT value FROM app_settings WHERE key='sms_enabled')='off' THEN 0 ELSE 1 END,
datetime('now'),datetime('now');