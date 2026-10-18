import { z } from "zod";
import { BATCH } from "@/domain/shopping-list/ticks";
import { readNoteId } from "@/domain/shopping-list/trips";
import { requireHousehold } from "@/server/auth";
import { applyTicks, isNote } from "@/server/shopping/list";
import { createSessionClient } from "@/server/supabase/server";

/**
 * Ticks from a device, sent as soon as it has a connection (`TickQueue`): the ones made just
 * now, or those made in the shop an hour ago. A route handler, not a server action, so that
 * a page can send them by itself whenever the connection comes back.
 *
 * Answers which ticks it is done with (`taken`) and which it can never store (`refused`):
 * the device sends the rest again later.
 */

const tickSchema = z.object({
  id: z.string().min(1).max(64),
  note: z.string().max(40),
  key: z.string().min(1).max(200),
  checked: z.boolean(),
  // Milliseconds. Anything before this app existed is no tick of it.
  at: z
    .number()
    .int()
    .min(Date.UTC(2026, 0, 1)),
});

const bodySchema = z.object({ ticks: z.array(z.unknown()).max(BATCH) });

export async function POST(request: Request): Promise<Response> {
  const household = await requireHousehold();
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "no ticks" }, { status: 400 });

  const refused: string[] = [];
  const ticks = body.data.ticks.flatMap((raw) => {
    const parsed = tickSchema.safeParse(raw);
    const note = parsed.success ? readNoteId(parsed.data.note) : null;
    if (!parsed.success || !note || !isNote(note)) {
      const id = (raw as { id?: unknown } | null)?.id;
      if (typeof id === "string") refused.push(id);
      return [];
    }
    return [{ ...parsed.data, note, at: new Date(parsed.data.at) }];
  });

  const taken = await applyTicks(await createSessionClient(), household, ticks);
  return Response.json({ taken, refused }, { headers: { "Cache-Control": "private, no-store" } });
}
