import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ForgetSignedOut } from "@/components/service-worker";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <LogoMark className="mb-4 h-14 w-14" />
      <h1 className="text-3xl font-bold tracking-tight">
        Essens<span className="text-accent">plan</span>
      </h1>
      <p className="mt-1 mb-8 text-muted">Wochenplan und Einkaufsliste</p>
      {params.verlassen === "1" && (
        <p role="status" className="mb-4 rounded-lg bg-accent-soft px-3 py-2">
          Du hast den Haushalt verlassen und bist abgemeldet.
        </p>
      )}
      {params.vorschau === "1" && (
        <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-warn">
          Das ist eine Vorschau zum Testen. Hier kann sich nur der Test-Haushalt anmelden
          {process.env.VERCEL_PROJECT_PRODUCTION_URL && (
            <>
              ; die App selbst ist unter{" "}
              <a
                className="link underline"
                href={`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`}
              >
                {process.env.VERCEL_PROJECT_PRODUCTION_URL}
              </a>
            </>
          )}
          .
        </p>
      )}
      <LoginForm />
      <p className="mt-6 text-sm text-muted">
        <Link href="/passwort-vergessen" className="link">
          Passwort vergessen?
        </Link>
      </p>
      <p className="mt-2 text-sm text-muted">Zugang gibt es nur auf Einladung.</p>
      <ForgetSignedOut />
    </main>
  );
}
