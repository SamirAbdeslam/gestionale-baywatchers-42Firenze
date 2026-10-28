ALTER TABLE "settings" ADD COLUMN "pool_closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "pool_reopened" boolean DEFAULT false NOT NULL;