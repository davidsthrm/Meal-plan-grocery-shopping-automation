import Link from "next/link";
import { ViewTransition } from "react";
import { AppNav } from "@/components/app-nav";
import { ConnectionGuard } from "@/components/connection";
import { SettingsIcon } from "@/components/icons";
import { InstallHintCard } from "@/components/install-hint";
import { LiveRefresh } from "@/components/live-refresh";
import { Logo } from "@/components/logo";
import { NoteDrawer } from "@/components/note-drawer";
import { initialOf } from "@/domain/family";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";

/**
 * Frame for every page behind the login: header and main sections. The note for what ran
 * out at home is one tap away from everywhere, with the number of its entries, and next to
 * it the settings, behind the first letter of whoever is signed in. Signing out is in the
 * settings, under "Dein Konto": the family asked for it off every main section (October
 * 2026).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const household = await requireHousehold();
  const db = await createSessionClient();
  const [noted, self] = await Promise.all([
    loadRestock(db, household, today()),
    db
      .from("household_member")
      .select("display_name")
      .eq("user_id", household.userId)
      .maybeSingle(),
  ]);
  const name = self.data?.display_name ?? null;
  const initial = initialOf(name);
  return (
    // On a phone the sections float above the bottom of the screen: the page leaves room for
    // them and for the bar the phone itself keeps there. Coming from the welcome, the whole
    // app rises into place (`.app-in`); any other way in, it is simply there.
    <ViewTransition enter={{ willkommen: "app-in", default: "none" }} default="none">
      <div className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-10 print:p-0">
        {/* Paper gets the content only: no header, no navigation. */}
        <header className="app-header mx-auto flex max-w-5xl items-center justify-between gap-4 pt-2.5 pb-3.5 print:hidden">
          <Link href="/" aria-label="Essensplan, zum Wochenplan">
            <Logo />
          </Link>
          <div className="hidden sm:block">
            <AppNav />
          </div>
          <div className="flex items-center gap-2">
            <NoteDrawer items={noted} />
            <Link
              href="/einstellungen"
              className="account"
              aria-label="Einstellungen"
              title={name ? `${name} · Einstellungen` : "Einstellungen"}
            >
              {initial ?? <SettingsIcon />}
            </Link>
          </div>
        </header>
        <InstallHintCard />
        <main>{children}</main>
        <LiveRefresh />
        <ConnectionGuard />
        <div className="sm:hidden print:hidden">
          <AppNav floating />
        </div>
      </div>
    </ViewTransition>
  );
}
