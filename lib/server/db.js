import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
let pool;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  if (!pool) {
    pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000});
    pool.on('error', error => console.error('Database pool error:', error.code || 'connection error'));
    if (process.env.VERCEL) attachDatabasePool(pool);
  }
  return pool;
}
