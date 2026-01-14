import mysql from 'mysql2/promise';

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';

import { logger } from '../../logger.js';
import * as schema from './schema/index.js';

export type AppDb = MySql2Database<typeof schema>;

export type DbClient = {
  db: AppDb;
  pool: mysql.Pool;
  close: () => Promise<void>;
};

export function createDbClient(databaseUrl: string): DbClient {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
  });

  const db = drizzle(pool, { schema, mode: 'default' });

  return {
    db,
    pool,
    async close() {
      logger.info('Closing DB pool');
      await pool.end();
    },
  };
}
