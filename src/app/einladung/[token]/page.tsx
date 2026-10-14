import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { familyName } from "@/domain/family";
import { findInvite } from "@/server/family";
import { createSessionClient } from "@/server/supabase/server";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Einladung", robots: { index: false } };

/**
 * Where an invitation link leads: the one page besides the login that is open to someone
 * without an account. It says which household invites, and takes what an account needs.
 */
export default async function InvitePage(props: PageProps<"/einladung/[token]">) {
  const { token } = await props.params;
  const [invite, session] = await Promise.all([
    findInvite(token),
    (await createSessionClient()).auth.getClaims(),
  ]);
  const signedIn = Boolean(session.data?.claims);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <LogoMark className="mb-4 h-14 w-14" />
      <h1 className="text-3xl font-bold tracking-tight">
        Essens<span className="text-accent">plan</span>
      </h1>
      {signedIn ? (
        <>
          <p className="mt-3 text-muted">
            Du bist schon angemeldet und gehörst zu einem Haushalt. Eine Einladung ist für jemanden,
            der noch kein Konto hat.
          </p>
          <Link href="/" className="btn btn-primary mt-6">
            Zum Wochenplan
          </Link>
        </>
      ) : invite ? (
        <>
          <p className="mt-1 mb-8 text-muted">
            {familyName(invite.householdName) ? (
              <span className="font-semibold text-ink">
                Die {familyName(invite.householdName)} laden dich ein:
              </span>
            ) : (
              <>
                <span className="font-semibold text-ink">{invite.householdName}</span> lädt dich
                ein:
              </>
            )}{" "}
            derselbe Wochenplan, dieselben Einkaufszettel, mit deinem eigenen Konto.
          </p>
          <JoinForm token={token} />
        </>
      ) : (
        <>
          <p className="mt-3 text-muted">
            Diese Einladung gilt nicht mehr: sie wurde schon benutzt, zurückgezogen, oder sie ist
            älter als eine Woche. Bitte um eine neue.
          </p>
          <Link href="/login" className="btn mt-6">
            Zur Anmeldung
          </Link>
        </>
      )}
    </main>
  );
}
