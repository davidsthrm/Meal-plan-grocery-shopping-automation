import "server-only";
import { headers } from "next/headers";

/**
 * Where the app is reached from, as the browser sees it: "https://essensplan.vercel.app".
 * For links that leave the app and lead back into it, such as an invitation. A link that
 * Supabase sends by e-mail is checked against its list of allowed addresses as well.
 */
export async function requestOrigin(): Promise<string> {
  const address = await headers();
  const host = address.get("x-forwarded-host") ?? address.get("host");
  return `${address.get("x-forwarded-proto") ?? "http"}://${host}`;
}
