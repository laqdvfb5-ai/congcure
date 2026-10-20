import { closePool, getPool } from '../src/index';
import { loadEnv, migrate } from '../src/node';

loadEnv();
const applied = await migrate(getPool());
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to migrate');
await closePool();
