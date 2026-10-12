import { defineConfig, devices } from "@playwright/test";

// The test login lives in .env.local (created by `npm run e2e:setup`).
process.loadEnvFile(".env.local");

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
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
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
