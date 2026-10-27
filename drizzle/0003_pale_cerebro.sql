CREATE TABLE "pool_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"login" text NOT NULL,
	"title" text NOT NULL,
	"kind" "event_kind" NOT NULL,
	"event_date" date,
	"weekday" smallint,
	"start_time" time,
	"end_time" time,
	"duration_minutes" integer NOT NULL,
	"compensation" integer NOT NULL,
	"attended" boolean NOT NULL,
	"registered_at" timestamp with time zone,
	CONSTRAINT "pool_entries_login_lowercase" CHECK ("pool_entries"."login" = lower("pool_entries"."login")),
	CONSTRAINT "pool_entries_weekday_range" CHECK ("pool_entries"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "pool_entries_duration_nonnegative" CHECK ("pool_entries"."duration_minutes" >= 0),
	CONSTRAINT "pool_entries_compensation_nonnegative" CHECK ("pool_entries"."compensation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"source" text NOT NULL,
	"archived_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pools_start_date_unique" UNIQUE("start_date"),
	CONSTRAINT "pools_source_valid" CHECK ("pools"."source" IN ('site', 'csv'))
);
--> statement-breakpoint
ALTER TABLE "pool_entries" ADD CONSTRAINT "pool_entries_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pool_entries_pool_login_idx" ON "pool_entries" USING btree ("pool_id","login");