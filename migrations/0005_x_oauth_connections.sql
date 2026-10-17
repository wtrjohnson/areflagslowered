CREATE TABLE "x_oauth_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "account_handle" text NOT NULL,
  "encrypted_tokens" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
