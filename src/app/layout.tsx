import type { Metadata, Viewport } from "next";
import { AppFeel, TurnUpright } from "@/components/app-feel";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Essensplan", template: "%s · Essensplan" },
  description: "Wochenplan und Einkaufsliste für unseren Haushalt",
  // Private household app: keep it out of search engines.
  robots: { index: false, follow: false },
  // On the iPhone's home screen: its own name, without Safari's bars.
  appleWebApp: { capable: true, title: "Essensplan", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The page reaches the edges of the screen, and says itself where the phone keeps its own
  // bars (`env(safe-area-inset-*)`): the sections float clear of the iPhone's home bar.
  viewportFit: "cover",
  // An app does not zoom: the writing is large enough, and a field never zooms in by itself
  // (its text is 16px at least). Safari also needs `AppFeel` for pinching.
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f7f4ee",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de">
      <body>
        {children}
        <ServiceWorker />
        <AppFeel />
        <TurnUpright />
      </body>
    </html>
  );
}
