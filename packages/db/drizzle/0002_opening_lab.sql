CREATE TABLE `lab_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`ts` integer NOT NULL,
	`epd` text NOT NULL,
	`uci` text NOT NULL,
	`ply` integer NOT NULL,
	`result` text NOT NULL,
	`played_uci` text NOT NULL,
	`hints` integer DEFAULT 0 NOT NULL,
	`time_ms` integer NOT NULL,
	CONSTRAINT "lab_attempt_result_check" CHECK("lab_attempt"."result" in ('correct','hint','wrong'))
);
--> statement-breakpoint
CREATE INDEX `lab_attempt_edge_ts_idx` ON `lab_attempt` (`epd`,`uci`,`ts`);--> statement-breakpoint
CREATE TABLE `lab_run` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`line` text NOT NULL,
	`eco` text,
	`name` text,
	`plies` integer NOT NULL,
	`errors` integer NOT NULL,
	`hints` integer NOT NULL,
	`clean` integer NOT NULL,
	`time_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lab_run_line_ts_idx` ON `lab_run` (`line`,`ts`);