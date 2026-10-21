import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Single .env at the repo root, shared with worker and scripts.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  distDir: process.env.WEB12_DIST_DIR ?? ".next",
  devIndicators: false,
  transpilePackages: ["@web12/core", "@web12/db"],
  serverExternalPackages: ["pg", "pg-boss", "sharp"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  agentRules: false,
};

export default config;
