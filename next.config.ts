import type { NextConfig } from "next";

/**
 * Sent with every answer. No page is shown inside another site's frame, nothing is read as a
 * type it does not say it is, and a link out of the app (a logo, the map) tells the other
 * site no more than the app's address: an invitation's secret is part of its path. Scripts
 * are not limited here: the pages need Next.js's inline scripts, and the household's data is
 * guarded by the login and row level security, not by the page.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Every page of this app is private and reads the signed-in household's data on each
  // request, so there is nothing to prerender or cache. Cache Components would only add
  // Suspense boundaries around everything.
  cacheComponents: false,
  // Recipe photos are uploaded straight to storage, but form posts with long ingredient lists
  // should not hit the 1 MB default either.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    // A page seen in the last 30 seconds comes back at once from the browser's memory: going
    // to another tab and back waited 0.4 to 0.8 seconds each time (October 2026). A change of
    // the household refreshes it as before: `router.refresh()` (LiveRefresh) and the answer
    // to every form clear this memory.
    staleTimes: { dynamic: 30 },
  },
  // The service worker is fetched again on every visit, so that a new version arrives at
  // once. It may load nothing from anywhere else but the supermarkets' logos, which it keeps
  // for the shop: Wikimedia Commons sends them on from another of its servers.
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; connect-src 'self' https://*.wikimedia.org",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
