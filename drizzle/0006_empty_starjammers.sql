CREATE TABLE "enrollment_requests" (
	"login" text PRIMARY KEY NOT NULL,
	"weeks" smallint[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_login_lowercase" CHECK ("enrollment_requests"."login" = lower("enrollment_requests"."login")),
	CONSTRAINT "enrollment_weeks_valid" CHECK (cardinality("enrollment_requests"."weeks") BETWEEN 1 AND 4 AND "enrollment_requests"."weeks" <@ ARRAY[1,2,3,4]::smallint[] AND array_position("enrollment_requests"."weeks", NULL) IS NULL)
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "enrollment_code" text;--> statement-breakpoint
ALTER TABLE "whitelist" ADD COLUMN "weeks" smallint[];--> statement-breakpoint
ALTER TABLE "whitelist" ADD CONSTRAINT "whitelist_weeks_valid" CHECK ("whitelist"."weeks" IS NULL OR (cardinality("whitelist"."weeks") BETWEEN 1 AND 4 AND "whitelist"."weeks" <@ ARRAY[1,2,3,4]::smallint[] AND array_position("whitelist"."weeks", NULL) IS NULL));