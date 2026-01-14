import 'dotenv/config';

import { createApp } from './app.js';
import { logger } from './logger.js';

await createApp().then(
  ({ stop }) => {
    const shutdown = async (signal: NodeJS.Signals) => {
      logger.info({ signal }, 'Shutting down');
      await stop();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  },
  (error) => {
    logger.fatal({ error }, 'Failed to start');
    process.exit(1);
  },
);
