import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { INSTALL_HINT_KEY } from "../src/lib/install-hint";

// The test login lives in .env.local (created by `npm run e2e:setup`).
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

// Next.js allows only one dev server per project. If `npm run dev` is already running, point
// the tests at it: `E2E_PORT=3000 npm run e2e`.
const PORT = Number(process.env.E2E_PORT ?? 3100);
// A deployment to test instead of a local server: the smoke test of production
// (`npm run e2e:production`). It signs in as the test household like every other test.
const DEPLOYED = process.env.E2E_BASE_URL;
const BASE_URL = DEPLOYED ?? `http://localhost:${PORT}`;
// The family opens the app from the home screen, where it shows no hint to install it. In
// WebKit the page is Safari's, which shows that hint above every page: it starts put away.
const INSTALLED = {
  cookies: [],
  origins: [{ origin: BASE_URL, localStorage: [{ name: INSTALL_HINT_KEY, value: "1" }] }],
};

export default defineConfig({
  testDir: ".",
  // The made-up cookbook of the tests is removed from the test household after every run.
  globalTeardown: "./teardown.ts",
  // The tests share one test household, so they must not run side by side.
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
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
    // The family's iPhones and iPads draw with WebKit, and some bugs show only there: Enter on
    // a word of a datalist, focus rings on sheets, the height of a select, the Vorrat's columns
    // (audit of November 2026). The tests tagged @webkit run in it too.
    {
      name: "phone-webkit",
      use: { ...devices["iPhone 14"], browserName: "webkit", storageState: INSTALLED },
      grep: /@webkit/,
    },
    {
      name: "tablet-webkit",
      use: { ...devices["iPad (gen 7)"], browserName: "webkit", storageState: INSTALLED },
      grep: /@webkit/,
    },
  ],
  webServer: DEPLOYED
    ? undefined
    : {
        // The test of the shop without a connection needs a production build (`e2e:offline`).
        command: process.env.E2E_PROD
          ? `npx next build && npx next start --port ${PORT}`
          : `npx next dev --port ${PORT}`,
        // The app lives one folder up; Playwright starts commands in the config's folder.
        cwd: "..",
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: true,
        timeout: process.env.E2E_PROD ? 600_000 : 120_000,
      },
});
