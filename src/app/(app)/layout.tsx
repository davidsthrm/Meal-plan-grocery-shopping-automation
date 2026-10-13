import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { NoteIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { requireHousehold } from "@/server/auth";
import { countRestock } from "@/server/shopping/restock";
import { createSessionClient } from "@/server/supabase/server";
import { signOut } from "../login/actions";

/**
 * Frame for every page behind the login: header, main sections, sign out. The note for
 * what ran out at home is one tap away from everywhere, with the number of its entries.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const household = await requireHousehold();
  const noted = await countRestock(await createSessionClient());
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
          <Link
            href="/merkzettel"
            className="btn min-h-10 gap-1.5 border-note-line bg-note px-3 text-sm"
            aria-label={`Merkzettel, ${noted === 1 ? "1 Eintrag" : `${noted} Einträge`}`}
          >
            <NoteIcon />
            Merkzettel
            {noted > 0 && <span className="tabular-nums">{noted}</span>}
          </Link>
          {/* On a phone the header has no room for it: signing out is at the foot of the page. */}
          <form action={signOut} className="hidden items-center gap-3 sm:flex">
            <span className="hidden text-sm text-muted lg:inline">{household.name}</span>
            <button className="btn min-h-10 px-3 text-sm">Abmelden</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
      <form
        action={signOut}
        className="mx-auto mt-12 flex max-w-5xl items-center justify-between gap-3 border-t border-line pt-4 sm:hidden print:hidden"
      >
        <span className="text-sm text-muted">{household.name}</span>
        <button className="btn min-h-10 px-3 text-sm">Abmelden</button>
      </form>
      <div className="sm:hidden print:hidden">
        <AppNav />
      </div>
    </div>
  );
}
