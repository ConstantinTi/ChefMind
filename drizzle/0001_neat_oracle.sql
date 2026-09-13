ALTER TABLE `recipes` ADD `import_method` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `import_confidence` real;--> statement-breakpoint
ALTER TABLE `recipes` ADD `import_warnings` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `import_reviewed_at` integer;