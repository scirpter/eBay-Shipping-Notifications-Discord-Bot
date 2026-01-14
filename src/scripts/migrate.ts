import 'dotenv/config';

import { migrate } from 'drizzle-orm/mysql2/migrator';
import { z } from 'zod';

import { createDbClient } from '../infra/db/client.js';
import { logger } from '../logger.js';

const DbEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const dbEnv = DbEnvSchema.parse(process.env);
const dbClient = createDbClient(dbEnv.DATABASE_URL);

try {
  await migrate(dbClient.db, { migrationsFolder: 'drizzle/migrations' });
  logger.info('Migrations applied');
  await dbClient.close();
} catch (error) {
  logger.fatal({ error }, 'Migration failed');
  await dbClient.close();
  process.exit(1);
}
