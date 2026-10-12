import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-3xl font-semibold">Essensplan</h1>
      <p className="mt-1 mb-8 text-muted">Wochenplan und Einkaufsliste</p>
      <LoginForm />
      <p className="mt-6 text-sm text-muted">
        Zugang gibt es nur auf Einladung. Passwort vergessen? Frag David.
      </p>
    </main>
  );
}
