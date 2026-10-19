import type { Metadata } from "next";
import { signOut } from "../login/actions";

export const metadata: Metadata = { title: "Kein Haushalt" };

/**
 * Shown to a signed-in account that belongs to no household: it left one, or was removed.
 * Signing out here forgets what the device kept for the shop.
 */
export default function NoHouseholdPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Kein Haushalt</h1>
      <p className="mt-2 text-muted">
        Dein Konto gehört zu keinem Haushalt. Wer dich dabeihaben möchte, schickt dir eine
        Einladung: mit ihr kommst du mit diesem Konto wieder dazu.
      </p>
      <form action={signOut} data-sign-out className="mt-6">
        <button className="btn w-full">Abmelden</button>
      </form>
    </main>
  );
}
