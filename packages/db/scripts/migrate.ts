import { closePool, getPool, loadEnv, migrate } from '../src/index';

loadEnv();
const applied = await migrate(getPool());
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to migrate');
await closePool();
