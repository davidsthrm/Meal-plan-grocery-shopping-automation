import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Essensplan",
  description: "Wochenplan und Einkaufsliste für unseren Haushalt",
  // Private household app: keep it out of search engines.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
