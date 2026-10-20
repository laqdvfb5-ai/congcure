import pg from 'pg';

// BIGINT (oid 20) -> number. All money values are < 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

const g = globalThis as typeof globalThis & { __web12Pool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!g.__web12Pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    g.__web12Pool = new pg.Pool({ connectionString, max: 10 });
  }
  return g.__web12Pool;
}

export async function closePool(): Promise<void> {
  if (g.__web12Pool) {
    const p = g.__web12Pool;
    g.__web12Pool = undefined;
    await p.end();
  }
}
