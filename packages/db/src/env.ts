import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Repo-root .env: packages/db/src -> ../../../.env
const ROOT_ENV = fileURLToPath(new URL('../../../.env', import.meta.url));

export function loadEnv(): void {
  // process.loadEnvFile does not override variables that are already set.
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
}
