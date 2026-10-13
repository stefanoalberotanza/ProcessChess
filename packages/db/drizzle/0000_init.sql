CREATE TABLE `attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`node_id` text NOT NULL,
	`ts` integer NOT NULL,
	`result` text NOT NULL,
	`played_uci` text,
	`hints` integer DEFAULT 0 NOT NULL,
	`time_ms` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attempt_result_check" CHECK("attempt"."result" in ('correct','hint','wrong'))
);
--> statement-breakpoint
CREATE INDEX `attempt_node_ts_idx` ON `attempt` (`node_id`,`ts`);--> statement-breakpoint
CREATE INDEX `attempt_session_idx` ON `attempt` (`session_id`);--> statement-breakpoint
CREATE TABLE `card` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`due` integer NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`elapsed_days` integer DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`last_review` integer,
	FOREIGN KEY (`node_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_node_id_unique` ON `card` (`node_id`);--> statement-breakpoint
CREATE TABLE `collection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`start_fen` text NOT NULL,
	`user_color` text NOT NULL,
	`eval_mode` text NOT NULL,
	`source` text,
	`license` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "collection_kind_check" CHECK("collection"."kind" in ('opening','game','mate','pattern','endgame')),
	CONSTRAINT "collection_user_color_check" CHECK("collection"."user_color" in ('w','b')),
	CONSTRAINT "collection_eval_mode_check" CHECK("collection"."eval_mode" in ('exact','result'))
);
--> statement-breakpoint
CREATE TABLE `daily_stat` (
	`day` text NOT NULL,
	`scope` text NOT NULL,
	`scope_key` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`correct` integer DEFAULT 0 NOT NULL,
	`hint` integer DEFAULT 0 NOT NULL,
	`wrong` integer DEFAULT 0 NOT NULL,
	`new_cards` integer DEFAULT 0 NOT NULL,
	`time_ms` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `scope`, `scope_key`),
	CONSTRAINT "daily_stat_scope_check" CHECK("daily_stat"."scope" in ('collection','kind'))
);
--> statement-breakpoint
CREATE TABLE `node` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`parent_id` text,
	`ord` integer DEFAULT 0 NOT NULL,
	`epd` text NOT NULL,
	`san` text,
	`uci` text,
	`is_user_move` integer DEFAULT false NOT NULL,
	`comment` text,
	`opening_eco` text,
	`opening_name` text,
	FOREIGN KEY (`collection_id`) REFERENCES `collection`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "node_move_check" CHECK(("node"."parent_id" is null) = ("node"."uci" is null))
);
--> statement-breakpoint
CREATE INDEX `node_epd_idx` ON `node` (`epd`);--> statement-breakpoint
CREATE INDEX `node_collection_idx` ON `node` (`collection_id`);--> statement-breakpoint
CREATE INDEX `node_parent_idx` ON `node` (`parent_id`);--> statement-breakpoint
CREATE TABLE `opening` (
	`epd` text PRIMARY KEY NOT NULL,
	`eco` text NOT NULL,
	`name` text NOT NULL,
	`family` text NOT NULL,
	`variation` text,
	`uci` text NOT NULL,
	`ply` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opening_eco_idx` ON `opening` (`eco`);--> statement-breakpoint
CREATE UNIQUE INDEX `opening_uci_idx` ON `opening` (`uci`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`root_node_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`collection_id`) REFERENCES `collection`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`root_node_id`) REFERENCES `node`(`id`) ON UPDATE no action ON DELETE no action
);
