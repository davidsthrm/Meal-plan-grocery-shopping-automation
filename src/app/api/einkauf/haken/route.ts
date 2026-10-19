import { z } from "zod";
import { isIsoDate } from "@/domain/dates";
import { PLACES } from "@/domain/catalog";
import type { Decision } from "@/domain/shopping-list/decisions";
import { BATCH } from "@/domain/shopping-list/ticks";
import { readNoteId } from "@/domain/shopping-list/trips";
import { isUnit } from "@/domain/units";
import { requireHousehold } from "@/server/auth";
import { applyDecisions, isNote } from "@/server/shopping/list";
import { createSessionClient } from "@/server/supabase/server";

/**
 * Ticks and other decisions about lines from a device, sent as soon as it has a connection
 * (`TickQueue`): the ones made just now, or those made in the shop an hour ago. A route
 * handler, not a server action, so that a page can send them by itself whenever the
 * connection comes back.
 *
 * Answers which it is done with (`taken`) and which it can never store (`refused`): the
 * device sends the rest again later.
 */

const amount = z.object({
  quantity: z.number().positive().max(100000),
  unit: z.string().refine(isUnit),
});
const name = z.string().trim().max(80).nullish();
const note = z.string().max(40);

const decisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bought"), amount: amount.nullish(), name }),
  z.object({ kind: z.literal("open") }),
  z.object({ kind: z.literal("removed"), reason: z.string().trim().max(80).nullish() }),
  z.object({
    kind: z.literal("partial"),
    amount,
    name,
    remainder: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("discarded") }),
      z.object({
        kind: z.literal("moved"),
        to: note,
        shopId: z.guid().nullable(),
        amount,
        entryId: z.guid(),
      }),
    ]),
  }),
  z.object({ kind: z.literal("moved"), to: note, shopId: z.guid().nullable() }),
]);

const aboutSchema = z.object({
  planned: z.object({
    name: z.string().max(200),
    quantity: z.number().nullable(),
    unit: z.string().max(12).nullable(),
    date: z.string().refine(isIsoDate),
    place: z.enum(PLACES),
    shopId: z.string().max(64).nullable(),
  }),
  item: z.string().min(1).max(200),
  shop: z.string().max(64).nullable(),
});

const tickSchema = z.object({
  id: z.string().min(1).max(64),
  note,
  key: z.string().min(1).max(200),
  checked: z.boolean(),
  decision: decisionSchema.optional(),
  about: aboutSchema.optional(),
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
  const decisions = body.data.ticks.flatMap((raw) => {
    const parsed = tickSchema.safeParse(raw);
    const trip = parsed.success ? readNoteId(parsed.data.note) : null;
    if (!parsed.success || !trip || !isNote(trip)) {
      const id = (raw as { id?: unknown } | null)?.id;
      if (typeof id === "string") refused.push(id);
      return [];
    }
    const { id, key, checked, at, about } = parsed.data;
    // A tick of the app before decisions: bought, or open again.
    const decision = (parsed.data.decision ??
      (checked ? { kind: "bought" } : { kind: "open" })) as Decision;
    return [{ id, note: trip, key, decision, at: new Date(at), about }];
  });

  const answer = await applyDecisions(await createSessionClient(), household, decisions);
  return Response.json(
    { taken: answer.taken, refused: [...refused, ...answer.refused] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
