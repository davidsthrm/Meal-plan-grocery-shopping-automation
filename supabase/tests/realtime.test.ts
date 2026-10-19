import { expect, it } from "vitest";
import { DAILY_TABLES, LIBRARY_TABLES } from "@/lib/live-refresh";
import { createDatabase } from "./database";

it("tells an open page about exactly the tables it listens to", async () => {
  const db = await createDatabase({ realtime: true });
  const published = await db.query<{ tablename: string }>(
    "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1",
  );
  expect(published.rows.map((row) => row.tablename)).toEqual(
    [...DAILY_TABLES, ...LIBRARY_TABLES].sort(),
  );
  await db.close();
});
