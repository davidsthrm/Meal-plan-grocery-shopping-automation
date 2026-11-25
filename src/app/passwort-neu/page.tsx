import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Neues Passwort" };

/**
 * Where the link of a "Passwort vergessen" e-mail ends: it signed in, and the new password
 * is set here. Without a login the proxy sends to the login page.
 */
export default function NewPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <LogoMark className="mb-4 h-14 w-14" />
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Neues Passwort</h1>
      <NewPasswordForm />
    </main>
  );
}
