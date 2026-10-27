CREATE TABLE "week_activations" (
	"week" smallint PRIMARY KEY NOT NULL,
	"activated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pool_entries" ADD COLUMN "week" smallint;--> statement-breakpoint
ALTER TABLE "pool_entries" ADD COLUMN "max_slots" integer;--> statement-breakpoint
ALTER TABLE "pool_entries" ADD COLUMN "event_ref" integer;--> statement-breakpoint
ALTER TABLE "pool_entries" ADD COLUMN "week_activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pool_entries" ADD CONSTRAINT "pool_entries_week_range" CHECK ("pool_entries"."week" BETWEEN 1 AND 4);