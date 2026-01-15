import pino from 'pino';
import { z } from 'zod';

const LogLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

export const logger = pino({
  level: LogLevelSchema.safeParse(process.env.LOG_LEVEL).data ?? 'info',
  base: { service: 'akpaddyy' },
  redact: ['DISCORD_TOKEN', 'EBAY_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY', 'DATABASE_URL', 'SEVENTEENTRACK_API_KEY'],
});
