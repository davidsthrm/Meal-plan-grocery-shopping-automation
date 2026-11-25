import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { AppFeel, TurnUpright } from "@/components/app-feel";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";
import { startupImages } from "@/lib/startup-screens";

/**
 * One typeface, Figtree, in two weights: 500 for the text and 700 for what stands out. Served
 * by the app itself (`next/font`), so it needs no other site, and the service worker keeps
 * it with the scripts and styles for the shop (`/_next/static/`).
 */
const figtree = Figtree({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: { default: "Essensplan", template: "%s · Essensplan" },
  description: "Wochenplan und Einkaufsliste für unseren Haushalt",
  // Private household app: keep it out of search engines.
  robots: { index: false, follow: false },
  // On the iPhone's home screen: its own name, without Safari's bars.
  appleWebApp: {
    capable: true,
    title: "Essensplan",
    statusBarStyle: "default",
    // The installed app opens on the plate on the green, not on a white screen.
    startupImage: startupImages(),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The page reaches the edges of the screen, and says itself where the phone keeps its own
  // bars (`env(safe-area-inset-*)`): the header's paper reaches under the status bar, and
  // what stands at the foot keeps clear of the iPhone's home bar.
  viewportFit: "cover",
  // An app does not zoom: the writing is large enough, and a field never zooms in by itself
  // (its text is 16px at least). Safari also needs `AppFeel` for pinching.
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f7f4ee",
};

/**
 * A section tapped before the page has started. After a whole page has loaded
 * (the app opened, or loaded again), the phone shows it a moment before its scripts have
 * run, and a tab tapped then was a plain link: the browser loaded the whole page again, and
 * so did every further tap in that moment (David, 24 November 2026: "when changing tabs fast
 * it reloads the whole page sometimes"). This keeps the tap instead, and `AppNav` follows it
 * once it has started. Should the app's scripts never come, the browser follows it after a
 * few seconds, as before. It stands here because this layout is only ever drawn by the
 * server: a script React draws in the browser does not run.
 */
const EARLY_TAP = `document.addEventListener("click", function (event) {
  if (window.appNavStarted) return;
  var link = event.target instanceof Element && event.target.closest('nav[aria-label="Hauptbereiche"] a[href]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (!window.earlyTap) {
    setTimeout(function () {
      if (!window.appNavStarted) location.assign(window.earlyTap);
    }, 3000);
  }
  window.earlyTap = link.getAttribute("href");
}, true);`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={figtree.variable}>
      <body>
        {/* Ahead of the page, so that it listens before a section can be tapped. */}
        <script dangerouslySetInnerHTML={{ __html: EARLY_TAP }} />
        {children}
        <ServiceWorker />
        <AppFeel />
        <TurnUpright />
      </body>
    </html>
  );
}
