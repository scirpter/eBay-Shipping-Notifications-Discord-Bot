import { z } from 'zod';

const LogLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return numberValue;
}

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: LogLevelSchema.default('info'),
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_DEV_GUILD_ID: z.string().min(1).optional(),
    DATABASE_URL: z.string().min(1),
    TOKEN_ENCRYPTION_KEY: z.string().min(1),
    EBAY_CLIENT_ID: z.string().min(1),
    EBAY_CLIENT_SECRET: z.string().min(1),
    // eBay OAuth uses a RuName value (named redirect_uri), not the full callback URL.
    EBAY_REDIRECT_URI: z.string().min(1),
    EBAY_ENVIRONMENT: z.enum(['sandbox', 'production']).default('production'),
    EBAY_OAUTH_SCOPES: z.string().min(1).default('https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly'),
    HTTP_PORT: z.string().optional(),
    SEVENTEENTRACK_API_KEY: z.string().min(1).optional(),
  })
  .transform((value) => ({
    ...value,
    HTTP_PORT: parseNumber(value.HTTP_PORT, 3000),
  }));

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
