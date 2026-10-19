import { defineConfig, devices } from "@playwright/test";

// The test login lives in .env.local (created by `npm run e2e:setup`).
process.loadEnvFile(".env.local");

// Next.js allows only one dev server per project. If `npm run dev` is already running, point
// the tests at it: `E2E_PORT=3000 npm run e2e`.
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  // The made-up cookbook of the tests is removed from the test household after every run.
  globalTeardown: "./e2e/teardown.ts",
  // The tests share one test household, so they must not run side by side.
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "de-DE",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["iPhone 14"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // An iPad, for the screenshots only: the flows are the phone's and the desktop's.
    {
      name: "tablet",
      use: { ...devices["iPad (gen 7)"], browserName: "chromium" },
      grep: /@look/,
    },
    // The same iPad held across: the week and the recipes as they are planned on it.
    {
      name: "tablet-landscape",
      use: { ...devices["iPad (gen 7) landscape"], browserName: "chromium" },
      grep: /@look/,
    },
  ],
  webServer: {
    // The test of the shop without a connection needs a production build (`e2e:offline`).
    command: process.env.E2E_PROD
      ? `npx next build && npx next start --port ${PORT}`
      : `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: process.env.E2E_PROD ? 600_000 : 120_000,
  },
});
