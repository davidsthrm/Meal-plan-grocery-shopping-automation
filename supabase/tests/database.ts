import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * An in-process Postgres with the migrations applied, for schema and RLS tests without
 * Docker. The few things Supabase provides around the schema are stood in for here.
 */

const SUPABASE_STAND_INS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Supabase grants every role everything on new public tables. RLS and our own
  -- revokes have to hold against that.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export async function createDatabase({ seed = false } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_INS);
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(migrationsDir + file, "utf8"));
  }
  if (seed) {
    await db.exec(readFileSync(fileURLToPath(new URL("../seed.sql", import.meta.url)), "utf8"));
  }
  return db;
}

/** Runs `work` as a signed-in user, the way a request through the Data API would. */
export async function asUser<T>(db: PGlite, userId: string, work: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("set role authenticated");
  try {
    return await work();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export async function asAnonymous<T>(db: PGlite, work: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await work();
  } finally {
    await db.exec("reset role");
  }
}
