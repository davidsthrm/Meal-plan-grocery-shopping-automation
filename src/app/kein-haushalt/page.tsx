import type { Metadata } from "next";
import { signOut } from "../login/actions";

export const metadata: Metadata = { title: "Kein Haushalt" };

/** Shown to a signed-in account that has not been added to the household yet. */
export default function NoHouseholdPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Fast geschafft</h1>
      <p className="mt-2 text-muted">
        Dein Konto ist angelegt, aber noch keinem Haushalt zugeordnet. Sag David Bescheid, er
        schaltet dich frei.
      </p>
      <form action={signOut} className="mt-6">
        <button className="btn w-full">Abmelden</button>
      </form>
    </main>
  );
}
