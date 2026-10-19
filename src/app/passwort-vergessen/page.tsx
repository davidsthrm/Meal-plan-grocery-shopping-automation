import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Passwort vergessen" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Asks for the e-mail address of an account and sends a link to set a new password. */
export default async function ForgotPasswordPage(props: PageProps<"/passwort-vergessen">) {
  const params = await props.searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <LogoMark className="mb-4 h-14 w-14" />
      <h1 className="text-3xl font-bold tracking-tight">Passwort vergessen</h1>
      <p className="mt-1 mb-8 text-muted">
        Gib die E-Mail-Adresse deines Kontos ein. Du bekommst einen Link, mit dem du ein neues
        Passwort festlegst.
      </p>
      {one(params.fehler) === "link" && (
        <p role="alert" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-warn">
          Der Link gilt nicht mehr, oder er wurde auf einem anderen Gerät geöffnet als dem, auf dem
          er angefordert wurde. Fordere hier einen neuen an.
        </p>
      )}
      <ResetForm />
      <Link href="/login" className="link mt-6 text-sm">
        ← Zur Anmeldung
      </Link>
    </main>
  );
}
