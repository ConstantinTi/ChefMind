CREATE TABLE `meal_plan_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`recipe_id` text,
	`free_text` text,
	`servings` real,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_plan_date_idx` ON `meal_plan_entries` (`date`,`slot`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`thumb_key` text,
	`width` integer,
	`height` integer,
	`caption` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_recipe_idx` ON `photos` (`recipe_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`group_label` text,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`preparation` text,
	`note` text,
	`raw_text` text,
	`quantity_kind` text NOT NULL,
	`amount_min` real,
	`amount_max` real,
	`unit` text,
	`dimension` text DEFAULT 'none' NOT NULL,
	`base_min` real,
	`base_max` real,
	`scaling_mode` text DEFAULT 'linear' NOT NULL,
	`scaling_exponent` real,
	`scaling_step` real,
	`scaling_min` real,
	`scaling_max` real,
	`rounding` text DEFAULT 'nice' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`optional` integer DEFAULT false NOT NULL,
	`exclude_from_shopping_list` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_ingredients_recipe_idx` ON `recipe_ingredients` (`recipe_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_name_idx` ON `recipe_ingredients` (`name_normalized`);--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`group_label` text,
	`text` text NOT NULL,
	`duration_minutes` integer,
	`temperature_c` integer,
	`temperature_mode` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_steps_recipe_idx` ON `recipe_steps` (`recipe_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`recipe_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text,
	`base_servings` real DEFAULT 4 NOT NULL,
	`serving_unit` text DEFAULT 'portion' NOT NULL,
	`yield_note` text,
	`prep_minutes` integer,
	`cook_minutes` integer,
	`rest_minutes` integer,
	`total_minutes` integer,
	`difficulty` text,
	`precision_mode` text DEFAULT 'kitchen' NOT NULL,
	`source_type` text DEFAULT 'own' NOT NULL,
	`source_title` text,
	`source_author` text,
	`source_url` text,
	`source_page` text,
	`hero_photo_id` text,
	`nutrition_kcal` real,
	`nutrition_protein` real,
	`nutrition_carbs` real,
	`nutrition_fat` real,
	`nutrition_fiber` real,
	`nutrition_source` text,
	`notes` text,
	`rating` integer,
	`is_favorite` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_slug_idx` ON `recipes` (`slug`);--> statement-breakpoint
CREATE INDEX `recipes_total_minutes_idx` ON `recipes` (`total_minutes`);--> statement-breakpoint
CREATE INDEX `recipes_title_idx` ON `recipes` (`title`);--> statement-breakpoint
CREATE TABLE `shopping_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`label` text NOT NULL,
	`name_normalized` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`display` text DEFAULT '' NOT NULL,
	`dimension` text DEFAULT 'none' NOT NULL,
	`amount_min` real,
	`amount_max` real,
	`unit` text,
	`sources` text,
	`is_manual` integer DEFAULT false NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `shopping_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shopping_list_items_list_idx` ON `shopping_list_items` (`list_id`,`category`,`sort_order`);--> statement-breakpoint
CREATE TABLE `shopping_list_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`servings` real NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `shopping_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shopping_list_sources_list_idx` ON `shopping_list_sources` (`list_id`);--> statement-breakpoint
CREATE TABLE `shopping_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `step_ingredients` (
	`step_id` text NOT NULL,
	`recipe_ingredient_id` text NOT NULL,
	`portion` real DEFAULT 1 NOT NULL,
	PRIMARY KEY(`step_id`, `recipe_ingredient_id`),
	FOREIGN KEY (`step_id`) REFERENCES `recipe_steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_ingredient_id`) REFERENCES `recipe_ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`kind` text DEFAULT 'frei' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_norm_idx` ON `tags` (`name_normalized`);