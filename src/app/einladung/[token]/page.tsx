import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { SheetHoles } from "@/components/sheet-holes";
import { familyName, firstName } from "@/domain/family";
import { findInvite } from "@/server/family";
import { createSessionClient } from "@/server/supabase/server";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Einladung", robots: { index: false } };

/**
 * Where an invitation link leads: the one page besides the login that is open to someone
 * without an account. It greets whoever opens it, says which household invites and who,
 * and takes the three things an account needs on a sheet of the pad.
 */
export default async function InvitePage(props: PageProps<"/einladung/[token]">) {
  const { token } = await props.params;
  const db = await createSessionClient();
  const [invite, membership] = await Promise.all([
    findInvite(token),
    db.from("household_member").select("household_id").limit(1),
  ]);
  // Signed in and in a household. An account without one may use the invitation.
  const signedIn = (membership.data ?? []).length > 0;
  const family = invite ? familyName(invite.householdName) : null;
  const inviter = firstName(invite?.inviterName);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="flex items-center gap-2.5">
        <LogoMark className="h-11 w-11" />
        <span className="text-2xl font-bold tracking-tight">
          Essens<span className="text-accent">plan</span>
        </span>
      </div>
      {signedIn ? (
        <>
          <p className="mt-6 text-muted">
            Du bist schon angemeldet und gehörst zu einem Haushalt. Eine Einladung ist für jemanden,
            der noch zu keinem gehört.
          </p>
          <Link href="/" className="btn btn-primary mt-6">
            Zum Wochenplan
          </Link>
        </>
      ) : invite ? (
        <>
          {inviter && <p className="eyebrow mt-8">Einladung von {inviter}</p>}
          <h1 className={`greeting ${inviter ? "mt-1" : "mt-8"}`}>Hallo!</h1>
          <p className="mt-3 text-lg leading-snug">
            Du wurdest zur Essensplanung{" "}
            {family ? (
              <>
                der <span className="font-semibold">{family}</span>
              </>
            ) : (
              <>
                von <span className="font-semibold">{invite.householdName}</span>
              </>
            )}{" "}
            eingeladen.
          </p>
          <p className="mt-2 text-muted">
            Ihr plant hier zusammen die Woche, und die Einkaufszettel schreiben sich daraus.
          </p>
          <div className="sheet mt-7">
            <SheetHoles />
            <div className="p-5">
              <p className="mb-4 font-semibold">
                Dein Name, deine E-Mail und ein Passwort, dann bist du dabei.
              </p>
              <JoinForm token={token} />
            </div>
          </div>
          <p className="mt-6 text-sm text-muted">
            Mit E-Mail und Passwort meldest du dich später auch auf anderen Geräten an.
          </p>
        </>
      ) : (
        <>
          <h1 className="title mt-8">Diese Einladung gilt nicht mehr</h1>
          <p className="mt-3 text-muted">
            Sie wurde schon benutzt, zurückgezogen, oder sie ist älter als eine Woche. Bitte um
            einen neuen Link.
          </p>
          <Link href="/login" className="btn mt-6">
            Zur Anmeldung
          </Link>
        </>
      )}
    </main>
  );
}
