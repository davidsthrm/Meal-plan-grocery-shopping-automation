import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page of this app is private and reads the signed-in household's data on each
  // request, so there is nothing to prerender or cache. Cache Components would only add
  // Suspense boundaries around everything.
  cacheComponents: false,
  // Recipe photos are uploaded straight to storage, but form posts with long ingredient lists
  // should not hit the 1 MB default either.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
