import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { ConnectionGuard } from "@/components/connection";
import { SettingsIcon } from "@/components/icons";
import { LiveRefresh } from "@/components/live-refresh";
import { Logo } from "@/components/logo";
import { NoteDrawer } from "@/components/note-drawer";
import { initialOf } from "@/domain/family";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";
import { signOut } from "../login/actions";

/**
 * Frame for every page behind the login: header, main sections, sign out. The note for
 * what ran out at home is one tap away from everywhere, with the number of its entries, and
 * next to it the settings, behind the first letter of whoever is signed in.
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
    // them and for the bar the phone itself keeps there.
    <div className="min-h-dvh px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-10 print:p-0">
      {/* Paper gets the content only: no header, no navigation. */}
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 py-4 print:hidden">
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
          {/* On a phone the header has no room for it: signing out is at the foot of the page. */}
          <form action={signOut} data-sign-out className="hidden sm:block">
            <button className="btn min-h-10 px-3 text-sm">Abmelden</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
      <LiveRefresh />
      <ConnectionGuard />
      <form
        action={signOut}
        data-sign-out
        className="mx-auto mt-12 flex max-w-5xl items-center justify-end gap-3 border-t border-line pt-4 sm:hidden print:hidden"
      >
        <button className="btn min-h-10 px-3 text-sm">Abmelden</button>
      </form>
      <div className="sm:hidden print:hidden">
        <AppNav floating />
      </div>
    </div>
  );
}
