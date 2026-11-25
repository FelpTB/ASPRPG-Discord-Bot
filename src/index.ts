import { readFileSync } from 'node:fs';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { carregarConfig } from './config.js';
import { logger } from './logger.js';

const config = carregarConfig(process.env, JSON.parse(readFileSync('config.json', 'utf8')));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.once(Events.ClientReady, (c) => logger.info(`Online como ${c.user.tag}`));

async function encerrar() {
  logger.info('Encerrando...');
  await client.destroy();
  process.exit(0);
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);

await client.login(config.discordToken);
