import { NextResponse, type NextRequest } from "next/server";
import { middleOf } from "@/domain/address-search";
import { must } from "@/server/catalog";
import { requireHousehold } from "@/server/auth";
import { searchAddresses } from "@/server/supermarket-search";
import { createSessionClient } from "@/server/supabase/server";

/** Fewer letters than this find half the streets of a town. */
const FEWEST = 3;

/**
 * Addresses for the street of a market while it is typed (`AddressField`), near the
 * household's markets on the map. Through the server, so that Photon hears who asks and
 * the household's area stays here.
 */
export async function GET(request: NextRequest) {
  const typed = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (typed.length < FEWEST) return NextResponse.json([]);
  const household = await requireHousehold();
  const db = await createSessionClient();
  const placed = must(
    await db.from("shop").select("lat, lon").not("lat", "is", null).limit(200),
    "load the places of the shops",
  );
  const near = middleOf(placed.map((row) => ({ lat: row.lat as number, lon: row.lon as number })));
  const suggestions = await searchAddresses(typed, {
    near,
    postalCode: household.postalCode,
    place: household.placeName,
  });
  return NextResponse.json(suggestions, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
