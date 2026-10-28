import Link from "next/link";
import { Suspense, ViewTransition } from "react";
import { AppNav } from "@/components/app-nav";
import { NavigationProgress } from "@/components/navigation-progress";
import { ConnectionGuard } from "@/components/connection";
import { NoteIcon, SettingsIcon } from "@/components/icons";
import { InstallHintCard } from "@/components/install-hint";
import { LiveRefresh } from "@/components/live-refresh";
import { Logo } from "@/components/logo";
import { NoteDrawer } from "@/components/note-drawer";
import { initialOf } from "@/domain/family";
import { today } from "@/lib/today";
import { PAGE_MOTION } from "@/lib/transitions";
import { loadSelf } from "@/server/auth";
import { loadOwnRestock } from "@/server/shopping/restock";

/**
 * Frame for every page behind the login: header and main sections. The note for what ran
 * out at home is one tap away from everywhere, with the number of its entries, and next to
 * it the settings, behind the first letter of whoever is signed in. Signing out is in the
 * settings, under "Dein Konto": the family asked for it off every main section (October
 * 2026).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  // Nothing is awaited here: the frame and the page's loading shape go out at once, and the
  // count of the Merkzettel and the initial follow. Waiting for them, opening the app showed
  // nothing at all until they were read (October 2026).
  return (
    // On a phone the sections float above the bottom of the screen: the page leaves room for
    // them and for the bar the phone itself keeps there. Coming from the welcome, the whole
    // app rises into place (`.app-in`); any other way in, it is simply there.
    <ViewTransition enter={{ willkommen: "app-in", default: "none" }} default="none">
      <div className="app-shell min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-10 print:p-0">
        <NavigationProgress />
        {/* Paper gets the content only: no header, no navigation. */}
        <header className="app-header mx-auto flex max-w-5xl items-center justify-between gap-4 pt-2.5 pb-3.5 print:hidden">
          <Link href="/" aria-label="Essensplan, zum Wochenplan">
            <Logo />
          </Link>
          <div className="hidden sm:block">
            <AppNav />
          </div>
          <div className="flex items-center gap-2">
            <Suspense fallback={<NoteButtonWaiting />}>
              <HeaderNote />
            </Suspense>
            <Suspense fallback={<AccountWaiting />}>
              <HeaderAccount />
            </Suspense>
          </div>
        </header>
        <InstallHintCard />
        <main>
          {/* A page follows the one before it as its link says: from the right going in, from
              the left going back, cross-faded for another view of the same thing. */}
          <ViewTransition update={PAGE_MOTION} default="none">
            <div className="page">{children}</div>
          </ViewTransition>
        </main>
        <LiveRefresh />
        <ConnectionGuard />
        <div className="sm:hidden print:hidden">
          <AppNav floating />
        </div>
      </div>
    </ViewTransition>
  );
}

/** The Merkzettel with the number of its entries, pulled down over any page. */
async function HeaderNote() {
  return <NoteDrawer items={await loadOwnRestock(today())} />;
}

/** Until its entries are read: the same button, a plain way to the note's page. */
function NoteButtonWaiting() {
  return (
    <Link
      href="/merkzettel"
      className="btn min-h-11 gap-1.5 border-note-line bg-note px-3 text-sm"
      aria-label="Merkzettel"
    >
      <NoteIcon />
      Merkzettel
    </Link>
  );
}

/** The way to the settings, behind the first letter of whoever is signed in. */
async function HeaderAccount() {
  const { name } = await loadSelf();
  return (
    <Link
      href="/einstellungen"
      className="account"
      aria-label="Einstellungen"
      title={name ? `${name} · Einstellungen` : "Einstellungen"}
    >
      {initialOf(name) ?? <SettingsIcon />}
    </Link>
  );
}

/** Until the name is read: the green circle without its letter. */
function AccountWaiting() {
  return <Link href="/einstellungen" className="account" aria-label="Einstellungen" />;
}
