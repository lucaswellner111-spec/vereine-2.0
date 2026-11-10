import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-Tests gegen API (In-Memory-PGlite, Port 4000) und Web (Produktions-Build, Port 3000).
 * Web erreicht die API ueber den Next-Rewrite /api -> http://localhost:4000 (API_INTERNAL_URL).
 * - E2E_SKIP_BUILD=1: vorhandenen Web-Build nutzen (CI baut vorher).
 * - E2E_WEB_DEV=1: next dev statt Build (schneller beim Schreiben von Tests, weniger stabil).
 * - E2E_WEB_PORT/E2E_API_PORT: andere Ports, wenn 3000/4000 belegt sind (z. B. Dev-Server einer anderen Session).
 * Lokal laufende Server auf diesen Ports werden wiederverwendet (nicht in CI).
 */
const CI = !!process.env.CI;
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3000";
const API_PORT = process.env.E2E_API_PORT ?? "4000";
const WEB_URL = `http://localhost:${WEB_PORT}`;
process.env.E2E_BASE_URL = WEB_URL; // fuer Tests und Fixtures
const webCommand = process.env.E2E_WEB_DEV
  ? `npx next dev -p ${WEB_PORT}`
  : process.env.E2E_SKIP_BUILD
    ? `npx next start -p ${WEB_PORT}`
    : `npx next build && npx next start -p ${WEB_PORT}`;

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
    baseURL: WEB_URL,
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
      url: `http://127.0.0.1:${API_PORT}/health/ready`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { API_PORT, WEB_ORIGIN: WEB_URL },
    },
    {
      name: "web",
      command: webCommand,
      cwd: "../apps/web",
      url: `${WEB_URL}/`,
      reuseExistingServer: !CI,
      timeout: 300_000,
      env: { API_INTERNAL_URL: `http://localhost:${API_PORT}`, NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
