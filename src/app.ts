import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';

import { commandMap } from './bot/commands.js';
import type { CommandContext } from './bot/types.js';
import { env } from './env.js';
import { startHttpServer } from './http/server.js';
import { createDbClient } from './infra/db/client.js';
import { logger } from './logger.js';
import { startSyncWorker } from './sync/sync-worker.js';

export type App = {
  stop: () => Promise<void>;
};

export async function createApp(): Promise<App> {
  logger.info(
    {
      node: process.version,
      environment: env.NODE_ENV,
    },
    'Starting',
  );

  const dbClient = createDbClient(env.DATABASE_URL);

  const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const ctx: CommandContext = {
    db: dbClient.db,
  };

  discordClient.once(Events.ClientReady, (client) => {
    logger.info({ userTag: client.user.tag }, 'Discord client ready');
  });

  discordClient.on(Events.InteractionCreate, (interaction) => {
    void (async () => {
      if (!interaction.isChatInputCommand()) return;

      const command = commandMap.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, ctx);
      } catch (error) {
        logger.error({ error, commandName: interaction.commandName }, 'Command failed');
        const content = 'Something went wrong while running that command. Please try again.';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
        } else {
          await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }
      }
    })();
  });

  await discordClient.login(env.DISCORD_TOKEN);

  const httpServer = await startHttpServer({ db: dbClient.db, discordClient });
  const syncWorker = startSyncWorker({ db: dbClient.db, discordClient });

  return {
    async stop() {
      await syncWorker.stop();
      await httpServer.stop();
      await discordClient.destroy();
      await dbClient.close();
      logger.info('Stopped');
    },
  };
}
