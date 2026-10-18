import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page of this app is private and reads the signed-in household's data on each
  // request, so there is nothing to prerender or cache. Cache Components would only add
  // Suspense boundaries around everything.
  cacheComponents: false,
  // Recipe photos are uploaded straight to storage, but form posts with long ingredient lists
  // should not hit the 1 MB default either.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The service worker is fetched again on every visit, so that a new version arrives at
  // once, and may load nothing from anywhere else.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
