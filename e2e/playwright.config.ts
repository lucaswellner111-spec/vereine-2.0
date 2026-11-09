import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-Tests gegen API (In-Memory-PGlite, Port 4000) und Web (Produktions-Build, Port 3000).
 * Web erreicht die API ueber den Next-Rewrite /api -> http://localhost:4000 (API_INTERNAL_URL).
 * - E2E_SKIP_BUILD=1: vorhandenen Web-Build nutzen (CI baut vorher).
 * - E2E_WEB_DEV=1: next dev statt Build (schneller beim Schreiben von Tests, weniger stabil).
 * Lokal laufende Server auf 3000/4000 werden wiederverwendet (nicht in CI).
 */
const CI = !!process.env.CI;
const webCommand = process.env.E2E_WEB_DEV
  ? "npm run dev -w @vereine/web"
  : process.env.E2E_SKIP_BUILD
    ? "npm run start -w @vereine/web"
    : "npm run build -w @vereine/web && npm run start -w @vereine/web";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : 3,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobil", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    {
      name: "api",
      command: "npm run dev:pglite -w @vereine/api",
      cwd: "..",
      url: "http://127.0.0.1:4000/health/ready",
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { API_PORT: "4000", WEB_ORIGIN: "http://localhost:3000" },
    },
    {
      name: "web",
      command: webCommand,
      cwd: "..",
      url: "http://localhost:3000/",
      reuseExistingServer: !CI,
      timeout: 300_000,
      env: { API_INTERNAL_URL: "http://localhost:4000", NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
