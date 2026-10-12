import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { requireHousehold } from "@/server/auth";
import { signOut } from "../login/actions";

/** Frame for every page behind the login: header, main sections, sign out. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const household = await requireHousehold();
  return (
    <div className="min-h-dvh px-4 pb-24 sm:pb-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Essensplan
        </Link>
        <div className="hidden sm:block">
          <AppNav />
        </div>
        <form action={signOut} className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{household.name}</span>
          <button className="btn min-h-10 px-3 text-sm">Abmelden</button>
        </form>
      </header>
      <main>{children}</main>
      <div className="sm:hidden">
        <AppNav />
      </div>
    </div>
  );
}
