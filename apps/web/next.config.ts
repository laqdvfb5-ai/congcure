import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// Single .env at the repo root, shared with worker and scripts.
const rootEnv = path.resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  transpilePackages: ['@web12/core', '@web12/db'],
  serverExternalPackages: ['pg', 'pg-boss'],
  agentRules: false,
};

export default config;
