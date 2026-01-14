import 'dotenv/config';

import { REST, Routes } from 'discord.js';
import { z } from 'zod';

import { getCommandsJson } from '../bot/commands.js';
import { logger } from '../logger.js';

const DiscordEnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_DEV_GUILD_ID: z.string().min(1).optional(),
});

const discordEnv = DiscordEnvSchema.parse(process.env);

const rest = new REST({ version: '10' }).setToken(discordEnv.DISCORD_TOKEN);

try {
  const body = getCommandsJson();

  if (discordEnv.DISCORD_DEV_GUILD_ID) {
    logger.info({ guildId: discordEnv.DISCORD_DEV_GUILD_ID }, 'Deploying guild commands');
    await rest.put(
      Routes.applicationGuildCommands(discordEnv.DISCORD_CLIENT_ID, discordEnv.DISCORD_DEV_GUILD_ID),
      { body },
    );
    logger.info('Deployed guild commands');
  } else {
    logger.info('Deploying global commands');
    await rest.put(Routes.applicationCommands(discordEnv.DISCORD_CLIENT_ID), { body });
    logger.info('Deployed global commands');
  }
} catch (error) {
  logger.fatal({ error }, 'Failed to deploy commands');
  process.exit(1);
}
