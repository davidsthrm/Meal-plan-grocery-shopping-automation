import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { SettingsIcon } from "@/components/icons";
import { LiveRefresh } from "@/components/live-refresh";
import { Logo } from "@/components/logo";
import { NoteDrawer } from "@/components/note-drawer";
import { today } from "@/lib/today";
import { requireHousehold } from "@/server/auth";
import { loadRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";
import { signOut } from "../login/actions";

/**
 * Frame for every page behind the login: header, main sections, sign out. The note for
 * what ran out at home is one tap away from everywhere, with the number of its entries.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const household = await requireHousehold();
  const noted = await loadRestock(await createSessionClient(), household, today());
  return (
    <div className="min-h-dvh px-4 pb-24 sm:pb-10 print:p-0">
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
          {/* On a phone the header has no room for it: signing out is at the foot of the page. */}
          <Link
            href="/einstellungen"
            className="btn hidden min-h-10 px-2.5 sm:inline-flex"
            aria-label="Einstellungen"
            title={household.name}
          >
            <SettingsIcon />
          </Link>
          <form action={signOut} className="hidden sm:block">
            <button className="btn min-h-10 px-3 text-sm">Abmelden</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
      <LiveRefresh />
      <form
        action={signOut}
        className="mx-auto mt-12 flex max-w-5xl items-center justify-between gap-3 border-t border-line pt-4 sm:hidden print:hidden"
      >
        <Link href="/einstellungen" className="link inline-flex min-h-10 items-center gap-1.5">
          <SettingsIcon />
          Einstellungen
        </Link>
        <button className="btn min-h-10 px-3 text-sm">Abmelden</button>
      </form>
      <div className="sm:hidden print:hidden">
        <AppNav />
      </div>
    </div>
  );
}
