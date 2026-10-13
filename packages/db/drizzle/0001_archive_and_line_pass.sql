CREATE TABLE `line_pass` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`line_id` text NOT NULL,
	`clean` integer NOT NULL,
	`diverged` integer NOT NULL,
	`ts` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_id`) REFERENCES `collection`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `line_pass_collection_ts_idx` ON `line_pass` (`collection_id`,`ts`);--> statement-breakpoint
DROP INDEX `opening_uci_idx`;--> statement-breakpoint
ALTER TABLE `opening` DROP COLUMN `uci`;--> statement-breakpoint
ALTER TABLE `opening` DROP COLUMN `ply`;--> statement-breakpoint
ALTER TABLE `collection` ADD `archived_at` integer;