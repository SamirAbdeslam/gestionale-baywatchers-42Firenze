CREATE TYPE "public"."event_kind" AS ENUM('exam', 'icebreaker', 'rush', 'cluster', 'welcome', 'custom');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "action_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" integer,
	"actor_login" text NOT NULL,
	"action_type" text NOT NULL,
	"description" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"resource_type" text,
	"resource_id" text,
	"old_value" jsonb,
	"new_value" jsonb,
	CONSTRAINT "logs_user_agent_length" CHECK (char_length("action_logs"."user_agent") <= 200)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"week" smallint NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "event_kind" DEFAULT 'custom' NOT NULL,
	"weekday" smallint NOT NULL,
	"event_date" date,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"max_slots" integer DEFAULT 10 NOT NULL,
	"compensation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_week_range" CHECK ("events"."week" BETWEEN 1 AND 4),
	CONSTRAINT "events_title_length" CHECK (char_length("events"."title") BETWEEN 1 AND 120),
	CONSTRAINT "events_description_length" CHECK (char_length("events"."description") <= 500),
	CONSTRAINT "events_weekday_range" CHECK ("events"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "events_time_order" CHECK ("events"."end_time" > "events"."start_time"),
	CONSTRAINT "events_slots_positive" CHECK ("events"."max_slots" >= 1),
	CONSTRAINT "events_compensation_nonnegative" CHECK ("events"."compensation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"participant_login" text NOT NULL,
	"attended" boolean DEFAULT true NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_event_login_unique" UNIQUE("event_id","participant_login"),
	CONSTRAINT "registrations_login_lowercase" CHECK ("registrations"."participant_login" = lower("registrations"."participant_login"))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"pool_start" date,
	"pool_end" date,
	"active_week" smallint DEFAULT 1 NOT NULL,
	"display_week" smallint DEFAULT 1 NOT NULL,
	"max_events_per_user" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_active_week_range" CHECK ("settings"."active_week" BETWEEN 1 AND 4),
	CONSTRAINT "settings_display_week_range" CHECK ("settings"."display_week" BETWEEN 1 AND 4),
	CONSTRAINT "settings_max_events_nonnegative" CHECK ("settings"."max_events_per_user" >= 0)
);
--> statement-breakpoint
CREATE TABLE "template_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "event_kind" DEFAULT 'custom' NOT NULL,
	"weekday" smallint NOT NULL,
	"event_date" date,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"max_slots" integer DEFAULT 10 NOT NULL,
	"compensation" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "template_events_title_length" CHECK (char_length("template_events"."title") BETWEEN 1 AND 120),
	CONSTRAINT "template_events_description_length" CHECK (char_length("template_events"."description") <= 500),
	CONSTRAINT "template_events_weekday_range" CHECK ("template_events"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "template_events_time_order" CHECK ("template_events"."end_time" > "template_events"."start_time"),
	CONSTRAINT "template_events_slots_positive" CHECK ("template_events"."max_slots" >= 1),
	CONSTRAINT "template_events_compensation_nonnegative" CHECK ("template_events"."compensation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"intra_id" integer NOT NULL,
	"login" text NOT NULL,
	"email" text,
	"display_name" text,
	"image_url" text,
	"wallet" integer DEFAULT 0 NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_intra_id_unique" UNIQUE("intra_id"),
	CONSTRAINT "users_login_unique" UNIQUE("login"),
	CONSTRAINT "users_login_lowercase" CHECK ("users"."login" = lower("users"."login"))
);
--> statement-breakpoint
CREATE TABLE "week_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"target_week" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_name_length" CHECK (char_length("week_templates"."name") BETWEEN 1 AND 120),
	CONSTRAINT "templates_week_range" CHECK ("week_templates"."target_week" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "whitelist" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whitelist_login_unique" UNIQUE("login"),
	CONSTRAINT "whitelist_login_lowercase" CHECK ("whitelist"."login" = lower("whitelist"."login"))
);
--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_events" ADD CONSTRAINT "template_events_template_id_week_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."week_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logs_created_idx" ON "action_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_actor_idx" ON "action_logs" USING btree ("actor_login");--> statement-breakpoint
CREATE INDEX "logs_action_idx" ON "action_logs" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "events_week_day_start_idx" ON "events" USING btree ("week","weekday","start_time");--> statement-breakpoint
CREATE INDEX "registrations_login_idx" ON "registrations" USING btree ("participant_login");
--> statement-breakpoint
INSERT INTO "settings" ("id") VALUES (1);
