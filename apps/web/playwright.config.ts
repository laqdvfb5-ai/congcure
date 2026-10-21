import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const envFile = path.resolve("../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const testDb = process.env.DATABASE_URL_TEST;
if (
  !testDb ||
  testDb === process.env.DATABASE_URL ||
  !new URL(testDb).pathname.endsWith("_test")
) {
  throw new Error(
    "UI tests require a separate DATABASE_URL_TEST ending in _test",
  );
}

export default defineConfig({
  testDir: "./test",
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:3002",
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: {
    command: "node ../../node_modules/next/dist/bin/next dev -p 3002",
    url: "http://localhost:3002",
    env: {
      DATABASE_URL: testDb,
      WEB12_DIST_DIR: ".next/e2e",
      PRODUCT_IMAGE_DIR: path.resolve("test-results/product-images"),
      BANK_ID: "MB",
      BANK_ACCOUNT: "1234567890",
      BANK_ACCOUNT_NAME: "UI TEST",
    },
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
